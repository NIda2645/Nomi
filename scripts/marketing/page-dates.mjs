// marketing/data/page-dates.json 的唯一 owner：sitemap 的 lastmod 按「页面内容哈希变了的那天」记。
// 内容没变，日期不能跟着挪——不然一次无关改动（比如版本号跳一位）就会把全站 lastmod 刷成当天，
// 这个信号对搜索引擎就没意义了。旧路由（页面下线/改名）直接从表里删掉，不记退役页的日期。
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const PAGE_DATES_FILE = path.join(root, 'marketing/data/page-dates.json')

export function contentHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

export function loadPageDates(file = PAGE_DATES_FILE) {
  if (!fs.existsSync(file)) return {}
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * 纯函数：给定「上一版日期表」与「这一版每条路由的内容哈希」，算出新表。
 * 哈希没变 → 保留旧日期；哈希变了或路由是新的 → 记 `today`；上一版里但这一版没有的路由 → 不进新表。
 */
export function nextPageDates(previous, hashByRoute, today) {
  const next = {}
  for (const route of Object.keys(hashByRoute).sort()) {
    const hash = hashByRoute[route]
    const prior = previous[route]
    next[route] = prior && prior.hash === hash ? { hash, date: prior.date } : { hash, date: today }
  }
  return next
}

export function formatPageDates(map) {
  return `${JSON.stringify(map, null, 2)}\n`
}

export function writePageDates(map, file = PAGE_DATES_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, formatPageDates(map))
}
