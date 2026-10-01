#!/usr/bin/env node
// 门岗：中英页面一一对应，hreflang 两边一致（方案 §8、§10 门岗）。
//
// 抓的是**页面一边有、另一边没有**的情形：只出了中文页、英文页被清掉了，页面 <head> 里的 hreflang
// 却还指着它——搜索引擎拿到一个互相打架的语言标注，两个版本都可能被降权。检查四件事：
//   1. 每个中文页都有对应的英文页，反之亦然（`marketing/models.html` ←→ `marketing/en/models.html`）；
//   2. 每页 <html lang>、canonical 与自己的语言和地址一致；
//   3. 每页 <head> 里恰好三条 hreflang：zh-CN、en、x-default（指中文），而且对面那一页写的是同一组；
//   4. sitemap.xml 列的页面正好是磁盘上的页面，每条的 xhtml:link 跟页面 <head> 里的 hreflang 一致；
//   5. 英文页的标题、描述和 <h1> 里没有汉字（模型名、合集名没有英文叫法时，生成器会把中文原名漏到英文页上）。
//      页面正文里原样展示的中文技能全文不在此限（那是方案 §12 说好的，并标了语言）。
//
// 用法：node scripts/check-site-locales.mjs [--root <官网副本目录>]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shared } from './marketing/content.mjs'
import { alternatesOf, canonicalOf, h1TextOf, htmlLangOf, listHtmlFiles, metaContent, readRelative, rootFromArgs, titleOf } from './marketing/html-scan.mjs'
import { counterpartOutputPath, isEnglishOutputPath, routeFromOutputPath } from './marketing/routes.mjs'

const HAN = /\p{Script=Han}/u
const asTable = (alternates) => Object.fromEntries([...alternates].sort((left, right) => left.lang.localeCompare(right.lang)).map(({ lang, href }) => [lang, href]))

/** sitemap.xml → `Map<loc, Array<{ lang, href }>>`；同一个 loc 出现两次会报重复。 */
export function parseSitemap(xml) {
  const entries = []
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(block[1])?.[1]?.trim()
    const alternates = [...block[1].matchAll(/<xhtml:link\b[^>]*>/g)].map((link) => ({
      lang: /hreflang="([^"]*)"/.exec(link[0])?.[1] ?? '',
      href: /href="([^"]*)"/.exec(link[0])?.[1] ?? '',
    }))
    entries.push({ loc, alternates })
  }
  return entries
}

export function findLocaleProblems({ pages, siteUrl, sitemapXml = null }) {
  const problems = []
  for (const [file, html] of pages) {
    const english = isEnglishOutputPath(file)
    const counterpart = counterpartOutputPath(file)
    const route = routeFromOutputPath(file)
    const zhPath = english ? counterpart : file
    const enPath = english ? file : counterpart

    if (!pages.has(counterpart)) problems.push(`${file}: 没有对应的${english ? '中文' : '英文'}页 ${counterpart}`)
    const lang = htmlLangOf(html)
    if (lang !== (english ? 'en' : 'zh-CN')) problems.push(`${file}: <html lang> 是 ${JSON.stringify(lang)}，应该是 ${english ? 'en' : 'zh-CN'}`)
    if (canonicalOf(html) !== `${siteUrl}${route}`) problems.push(`${file}: canonical 是 ${canonicalOf(html)}，应该是 ${siteUrl}${route}`)

    const alternates = alternatesOf(html)
    const expected = { 'zh-CN': `${siteUrl}${routeFromOutputPath(zhPath)}`, en: `${siteUrl}${routeFromOutputPath(enPath)}`, 'x-default': `${siteUrl}${routeFromOutputPath(zhPath)}` }
    if (alternates.length !== 3) problems.push(`${file}: hreflang 应该恰好三条（zh-CN、en、x-default），现在是 ${alternates.length} 条`)
    const table = asTable(alternates)
    for (const [key, href] of Object.entries(expected)) {
      if (table[key] !== href) problems.push(`${file}: hreflang ${key} 是 ${table[key] ?? '（没有）'}，应该是 ${href}`)
    }
    if (pages.has(counterpart) && JSON.stringify(asTable(alternatesOf(pages.get(counterpart)))) !== JSON.stringify(table)) {
      problems.push(`${file}: 跟对面的 ${counterpart} 写的 hreflang 不是同一组`)
    }

    if (english) {
      for (const [label, text] of [['标题', titleOf(html)], ['描述', metaContent(html, 'name', 'description')], ['<h1>', h1TextOf(html)]]) {
        if (text && HAN.test(text)) problems.push(`${file}: 英文页的${label}里混进了中文「${text.match(HAN)[0]}」：${text.slice(0, 50)}`)
      }
    }
  }

  if (sitemapXml !== null) {
    const entries = parseSitemap(sitemapXml)
    const seen = new Set()
    const routes = new Map([...pages.keys()].map((file) => [`${siteUrl}${routeFromOutputPath(file)}`, file]))
    for (const { loc, alternates } of entries) {
      if (seen.has(loc)) problems.push(`sitemap.xml: ${loc} 出现了不止一次`)
      seen.add(loc)
      const file = routes.get(loc)
      if (!file) {
        problems.push(`sitemap.xml: ${loc} 没有对应的页面`)
        continue
      }
      if (JSON.stringify(asTable(alternates)) !== JSON.stringify(asTable(alternatesOf(pages.get(file))))) {
        problems.push(`sitemap.xml: ${loc} 的 xhtml:link 跟页面 ${file} <head> 里的 hreflang 不一致`)
      }
    }
    for (const [loc, file] of routes) if (!seen.has(loc)) problems.push(`sitemap.xml: 缺 ${loc}（${file}）`)
  }
  return problems
}

export function main({ root = rootFromArgs(), log = console.log, error = console.error } = {}) {
  const files = listHtmlFiles(root)
  const pages = new Map(files.map((file) => [file, readRelative(root, file)]))
  const sitemapXml = fs.readFileSync(path.join(root, 'marketing/sitemap.xml'), 'utf8')
  const problems = findLocaleProblems({ pages, siteUrl: shared.siteUrl, sitemapXml })
  if (problems.length) {
    error(`✖ 中英对应门岗未通过：${problems.length} 处`)
    for (const problem of problems) error(`  - ${problem}`)
    return 1
  }
  log(`✅ 中英对应门岗通过：${files.length / 2} 对页面一一对应，hreflang 两边一致，sitemap 列的就是这些页面`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
