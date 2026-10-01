// 扫描生成出来的官网 HTML（marketing/**/*.html）的小工具：列文件、取 <head> 里的标签、取站内引用。
// 生成的 HTML 是我们自己输出的（属性一律双引号、文字已转义），所以小正则就够，不引入 DOM 解析库。
// 页面生成器的「多余页面清理」与全部 check-site-* 门岗共用这一份，不各写一遍怎么读 HTML。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** `--root <dir>` 把门岗指向另一份官网副本（证明门岗会红时用），默认是仓库根。 */
export function rootFromArgs(argv = process.argv) {
  const index = argv.indexOf('--root')
  return index >= 0 && argv[index + 1] ? path.resolve(argv[index + 1]) : repoRoot
}

/** marketing/ 下全部页面 HTML（不含 assets/），路径相对根、统一斜杠、排好序。 */
export function listHtmlFiles(root = repoRoot) {
  const base = path.join(root, 'marketing')
  return fs.readdirSync(base, { recursive: true })
    .map((entry) => String(entry).replaceAll('\\', '/'))
    .filter((entry) => entry.endsWith('.html') && !entry.startsWith('assets/'))
    .map((entry) => `marketing/${entry}`)
    .sort()
}

export const readRelative = (root, relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

/** 是不是一个真实存在的文件（目录不算：`marketing/models` 是目录，`/models` 要落到 models.html）。 */
export function isFile(root, relativePath) {
  try {
    return fs.statSync(path.join(root, relativePath)).isFile()
  } catch {
    return false
  }
}

export function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
}

export function parseAttributes(tag) {
  const attributes = {}
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attributes[match[1].toLowerCase()] = decodeEntities(match[2])
  return attributes
}

/** 某种标签的全部属性表（按出现顺序）。 */
export function tagAttributes(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => parseAttributes(match[0]))
}

export const metaContent = (html, key, value) => tagAttributes(html, 'meta').find((attributes) => attributes[key] === value)?.content ?? null
export const linkTags = (html, rel) => tagAttributes(html, 'link').filter((attributes) => attributes.rel === rel)
export const canonicalOf = (html) => linkTags(html, 'canonical')[0]?.href ?? null
export const alternatesOf = (html) => linkTags(html, 'alternate').filter((attributes) => attributes.hreflang).map((attributes) => ({ lang: attributes.hreflang, href: attributes.href }))
export const htmlLangOf = (html) => /<html\b[^>]*\blang="([^"]*)"/i.exec(html)?.[1] ?? null
export const titleOf = (html) => {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(html)
  return match ? decodeEntities(match[1]).trim() : null
}

/** 每页 <script type="application/ld+json"> 里的原文（还没解析）。 */
export function jsonLdBlocks(html) {
  return [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1])
}

/** 页面上读者看得见的文字：去掉脚本、样式和标签，解开转义。 */
export function visibleText(html) {
  const bodyOnly = html.replace(/<head>[\s\S]*?<\/head>/i, ' ')
  return decodeEntities(
    bodyOnly
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim()
}

/** 页面里指向站内的引用：<a>/<link> 的 href，<img>/<video>/<source>/<script>/<iframe> 的 src，<video> 的 poster。只收以 / 开头（不含 //）的。 */
export function internalReferences(html) {
  const references = []
  for (const match of html.matchAll(/<(a|link|img|video|source|script|iframe)\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0])
    for (const attribute of ['href', 'src', 'poster']) {
      const value = attributes[attribute]
      if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
        references.push({ tag: match[1].toLowerCase(), attribute, value })
      }
    }
  }
  return references
}

/** `/en/quickstart?x=1#routes` → `{ pathname: '/en/quickstart', hash: 'routes' }`。 */
export function splitReference(value) {
  const hashIndex = value.indexOf('#')
  const hash = hashIndex >= 0 ? value.slice(hashIndex + 1) : ''
  const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value
  const queryIndex = beforeHash.indexOf('?')
  return { pathname: queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash, hash }
}

export const elementIds = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]))
