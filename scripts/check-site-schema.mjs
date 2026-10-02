#!/usr/bin/env node
// 门岗：每个页面的结构化数据（JSON-LD）能解析，而且只写页面上真有的东西（方案 §8、§10 门岗）。
//
// 抓的是**悄悄写坏、页面照样好看**的失效：JSON 少个逗号、@graph 里的节点互相引用对不上、
// 面包屑位置不连续、ItemList 的数量跟列出来的条数不一致、url 指向一个已经不存在的页面。
// 搜索引擎读不懂就整块丢掉，页面表面上没有任何变化。检查：
//   · 每页至少一块 JSON-LD，全部能 JSON.parse，@context 是 schema.org，@graph 非空，节点都有 @type、@id 不重复；
//   · 必备节点：WebSite、SoftwareApplication、以及页面自己那一个（WebPage 或 CollectionPage），
//     页面节点的 @id/url 就是 canonical，语言跟 <html lang> 一致；
//   · BreadcrumbList：位置从 1 连续，最后一项就是本页；ItemList：numberOfItems 等于实际条数；
//   · 凡是站内的 url / item / @id / contentUrl，指向的页面或文件必须存在。
//
// 用法：node scripts/check-site-schema.mjs [--root <官网副本目录>]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shared } from './marketing/content.mjs'
import { canonicalOf, htmlLangOf, isFile, jsonLdBlocks, listHtmlFiles, readRelative, rootFromArgs, splitReference } from './marketing/html-scan.mjs'
import { fileCandidatesForPath } from './marketing/routes.mjs'

const PAGE_TYPES = new Set(['WebPage', 'CollectionPage'])
const SITE_URL_KEYS = new Set(['url', 'item', '@id', 'contentUrl'])
const typesOf = (node) => (Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']]).filter(Boolean)

function* walk(value) {
  if (Array.isArray(value)) for (const entry of value) yield* walk(entry)
  else if (value && typeof value === 'object') {
    yield value
    for (const child of Object.values(value)) yield* walk(child)
  }
}

export function findSchemaProblems({ pages, siteUrl, fileExists }) {
  const problems = []
  for (const [file, html] of pages) {
    const blocks = jsonLdBlocks(html)
    if (!blocks.length) {
      problems.push(`${file}: 没有结构化数据（<script type="application/ld+json">）`)
      continue
    }
    const canonical = canonicalOf(html)
    const graph = []
    blocks.forEach((raw, index) => {
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch (error) {
        problems.push(`${file}: 第 ${index + 1} 块 JSON-LD 解析失败：${error.message}`)
        return
      }
      if (parsed?.['@context'] !== 'https://schema.org') problems.push(`${file}: 第 ${index + 1} 块 JSON-LD 的 @context 不是 https://schema.org`)
      if (!Array.isArray(parsed?.['@graph']) || parsed['@graph'].length === 0) problems.push(`${file}: 第 ${index + 1} 块 JSON-LD 没有 @graph 或是空的`)
      else graph.push(...parsed['@graph'])
    })
    if (!graph.length) continue

    const ids = new Set()
    for (const node of graph) {
      if (!typesOf(node).length) problems.push(`${file}: @graph 里有节点没有 @type：${JSON.stringify(node).slice(0, 80)}`)
      if (node?.['@id']) {
        if (ids.has(node['@id'])) problems.push(`${file}: @id 重复：${node['@id']}`)
        ids.add(node['@id'])
      }
    }

    const websiteId = `${siteUrl}/#website`
    const applicationId = `${siteUrl}/#application`
    if (!graph.some((node) => typesOf(node).includes('WebSite') && node['@id'] === websiteId)) problems.push(`${file}: 缺 WebSite 节点（@id ${websiteId}）`)
    if (!graph.some((node) => typesOf(node).includes('SoftwareApplication') && node['@id'] === applicationId)) problems.push(`${file}: 缺 SoftwareApplication 节点（@id ${applicationId}）`)
    const pageNodes = graph.filter((node) => typesOf(node).some((type) => PAGE_TYPES.has(type)))
    if (pageNodes.length !== 1) {
      problems.push(`${file}: 页面节点（WebPage / CollectionPage）应该恰好一个，现在是 ${pageNodes.length} 个`)
    } else {
      const [pageNode] = pageNodes
      if (pageNode['@id'] !== canonical || pageNode.url !== canonical) problems.push(`${file}: 页面节点的 @id/url（${pageNode['@id']} / ${pageNode.url}）不是 canonical ${canonical}`)
      if (pageNode.inLanguage !== htmlLangOf(html)) problems.push(`${file}: 页面节点 inLanguage ${pageNode.inLanguage} 跟 <html lang> ${htmlLangOf(html)} 不一致`)
      if (pageNode.isPartOf?.['@id'] !== websiteId) problems.push(`${file}: 页面节点没有 isPartOf 到 WebSite`)
      if (pageNode.about?.['@id'] !== applicationId) problems.push(`${file}: 页面节点没有 about 到 SoftwareApplication`)
      if (pageNode.breadcrumb && !ids.has(pageNode.breadcrumb['@id'])) problems.push(`${file}: 页面节点引用的面包屑 ${pageNode.breadcrumb['@id']} 不在 @graph 里`)
    }

    for (const node of graph) {
      if (typesOf(node).includes('BreadcrumbList')) {
        const items = node.itemListElement ?? []
        items.forEach((item, position) => {
          if (item.position !== position + 1) problems.push(`${file}: 面包屑第 ${position + 1} 项的 position 是 ${item.position}，应该连续从 1 数`)
          if (!item.name) problems.push(`${file}: 面包屑第 ${position + 1} 项没有 name`)
        })
        const last = items.at(-1)
        if (!last || splitReference(String(last.item).replace(siteUrl, '')).pathname !== splitReference(String(canonical).replace(siteUrl, '')).pathname) {
          problems.push(`${file}: 面包屑最后一项（${last?.item}）应该就是本页 ${canonical}`)
        }
      }
      if (typesOf(node).includes('ItemList') && node.numberOfItems !== (node.itemListElement ?? []).length) {
        problems.push(`${file}: ItemList ${node['@id'] ?? ''} 的 numberOfItems ${node.numberOfItems} 跟实际条数 ${(node.itemListElement ?? []).length} 不一致`)
      }
    }

    const checked = new Set()
    for (const node of graph) {
      for (const object of walk(node)) {
        for (const key of SITE_URL_KEYS) {
          const value = object[key]
          if (typeof value !== 'string' || !(value === siteUrl || value.startsWith(`${siteUrl}/`)) || checked.has(value)) continue
          checked.add(value)
          const { pathname } = splitReference(value.slice(siteUrl.length) || '/')
          if (!fileCandidatesForPath(pathname).some((candidate) => fileExists(candidate))) problems.push(`${file}: 结构化数据里的 ${key} ${value} 指向的页面或文件不存在`)
        }
      }
    }
  }
  return problems
}

export function main({ root = rootFromArgs(), log = console.log, error = console.error } = {}) {
  const files = listHtmlFiles(root)
  const pages = new Map(files.map((file) => [file, readRelative(root, file)]))
  const problems = findSchemaProblems({ pages, siteUrl: shared.siteUrl, fileExists: (relativePath) => isFile(root, relativePath) })
  if (problems.length) {
    error(`✖ 结构化数据门岗未通过：${problems.length} 处`)
    for (const problem of problems) error(`  - ${problem}`)
    return 1
  }
  log(`✅ 结构化数据门岗通过：${files.length} 个页面的 JSON-LD 都能解析，节点齐全、引用对得上、站内 url 都指向真实存在的页面`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
