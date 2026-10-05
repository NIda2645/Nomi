// 方向检查（RW）按「自写登记条目」数的计数单位（2026-10-05）：文件 / 目录之外，再按
//   · 自写登记条目（docs/engineering/self-written.json 的一条 entry，paths 下所有文件合起来）数。
// 原因：同一个通用能力的修补散在好几个文件里，按文件、按目录都凑不够 3 个（MCP 一个月修 14 次、散在 6 个文件）。
// 计数、阈值、命中提示都在 fix-churn.mjs；这里只回答「有哪些单位、各含哪些文件、窗口和阈值是多少」。
import fs from 'node:fs'
import path from 'node:path'
import { pathMatches } from './self-written-lib.mjs'

export const SELF_WRITTEN_WINDOW_DAYS = 30
/** 自写通用能力：近 30 天已有 1 个 fix，这一刀就是第 2 个。 */
export const SELF_WRITTEN_PRIOR_FIX = 1

const WATCHED_SELF_WRITTEN = new Set(['under-review', 'to-replace'])
const norm = (p) => String(p || '').split('\\').join('/')

/** 一条登记算不算「自写通用能力」：评估中 / 待替换，或合理自写但落在 genericZones（hooks、轮询、缓存、重试……）里。 */
export function isWatchedEntry(entry, registry) {
  if (WATCHED_SELF_WRITTEN.has(entry?.status)) return true
  if (entry?.status !== 'justified') return false
  const zones = (registry?.genericZones ?? []).map((zone) => zone.path)
  return (entry.paths ?? []).some((p) => zones.some((zone) => pathMatches(zone, p)))
}

export function selfWrittenUnits(registry) {
  return (registry?.entries ?? []).filter((entry) => isWatchedEntry(entry, registry)).map((entry) => ({
    kind: 'self-written',
    id: entry.id,
    label: `自写登记「${entry.id}」`,
    status: entry.status,
    patterns: entry.paths ?? [],
    windowDays: SELF_WRITTEN_WINDOW_DAYS,
    prior: SELF_WRITTEN_PRIOR_FIX,
    maxFiles: null,
  }))
}

export const unitMatches = (unit, file) => unit.patterns.some((pattern) => pathMatches(pattern, norm(file)))

/** 读工作树里的两份登记；读不到 / 解析失败 = 空（fail-open，方向检查不因它挂掉）。 */
export function loadUnits(root) {
  const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')) } catch { return null } }
  return selfWrittenUnits(read('docs/engineering/self-written.json'))
}
