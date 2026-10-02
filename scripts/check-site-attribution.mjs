#!/usr/bin/env node
// 门岗：官网上每一条来自别人公开仓库的提示词、配方和合集，都按许可证署名（方案 §10 门岗「非 AGPL 条目都有署名和许可证」）。
//
// 抓的是**悄悄丢掉署名**的几种情形：
//   · 某条目的许可证不是我们逐个读过 LICENSE 原文的那几种（新来源、写错、上游改了许可证）——
//     没读过条款就不该转载全文，只能放标题和出处链接；
//   · 页面上没有出处块，或出处块里没有原仓库链接、没有这条的许可证，或许可证全文被漏掉；
//   · 同一页里两条来源地址相同但许可证不同，署名块只会写其中一个（页面按来源地址去重）。
// 非 AGPL 的技能、效果和有离线内置的开源合集，中英两种语言的页面都要核对。
// AGPL-3.0-only 是 Nomi 自己的技能，署名块照常渲染，但不在这道门里强制。
//
// 用法：node scripts/check-site-attribution.mjs [--root <官网副本目录>]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listHtmlFiles, parseAttributes, readRelative, rootFromArgs, visibleText } from './marketing/html-scan.mjs'
import { authorCredit } from './marketing/library/common.mjs'
import { collectionsWithPages, libraryPaths } from './marketing/library/data.mjs'
import { outputPathFromRoute } from './marketing/routes.mjs'
import { localizedPath } from './marketing/shell.mjs'

/** 我们读过 LICENSE 原文、确认允许按署名转载的许可证。要加新的，先读条款，再来这里加一行。 */
export const VETTED_LICENSES = new Set(['AGPL-3.0-only', 'MIT', 'Apache-2.0', 'CC0-1.0', 'CC-BY-4.0'])
const LOCALES = ['zh-CN', 'en']

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 一页里的全部出处块：链接（地址 + 链接上的字）、许可证那一行、有没有折叠的许可证全文。 */
export function attributionBlocks(html) {
  return [...html.matchAll(/<aside class="attribution"[^>]*>([\s\S]*?)<\/aside>/g)].map((match) => {
    const anchors = [...match[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
      .map((anchor) => ({ href: parseAttributes(`<a${anchor[1]}>`).href, text: visibleText(anchor[2]) }))
      .filter((anchor) => anchor.href)
    return {
      anchors,
      links: anchors.map((anchor) => anchor.href),
      licenses: [...match[1].matchAll(/<dd>([^<]*)<\/dd>/g)].map((dd) => dd[1].trim()),
      text: visibleText(match[1]),
      hasLicenseText: /<details class="license-text"/.test(match[1]),
    }
  })
}

function checkPage({ pages, pagePath, label, sourceUrl, author, license, licenseText, problems }) {
  const html = pages.get(pagePath)
  if (html === undefined) {
    problems.push(`${label}: 页面 ${pagePath} 不存在，署名无处可写`)
    return
  }
  const block = attributionBlocks(html).find((candidate) => candidate.links.includes(sourceUrl) && candidate.licenses.includes(license))
  if (!block) {
    problems.push(`${label}: ${pagePath} 上没有一个出处块同时带着原仓库链接 ${sourceUrl} 和许可证 ${license}`)
    return
  }
  if (author) {
    const credit = authorCredit(author)
    // 作者名要出现在署名行的链接上（不能只靠许可证全文里碰巧写着同一个名字）；帖子作者要有指向那条帖子的链接。
    const credited = credit.url ? block.links.includes(credit.url) : block.anchors.some((anchor) => anchor.href === sourceUrl && anchor.text.includes(credit.name))
    if (!credited) problems.push(`${label}: ${pagePath} 的出处块里没有作者 ${credit.url ?? credit.name}（原作者的链接或名字都不能被去重吃掉）`)
  }
  if (licenseText && license !== 'AGPL-3.0-only') {
    if (!block.hasLicenseText) problems.push(`${label}: ${pagePath} 的出处块缺许可证全文（折叠块）`)
    else if (!block.text.includes(licenseText.split('\n')[0].trim().slice(0, 30))) problems.push(`${label}: ${pagePath} 的许可证全文跟目录里的对不上`)
  }
}

export function findAttributionProblems({ data, pages }) {
  const problems = []
  for (const item of data.library) {
    if (!VETTED_LICENSES.has(item.license)) problems.push(`${item.name}: 许可证 ${JSON.stringify(item.license)} 没有读过条款，不能转载全文（只放标题和出处链接，或读过条款后加进 VETTED_LICENSES）`)
  }
  for (const collection of data.collections) {
    if (!VETTED_LICENSES.has(collection.license)) problems.push(`合集 ${collection.id}: 许可证 ${JSON.stringify(collection.license)} 没有读过条款，不能转载全文`)
  }

  for (const item of data.library) {
    if (item.license === 'AGPL-3.0-only' || !VETTED_LICENSES.has(item.license)) continue
    const route = item.kind === 'skill' ? libraryPaths.skill(item.name) : libraryPaths.effectGroup(item.groupId)
    for (const locale of LOCALES) {
      checkPage({
        pages,
        pagePath: outputPathFromRoute(localizedPath(locale, route)),
        label: `${item.kind === 'skill' ? '技能' : '效果'} ${item.name}（${locale}）`,
        sourceUrl: item.source.url,
        author: item.source.author,
        license: item.license,
        licenseText: item.licenseText,
        problems,
      })
    }
  }

  for (const collection of collectionsWithPages(data)) {
    if (!VETTED_LICENSES.has(collection.license)) continue
    for (const locale of LOCALES) {
      const pagePath = outputPathFromRoute(localizedPath(locale, libraryPaths.collection(collection.id)))
      const html = pages.get(pagePath)
      const label = `合集 ${collection.id}（${locale}）`
      if (html === undefined) problems.push(`${label}: 页面 ${pagePath} 不存在`)
      else if (!attributionBlocks(html).some((block) => block.links.includes(collection.sourceUrl) && block.licenses.includes(collection.license))) {
        problems.push(`${label}: ${pagePath} 上没有出处块同时带着原仓库链接 ${collection.sourceUrl} 和许可证 ${collection.license}`)
      }
    }
  }
  return problems
}

export function main({ root = rootFromArgs(), log = console.log, error = console.error } = {}) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'marketing/data/site-data.json'), 'utf8'))
  const pages = new Map(listHtmlFiles(root).map((file) => [file, readRelative(root, file)]))
  const problems = findAttributionProblems({ data, pages })
  if (problems.length) {
    error(`✖ 许可证署名门岗未通过：${problems.length} 处`)
    for (const problem of problems) error(`  - ${problem}`)
    return 1
  }
  const nonAgpl = data.library.filter((item) => item.license !== 'AGPL-3.0-only').length
  log(`✅ 许可证署名门岗通过：${nonAgpl} 个非 AGPL 技能/效果和 ${collectionsWithPages(data).length} 个开源合集，中英页面都有原仓库链接、作者和许可证`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
