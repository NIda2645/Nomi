import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// How nomiaqm.com serves marketing/ is decided by two files Cloudflare reads at deploy time:
// wrangler.json (which requests reach the site worker first) and marketing/_headers.
// Both are matched with Cloudflare's glob: `*` is `.*`, anchored at both ends
// (workers-shared asset-worker/src/utils/rules-engine.ts, generateGlobOnlyRuleRegExp).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const siteDir = path.join(root, 'marketing')
const config = JSON.parse(readFileSync(path.join(root, 'wrangler.json'), 'utf8'))

// Browsers seek audio/video with Range requests; Safari and every iOS browser refuse to
// play media from a server that ignores them, and Cloudflare's asset server does.
const MEDIA_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.ogv', '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.flac'])

function glob(pattern) {
  const source = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp(`^${source}$`)
}

function servedPaths(dir = siteDir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return servedPaths(full)
    if (entry.name.startsWith('_')) return [] // _headers / _redirects are config, not served
    return ['/' + path.relative(siteDir, full).split(path.sep).join('/')]
  })
}

function reachesWorkerFirst(pathname) {
  const rules = config.assets.run_worker_first
  if (!Array.isArray(rules)) return rules === true
  if (rules.some((rule) => rule.startsWith('!/') && glob(rule.slice(1)).test(pathname))) return false
  return rules.some((rule) => rule.startsWith('/') && glob(rule).test(pathname))
}

// Mirrors attachCustomHeaders: rules apply in file order; within a rule `! Name` unsets first,
// then each set replaces a default but appends when an earlier rule already set that header.
function parseHeaderRules(text) {
  const rules = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), set: [], unset: [] })
      continue
    }
    const rule = rules.at(-1)
    const entry = line.trim()
    if (entry.startsWith('!')) rule.unset.push(entry.slice(1).trim().toLowerCase())
    else {
      const colon = entry.indexOf(':')
      rule.set.push([entry.slice(0, colon).trim().toLowerCase(), entry.slice(colon + 1).trim()])
    }
  }
  return rules
}

function customHeaders(rules, pathname) {
  const headers = new Map()
  const setByRules = new Set()
  for (const rule of rules.filter((candidate) => glob(candidate.pattern).test(pathname))) {
    for (const name of rule.unset) headers.delete(name)
    for (const [name, value] of rule.set) {
      if (setByRules.has(name)) headers.set(name, [...(headers.get(name) ?? []), value])
      else {
        headers.set(name, [value])
        setByRules.add(name)
      }
    }
  }
  return headers
}

const paths = servedPaths()
const headerRules = parseHeaderRules(readFileSync(path.join(siteDir, '_headers'), 'utf8'))

describe('marketing site serving contract', () => {
  it('routes the site worker through a declared ASSETS binding', () => {
    expect(config.main).toBe('./worker/index.ts')
    expect(config.assets.directory).toBe('./marketing')
    expect(config.assets.binding).toBe('ASSETS')
  })

  it('sends every media file through the site worker so Range requests get 206', () => {
    const media = paths.filter((pathname) => MEDIA_EXTENSIONS.has(path.extname(pathname).toLowerCase()))
    expect(media).toContain('/assets/video/nomi-0.22-film.mp4')
    expect(media.filter((pathname) => !reachesWorkerFirst(pathname))).toEqual([])
  })

  it('keeps pages and images on the direct asset path', () => {
    expect(reachesWorkerFirst('/index.html')).toBe(false)
    expect(reachesWorkerFirst('/assets/promo-0.22/cover-zh-light.jpg')).toBe(false)
  })

  it('gives every served file at most one Cache-Control value', () => {
    const conflicting = paths
      .map((pathname) => [pathname, customHeaders(headerRules, pathname).get('cache-control') ?? []])
      .filter(([, values]) => values.length > 1)
    expect(conflicting).toEqual([])
    expect(customHeaders(headerRules, '/assets/video/nomi-0.22-film.mp4').get('cache-control'))
      .toEqual(['public, max-age=3600, must-revalidate'])
    expect(customHeaders(headerRules, '/assets/promo-0.22/cover-zh-light.jpg').get('cache-control'))
      .toEqual(['public, max-age=31536000, immutable'])
  })
})
