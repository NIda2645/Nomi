// 「哪些模型有资格上官网、哪些写好了介绍、哪些还没写、哪些介绍已经没有对应模型」的唯一来源。
// check-site-editorial 门岗的汇总和每周同步（.github/workflows/site-data-sync.yml）的 PR 清单都读它。
//
// 用法：node scripts/site/model-intro-status.mjs             打印文字汇总
//       node scripts/site/model-intro-status.mjs --markdown  打印给每周同步 PR 当正文的 Markdown
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot, rootFromArgs } from '../marketing/html-scan.mjs'
import { catalogEligibleModels } from '../marketing/library/data.mjs'
import { EDITORIAL_LOCALES, parseEditorialFileName } from '../marketing/library/editorial.mjs'

/** 文件名列表 → `Map<slug, Set<locale>>`（不合规矩的文件名由 check-site-editorial 报，这里忽略）。 */
export function introsBySlug(fileNames) {
  const bySlug = new Map()
  for (const name of fileNames) {
    const parsed = parseEditorialFileName(name)
    if (!parsed) continue
    bySlug.set(parsed.slug, (bySlug.get(parsed.slug) ?? new Set()).add(parsed.locale))
  }
  return bySlug
}

export function modelIntroStatus(data, fileNames) {
  const intros = introsBySlug(fileNames)
  const eligible = catalogEligibleModels(data)
  const eligibleSlugs = new Set(eligible.map((model) => model.slug))
  const complete = (slug) => EDITORIAL_LOCALES.every((locale) => intros.get(slug)?.has(locale))
  return {
    /** 中英两篇都有：官网会出这个模型的页面。 */
    published: eligible.filter((model) => complete(model.slug)),
    /** 能用 API Key 接、没退役，但一篇介绍都没有：不上官网，进每周清单。 */
    missing: eligible.filter((model) => !intros.has(model.slug)),
    /** 只写了一种语言：同样不上官网。 */
    incomplete: eligible.filter((model) => intros.has(model.slug) && !complete(model.slug)),
    /** 介绍还在，但目录里已经没有这个模型（退役、并入别的模型）或它不再有资格上官网：要删掉。 */
    orphans: [...intros.keys()].filter((slug) => !eligibleSlugs.has(slug)).sort(),
  }
}

const TIER_LABEL = { flagship: '旗舰', value: '性价比', companion: '陪跑' }
const KIND_LABEL = { video: '视频', image: '图片' }

const vendorNames = (model) => model.vendors.filter((vendor) => vendor.authType !== 'none').map((vendor) => vendor.name).join('、')

function modelTable(models) {
  const rows = models.map((model) => `| ${model.label} | \`${model.slug}\` | ${KIND_LABEL[model.kind] ?? model.kind} | ${TIER_LABEL[model.lifecycle] ?? model.lifecycle} | ${vendorNames(model)} |`)
  return ['| 模型 | slug | 类型 | 分档 | 能用 API Key 接的渠道 |', '|---|---|---|---|---|', ...rows].join('\n')
}

export function renderMarkdown(status) {
  const lines = [
    '## 官网数据同步',
    '',
    '每周把官网数据对齐到 App 当前的目录：重新导出模型、技能和提示词数据，重建页面和 sitemap。这个 PR 只含官网文件（`marketing/`）。',
    '',
    `### 已上官网的模型：${status.published.length} 个`,
    '',
    `### 还没写介绍的模型：${status.missing.length} 个（不会出现在官网）`,
    '',
    '能用 API Key 接、没退役，但 `marketing/content/models/` 里一篇介绍都没有。中英两篇都写好才会上官网。',
    '',
  ]
  if (status.missing.length) lines.push(modelTable(status.missing), '')
  if (status.incomplete.length) {
    lines.push(`### 只写了一种语言的模型：${status.incomplete.length} 个（同样不会出现在官网）`, '', modelTable(status.incomplete), '')
  }
  if (status.orphans.length) {
    lines.push(
      `### 孤儿介绍：${status.orphans.length} 篇`,
      '',
      '目录里已经没有对应模型（退役或并入别的模型）的介绍，需要删掉，否则 `check:site` 会红：',
      '',
      ...status.orphans.map((slug) => `- \`${slug}\``),
      '',
    )
  }
  return `${lines.join('\n')}\n`
}

export function readStatus(root = repoRoot) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'marketing/data/site-data.json'), 'utf8'))
  const fileNames = fs.readdirSync(path.join(root, 'marketing/content/models')).filter((name) => name.endsWith('.md'))
  return modelIntroStatus(data, fileNames)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const status = readStatus(rootFromArgs())
  if (process.argv.includes('--markdown')) {
    process.stdout.write(renderMarkdown(status))
  } else {
    console.log(`已上官网 ${status.published.length} 个；还没写介绍 ${status.missing.length} 个；只写了一种语言 ${status.incomplete.length} 个；孤儿介绍 ${status.orphans.length} 篇`)
    for (const model of status.missing) console.log(`  缺介绍  ${model.slug}  (${model.label})`)
    for (const model of status.incomplete) console.log(`  缺一种语言  ${model.slug}  (${model.label})`)
    for (const slug of status.orphans) console.log(`  孤儿介绍  ${slug}`)
  }
}
