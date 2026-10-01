import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { shared } from '../../scripts/marketing/content.mjs'
import { loadSiteData } from '../../scripts/marketing/library/data.mjs'
import { loadPageDates } from '../../scripts/marketing/page-dates.mjs'
import { computeSitemapEntries } from '../../scripts/marketing/pages.mjs'
import { renderSitemap } from '../../scripts/build-marketing-sitemap.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const runtimeFacts = Object.freeze({ ...shared, version: packageJson.version })

test('renderSitemap is a pure, deterministic, XML-safe template over given entries', () => {
  const entries = [
    { path: '/', updatedAt: '2026-01-01', changefreq: 'weekly', priority: '1.0' },
    { path: '/prompts/collections/a-b', updatedAt: '2026-01-02', changefreq: 'monthly', priority: '0.6' },
  ]
  const xml = renderSitemap('https://nomiaqm.com', entries)
  assert.equal(xml, renderSitemap('https://nomiaqm.com', entries), 'same input renders the same output')
  assert.equal((xml.match(/<url>/g) || []).length, entries.length)
  assert.match(xml, /<loc>https:\/\/nomiaqm\.com\/<\/loc>/)
  assert.match(xml, /<loc>https:\/\/nomiaqm\.com\/prompts\/collections\/a-b<\/loc>/)
  for (const entry of entries) assert.ok(xml.includes(`<lastmod>${entry.updatedAt}</lastmod>`))
  assert.doesNotMatch(xml, /&(?!(amp|lt|gt|quot|apos);)/)
})

test('renderSitemap writes hreflang alternates that mirror the page head (zh, en, x-default -> zh)', () => {
  const entries = [{
    path: '/models',
    updatedAt: '2026-01-01',
    changefreq: 'weekly',
    priority: '0.8',
    alternates: [
      { lang: 'zh-CN', path: '/models' },
      { lang: 'en', path: '/en/models' },
      { lang: 'x-default', path: '/models' },
    ],
  }]
  const xml = renderSitemap('https://nomiaqm.com', entries)
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/)
  assert.match(xml, /<xhtml:link rel="alternate" hreflang="zh-CN" href="https:\/\/nomiaqm\.com\/models" \/>/)
  assert.match(xml, /<xhtml:link rel="alternate" hreflang="en" href="https:\/\/nomiaqm\.com\/en\/models" \/>/)
  assert.match(xml, /<xhtml:link rel="alternate" hreflang="x-default" href="https:\/\/nomiaqm\.com\/models" \/>/)
})

test('every real entry lists both language versions and x-default pointing at the Chinese page', () => {
  const siteData = loadSiteData()
  const { entries } = computeSitemapEntries({ siteData, runtimeFacts, previousDates: loadPageDates(), today: '2026-09-28' })
  for (const entry of entries) {
    const byLang = Object.fromEntries(entry.alternates.map(({ lang, path: alternatePath }) => [lang, alternatePath]))
    assert.deepEqual(Object.keys(byLang).sort(), ['en', 'x-default', 'zh-CN'], entry.path)
    assert.equal(byLang['x-default'], byLang['zh-CN'], `${entry.path}: x-default points at the Chinese page`)
    assert.ok([byLang['zh-CN'], byLang.en].includes(entry.path), `${entry.path} is one of its own alternates`)
  }
})

test('a release (version bump) alone moves no lastmod except the page that shows the version', () => {
  const siteData = loadSiteData()
  const first = computeSitemapEntries({ siteData, runtimeFacts, previousDates: {}, today: '2026-01-01' })
  const bumped = computeSitemapEntries({ siteData, runtimeFacts: Object.freeze({ ...runtimeFacts, version: '99.0.0' }), previousDates: first.dates, today: '2026-06-01' })
  const moved = Object.keys(bumped.dates).filter((route) => bumped.dates[route].date !== first.dates[route].date).sort()
  // 快速上手页上有读者看得见的「最新版本」文字，它的内容确实变了；其余每页只是 JSON-LD 里的 softwareVersion 变了，不算内容变化。
  assert.deepEqual(moved, ['/en/quickstart', '/quickstart'])
})

test('a real content change moves exactly that page lastmod to today', () => {
  const siteData = loadSiteData()
  const first = computeSitemapEntries({ siteData, runtimeFacts, previousDates: {}, today: '2026-01-01' })
  const tampered = { ...first.dates, '/models': { hash: 'stale-hash', date: '2026-01-01' } }
  const second = computeSitemapEntries({ siteData, runtimeFacts, previousDates: tampered, today: '2026-06-01' })
  assert.equal(second.dates['/models'].date, '2026-06-01')
  assert.equal(second.dates['/models'].hash, first.dates['/models'].hash)
  assert.equal(second.dates['/prompts'].date, '2026-01-01', 'untouched pages keep their date')
})

test('computed entries cover the real site once each, with clean routes and no retired pages', () => {
  const siteData = loadSiteData()
  const { entries } = computeSitemapEntries({ siteData, runtimeFacts, previousDates: loadPageDates(), today: '2026-09-28' })
  const paths = entries.map((entry) => entry.path)
  assert.equal(new Set(paths).size, paths.length, 'every route appears exactly once')
  for (const expected of ['/', '/en/', '/quickstart', '/en/quickstart', '/features', '/en/features', '/models', '/en/models']) {
    assert.ok(paths.includes(expected), `sitemap includes ${expected}`)
  }
  assert.ok(!paths.includes('/handbook') && !paths.includes('/handbook.html'), 'the retired handbook is not in the sitemap')
  for (const entry of entries) {
    assert.doesNotMatch(entry.path, /\.html$/, `${entry.path} is a clean route`)
    assert.match(entry.updatedAt, /^\d{4}-\d{2}-\d{2}$/, `${entry.path} has a real lastmod date`)
  }
})

test('sitemap renderer over the real entries is deterministic and XML-safe', () => {
  const siteData = loadSiteData()
  const { entries } = computeSitemapEntries({ siteData, runtimeFacts, previousDates: loadPageDates(), today: '2026-09-28' })
  const xml = renderSitemap('https://nomiaqm.com', entries)
  assert.equal((xml.match(/<url>/g) || []).length, entries.length)
  assert.match(xml, /<loc>https:\/\/nomiaqm\.com\/quickstart<\/loc>/)
  assert.doesNotMatch(xml, /<loc>https:\/\/nomiaqm\.com\/(?:quickstart|handbook)\.html<\/loc>/)
  assert.match(xml, /<loc>https:\/\/nomiaqm\.com\/en\/quickstart<\/loc>/)
  assert.doesNotMatch(xml, /&(?!(amp|lt|gt|quot|apos);)/)
})
