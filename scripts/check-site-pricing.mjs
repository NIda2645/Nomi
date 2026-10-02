#!/usr/bin/env node
// 门岗：官网页面上不出现价格（方案 §5.1「不放价格」、§10 门岗）。
//
// 为什么不写：中转价格一直在变，Nomi 又不经手钱，页面上的数字一旦写出来就是过期的错话；
// 想比价的人去供应商官网看，页面只给链接。
//
// 判据只拦「真的在报价」的写法，不拦只是**谈到价格这个词**的句子：
//   1. 货币符号紧挨着数字（¥99、$5、100￥）；
//   2. 数字紧跟 元 / 美元 / 积分 / credits（99 元、9.9 美元、100 积分、10 credits）；
//   3. 按秒 / 按次 / 每张 …… 计费，以及 billed / charged per second、per image billing 这类计价说法。
// 不拦：「价格、招牌、标语这类要出现在图里的文字」「价签」「全场 8 折」（海报上要写的字，不是 Nomi 的价）、
// 「4 seconds per image」（速度，不是计价）、「按秒分段写节奏」「5 个元素」。
// 扫的是页面上读者看得见的字（正文、标题、描述），脚本、样式和 JSON-LD 不扫。
// 提示词原文块（<pre class="prompt-text">）也不扫：那是第三方仓库的原样转载（按许可证必须保留原文），
// 里面的 `Price: "$280"` 是让图像模型画进海报的字，不是 Nomi 的报价。同样的字写进正文就会红。
//
// 用法：node scripts/check-site-pricing.mjs [--root <官网副本目录>]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listHtmlFiles, metaContent, readRelative, rootFromArgs, titleOf, visibleText } from './marketing/html-scan.mjs'

export const PRICE_RULES = [
  { id: 'currency-next-to-number', note: '货币符号紧挨着数字', pattern: /[¥￥$€£]\s?\d|\d\s?[¥￥$€£]/ },
  // 「元」后面跟这些字时是别的词（元素、元数据、元宇宙……），不是价格单位。
  { id: 'number-with-price-unit', note: '数字紧跟 元/美元/积分/credits', pattern: /\d+(?:\.\d+)?\s?(?:元(?![素数宇件年旦宵首老气音帅朝代神])|美元|积分|credits?(?![A-Za-z]))/i },
  { id: 'billed-per-unit', note: '按秒/按次/每张计费，或 billed per second/image 这类计价说法', pattern: /(?:按秒|按次|每张|每次)\s?(?:计费|收费|付费)|\b(?:billed|charged?|priced)\s+per\s+(?:second|image|video|generation)\b|\bper\s+(?:second|image|video|generation)\s+(?:billing|pricing|charge|fee)\b/i },
]

/** 一段文字里的全部「报价」命中（空数组 = 干净）。每条带命中原文和前后各一小段上下文。 */
export function findPriceMentions(text) {
  const mentions = []
  for (const rule of PRICE_RULES) {
    for (const match of text.matchAll(new RegExp(rule.pattern.source, `${rule.pattern.flags.replace('g', '')}g`))) {
      const start = Math.max(0, match.index - 18)
      mentions.push({ rule: rule.id, note: rule.note, match: match[0], context: text.slice(start, match.index + match[0].length + 18) })
    }
  }
  return mentions
}

const PROMPT_PAYLOAD = /<pre\b[^>]*\bclass="[^"]*\bprompt-text\b[^"]*"[^>]*>[\s\S]*?<\/pre>/gi

/** 一页上读者看得到的、由我们负责的文字：正文（不含提示词原文块）+ 标题 + meta 描述。 */
export function pageText(html) {
  return [visibleText(html.replace(PROMPT_PAYLOAD, ' ')), titleOf(html) ?? '', metaContent(html, 'name', 'description') ?? ''].join('\n')
}

export function main({ root = rootFromArgs(), log = console.log, error = console.error } = {}) {
  const pages = listHtmlFiles(root)
  const offenders = []
  for (const file of pages) {
    for (const mention of findPriceMentions(pageText(readRelative(root, file)))) offenders.push({ file, ...mention })
  }
  if (offenders.length) {
    error(`✖ 页面不许写价格门岗未通过：${offenders.length} 处`)
    for (const item of offenders) error(`  - ${item.file}: 「${item.match}」（${item.note}）…${item.context.replace(/\s+/g, ' ')}…`)
    error('  → 页面不写价格：删掉这句，或改成只说能力；想比价的人去供应商官网看。')
    return 1
  }
  log(`✅ 页面不许写价格门岗通过：${pages.length} 个页面没有任何报价写法`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
