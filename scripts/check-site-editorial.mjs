#!/usr/bin/env node
// 门岗：官网模型介绍（marketing/content/models/<slug>.<zh-CN|en>.md）的格式、出处和「没有孤儿」。
//
// 抓的是几类**悄悄发生、页面照样生成**的失效：
//   · 模型在 App 目录里退役或并入别的模型，介绍还留着——页面不再生成，介绍成了没人看的死文字；
//   · 前言里的 model 跟目录里的身份对不上（拼错、目录改了名没跟上）；
//   · 只写了一种语言，hreflang 指向不存在的页面；
//   · 出处缺标题、不是 http(s) 链接、是转载站，或核对日期写在未来；
//   · 正文不是约定的四节，模型页「看提示词写法」按钮就跳错地方。
// 格式的定义只有一份：scripts/marketing/library/editorial.mjs。
// 「官方出处」机器只能拦住已知的第三方站（NON_OFFICIAL_HOSTS）；官方与否最终靠抽查。
//
// 用法：node scripts/check-site-editorial.mjs [--root <官网副本目录>]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listHtmlFiles, rootFromArgs } from './marketing/html-scan.mjs'
import { catalogEligibleModels } from './marketing/library/data.mjs'
import {
  EDITORIAL_LOCALES,
  SECTION_HEADINGS,
  frontProblems,
  hasLevelOneHeading,
  loadFront,
  parseEditorialFileName,
  sectionHeadingsOf,
  splitEditorial,
} from './marketing/library/editorial.mjs'
import { modelIntroStatus } from './site/model-intro-status.mjs'

const MODEL_PAGE = /^marketing\/(en\/)?models\/([a-z0-9][a-z0-9-]*)\.html$/

/**
 * @param files `Map<文件名, 全文>`
 * @param data 导出的 site-data.json
 * @param pagePaths 已生成的页面（相对仓库根的路径）；不传就不核对页面
 */
export function findEditorialProblems({ files, data, pagePaths = null, today = new Date() }) {
  const problems = []
  const catalog = new Map(data.models.map((model) => [model.slug, model]))
  const eligible = new Map(catalogEligibleModels(data).map((model) => [model.slug, model]))
  const localesBySlug = new Map()

  for (const [name, raw] of files) {
    const parsedName = parseEditorialFileName(name)
    if (!parsedName) {
      problems.push(`${name}: 文件名必须是 <slug>.<zh-CN|en>.md（slug 只用小写字母、数字和连字符）`)
      continue
    }
    const { slug, locale } = parsedName
    localesBySlug.set(slug, (localesBySlug.get(slug) ?? new Set()).add(locale))

    const parts = splitEditorial(raw)
    if (!parts) {
      problems.push(`${name}: 文件开头没有 --- 包起来的前言`)
      continue
    }
    let front
    try {
      front = loadFront(parts.frontText)
    } catch (error) {
      problems.push(`${name}: 前言 YAML 解析失败：${String(error.message).split('\n')[0]}`)
      continue
    }
    for (const issue of frontProblems(front, { today })) problems.push(`${name}: ${issue}`)

    const model = catalog.get(slug)
    if (!model) {
      problems.push(`${name}: 孤儿介绍——模型目录里已经没有 ${slug}（退役或并入了别的模型）；把这篇介绍删掉`)
    } else if (!eligible.has(slug)) {
      problems.push(`${name}: 孤儿介绍——${slug} 还在目录里，但已不再上官网（退役，或没有能用 API Key 接的渠道）；把这篇介绍删掉`)
    } else if (front?.model && front.model !== model.canonicalId) {
      problems.push(`${name}: 前言 model 写的是「${front.model}」，目录里这个模型的身份是「${model.canonicalId}」`)
    }

    const headings = sectionHeadingsOf(parts.body)
    const want = SECTION_HEADINGS[locale]
    if (headings.length !== want.length || want.some((heading, index) => headings[index] !== heading)) {
      problems.push(`${name}: 正文必须正好是四节「${want.join(' / ')}」，现在是「${headings.join(' / ') || '没有二级标题'}」`)
    }
    if (hasLevelOneHeading(parts.body)) problems.push(`${name}: 正文里有一级标题；页面标题就是模型名，正文只写那四个二级标题`)
  }

  for (const [slug, locales] of localesBySlug) {
    for (const locale of EDITORIAL_LOCALES) if (!locales.has(locale)) problems.push(`${slug}: 缺 ${locale} 版介绍（中英必须成对）`)
  }

  if (pagePaths) {
    const pages = new Map()
    for (const pagePath of pagePaths) {
      const match = MODEL_PAGE.exec(pagePath)
      if (match) pages.set(`${match[2]}|${match[1] ? 'en' : 'zh-CN'}`, pagePath)
    }
    for (const [key, pagePath] of pages) {
      const [slug, locale] = key.split('|')
      if (!localesBySlug.get(slug)?.has(locale)) problems.push(`${pagePath}: 页面还在，但没有对应的 ${locale} 介绍——多余页面（pnpm run build:site 会删掉它）`)
    }
    for (const [slug, locales] of localesBySlug) {
      if (!eligible.has(slug) || !EDITORIAL_LOCALES.every((locale) => locales.has(locale))) continue
      for (const locale of EDITORIAL_LOCALES) {
        if (!pages.has(`${slug}|${locale}`)) problems.push(`${slug}: 介绍写好了，但官网没有 ${locale} 的页面（跑 pnpm run build:site）`)
      }
    }
  }
  return problems
}

export function main({ root = rootFromArgs(), log = console.log, error = console.error } = {}) {
  const dir = path.join(root, 'marketing/content/models')
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort()
  const files = new Map(names.map((name) => [name, fs.readFileSync(path.join(dir, name), 'utf8')]))
  const data = JSON.parse(fs.readFileSync(path.join(root, 'marketing/data/site-data.json'), 'utf8'))
  const problems = findEditorialProblems({ files, data, pagePaths: listHtmlFiles(root) })
  if (problems.length) {
    error(`✖ 模型介绍门岗未通过：${problems.length} 处问题`)
    for (const problem of problems) error(`  - ${problem}`)
    return 1
  }
  const status = modelIntroStatus(data, names)
  log(`✅ 模型介绍门岗通过：${files.size} 个文件（${status.published.length} 个模型 × 中英），没有孤儿；另有 ${status.missing.length} 个能接的模型还没写介绍（不上官网，见每周同步清单）`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
