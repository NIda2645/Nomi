#!/usr/bin/env node
// 门岗：官网生成出来的每一处站内引用（<a href>、<link href>、<img src>、<video src/poster> ……里以 / 开头的）
// 都必须指向真实存在的页面或资源文件（方案 §10 门岗）。
//
// 抓的是页面改名、模型下线、素材被清理之后**悄悄留下的死链**——页面照样生成、构建照样绿，
// 读者点过去才是 404。外链和页内锚点（#download-options）不在这里管。
// 同时钉死两条写法规矩（2026-09-03 干净地址漂移的教训，见 docs/fixes/2026-09-03-seo-clean-route-drift）：
//   · 站内链接用干净地址：不带 .html，也不带结尾斜杠（只有 `/` 与 `/en/` 例外）；
//   · 带 #锚点 指向别的页面时，那一页上必须真有这个 id（例：/skills#character-and-scene）。
// 地址 ↔ 文件的换算只有一份：scripts/marketing/routes.mjs。
//
// 用法：node scripts/check-site-links.mjs [--root <官网副本目录>]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { elementIds, internalReferences, isFile, listHtmlFiles, readRelative, rootFromArgs, splitReference } from './marketing/html-scan.mjs'
import { TRAILING_SLASH_ROUTES, fileCandidatesForPath } from './marketing/routes.mjs'

/**
 * @param pages `Map<相对仓库根的页面路径, HTML 全文>`
 * @param fileExists `(相对仓库根的路径) => boolean`（只认文件，目录不算）
 */
export function findLinkProblems({ pages, fileExists }) {
  const problems = []
  const idCache = new Map()
  const idsOf = (pagePath) => {
    if (!idCache.has(pagePath)) idCache.set(pagePath, elementIds(pages.get(pagePath)))
    return idCache.get(pagePath)
  }

  for (const [file, html] of pages) {
    for (const reference of internalReferences(html)) {
      const { pathname, hash } = splitReference(reference.value)
      const where = `${file}: <${reference.tag} ${reference.attribute}="${reference.value}">`
      const isLink = reference.tag === 'a'

      if (isLink && pathname.endsWith('.html')) problems.push(`${where} 站内链接要用干净地址，不带 .html`)
      if (isLink && pathname.length > 1 && pathname.endsWith('/') && !TRAILING_SLASH_ROUTES.has(pathname)) problems.push(`${where} 站内链接不带结尾斜杠（只有 / 与 /en/ 例外）`)

      const target = fileCandidatesForPath(pathname).find((candidate) => fileExists(candidate))
      if (!target) {
        problems.push(`${where} 指向的页面或文件不存在（找过 ${fileCandidatesForPath(pathname).join('、')}）`)
        continue
      }
      if (isLink && hash && pages.has(target) && !idsOf(target).has(hash)) {
        problems.push(`${where} 锚点 #${hash} 在 ${target} 里找不到对应 id`)
      }
    }
  }
  return problems
}

export function main({ root = rootFromArgs(), log = console.log, error = console.error } = {}) {
  const files = listHtmlFiles(root)
  const pages = new Map(files.map((file) => [file, readRelative(root, file)]))
  const referenceCount = [...pages.values()].reduce((sum, html) => sum + internalReferences(html).length, 0)
  const problems = findLinkProblems({ pages, fileExists: (relativePath) => isFile(root, relativePath) })
  if (problems.length) {
    error(`✖ 站内链接门岗未通过：${problems.length} 处`)
    for (const problem of problems) error(`  - ${problem}`)
    return 1
  }
  log(`✅ 站内链接门岗通过：${files.length} 个页面里的 ${referenceCount} 处站内引用全部指向真实存在的页面或文件`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
