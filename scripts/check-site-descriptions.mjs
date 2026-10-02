#!/usr/bin/env node
// 门岗：每个页面的 meta 描述长度在 50–160 字符（中文按字数），分享卡片的描述跟它一致，页面之间不重复。
//
// 为什么：描述太短搜索引擎当它没写、太长会被截成半句；SEO 巡检（scripts/seo/seo-audit.mjs）每周对线上页面报同一条，
// 但那是上线之后才知道。这里在生成物上先拦住。2026-09-28 的真实命中：英文首页（225 字）和英文快速上手（171 字）超长。
// 界限只有一份：scripts/marketing/seo-limits.mjs。模型页的描述怎么拼见 models-pages.mjs 的 modelMetaDescription。
// 同一语言里两个页面的标题或描述一字不差，说明有页面是批量生成的空壳（方案 §4「防薄内容」），一并拦。
//
// 用法：node scripts/check-site-descriptions.mjs [--root <官网副本目录>]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listHtmlFiles, metaContent, readRelative, rootFromArgs, titleOf } from './marketing/html-scan.mjs'
import { isEnglishOutputPath } from './marketing/routes.mjs'
import { DESCRIPTION_LENGTH, descriptionLength } from './marketing/seo-limits.mjs'

export function findDescriptionProblems({ pages }) {
  const problems = []
  const seen = { title: new Map(), description: new Map() }
  const remember = (kind, locale, text, file) => {
    const key = `${locale}|${text}`
    if (seen[kind].has(key)) problems.push(`${file}: ${kind === 'title' ? '标题' : '描述'}跟 ${seen[kind].get(key)} 一字不差（同一语言里每页都要有自己的${kind === 'title' ? '标题' : '描述'}）`)
    else seen[kind].set(key, file)
  }

  for (const [file, html] of pages) {
    const locale = isEnglishOutputPath(file) ? 'en' : 'zh-CN'
    const description = metaContent(html, 'name', 'description')
    const title = titleOf(html)
    if (!title) problems.push(`${file}: 没有 <title>`)
    else remember('title', locale, title, file)

    if (!description || !description.trim()) {
      problems.push(`${file}: 没有 meta description`)
      continue
    }
    const length = descriptionLength(description)
    if (length < DESCRIPTION_LENGTH.min || length > DESCRIPTION_LENGTH.max) {
      problems.push(`${file}: 描述 ${length} 字符，要在 ${DESCRIPTION_LENGTH.min}–${DESCRIPTION_LENGTH.max} 之间：${description.slice(0, 60)}…`)
    }
    for (const [label, value] of [['og:description', metaContent(html, 'property', 'og:description')], ['twitter:description', metaContent(html, 'name', 'twitter:description')]]) {
      if (value !== description) problems.push(`${file}: ${label} 跟 meta description 不一致`)
    }
    remember('description', locale, description, file)
  }
  return problems
}

export function main({ root = rootFromArgs(), log = console.log, error = console.error } = {}) {
  const files = listHtmlFiles(root)
  const pages = new Map(files.map((file) => [file, readRelative(root, file)]))
  const problems = findDescriptionProblems({ pages })
  if (problems.length) {
    error(`✖ 页面描述门岗未通过：${problems.length} 处`)
    for (const problem of problems) error(`  - ${problem}`)
    return 1
  }
  log(`✅ 页面描述门岗通过：${files.length} 个页面的 meta 描述都在 ${DESCRIPTION_LENGTH.min}–${DESCRIPTION_LENGTH.max} 字符，分享卡片一致，没有重复的标题或描述`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
