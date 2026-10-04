#!/usr/bin/env node
// 方向检查（RW）的唯一计数器：数「同一文件 / 同一概念目录」近 14 天的 fix 与「revert 一个 fix」提交。
// 谁都会走到这里：Claude 编辑提醒（edit-time-reminder）、git commit-msg（check-direction-trailer）、
// 派工前（node scripts/fix-churn.mjs <路径>）、CI 警告（--range）。别处不许再写第二份数法（P1）。
//
// 命中（hot）：
//   · 文件：近 14 天已有 ≥2 个 fix（这一刀是第 3 个），或出现过 ≥1 次 revert fix；
//   · 目录：同上，但只认「概念大小」的目录——近 14 天 fix 提交碰过的不同源码文件 ≤ DIR_MAX_FILES。
//     忙碌的大目录（几十个文件、每天都有无关 fix）不当整体算，否则每个 fix 都命中、规则变噪音（2026-10-04 回测：
//     origin/main 最近 15 个合并里，不设上限时 38 个 fix 提交几乎全命中）。
// 另外三条触发（评测分数回滚、同线第 3 轮修补、第三个特例分支）没有 git 上的可算信号，靠派工书 / 复盘模板人工判。
//
// 用法：
//   node scripts/fix-churn.mjs src/a/b.ts src/c        # 查给定路径（文件或目录）
//   node scripts/fix-churn.mjs --staged                # 查暂存区
//   node scripts/fix-churn.mjs --range origin/main..HEAD [--warn]   # 逐个 fix 提交回看：当时是不是热点、有没有带 trailer
//   加 --json 输出机器可读；有命中且未加 --warn 时退出码 1（派工脚本可据此改派复盘）。
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gitPaths } from './lib/gitPaths.mjs'

export const FIX_WINDOW_DAYS = 14
/** 近 14 天已有的 fix 数达到它，这一刀就是第 3 个。 */
export const PRIOR_FIX_THRESHOLD = 2
/** 目录算「同一概念」的上限：fix 提交碰过的不同源码文件数。 */
export const DIR_MAX_FILES = 6
export const TRAILER_KEY = 'Direction-Check'
export const FIX_SUBJECT = /^(fix|hotfix)(\(|:|!)/i
export const REVERT_OF_FIX = /^revert\b.*?["']?(fix|hotfix)(\(|:|!)/i
const SOURCE_FILE = /\.(ts|tsx|mts|cts|mjs)$/
const NOT_SOURCE = /\.(test|spec|node-test|e2e\.test)\.[cm]?[jt]sx?$|\.generated\.|\.d\.ts$/
const SEP1 = String.fromCharCode(1)
const SEP2 = String.fromCharCode(2)

const norm = (p) => String(p || '').split('\\').join('/')

/** 要不要管这个文件：src/、electron/ 下的非测试、非生成的源码。 */
export function isWatchedSource(rel) {
  const r = norm(rel)
  return (r.startsWith('src/') || r.startsWith('electron/')) && SOURCE_FILE.test(r) && !NOT_SOURCE.test(r)
}

export const isFixSubject = (s) => FIX_SUBJECT.test(String(s || '').trim())
export const isRevertOfFix = (s) => REVERT_OF_FIX.test(String(s || '').trim())

function defaultGit(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
}

/** 读一遍日志（新→旧）：[{ sha, ms, subject, files }]。pathspecs 为空 = 全仓。git 失败 = []（fail-open）。 */
export function loadHistory(root, { ref = 'HEAD', since, days = FIX_WINDOW_DAYS, pathspecs = [], git = defaultGit } = {}) {
  let out = ''
  try {
    const args = ['-c', 'core.quotePath=false', 'log', '--no-merges', `--since=${since || `${days} days ago`}`, '--no-renames', '--name-only', `--format=${SEP1}%H${SEP2}%cI${SEP2}%s`, ref]
    if (pathspecs.length) args.push('--', ...pathspecs)
    out = git(root, args)
  } catch { return [] }
  return out.split(SEP1).filter(Boolean).map((blk) => {
    const [head, ...files] = blk.split('\n')
    const [sha, iso, subject] = head.split(SEP2)
    return { sha, ms: Date.parse(iso), subject: (subject || '').trim(), files: files.map((f) => norm(f.trim())).filter(Boolean) }
  })
}

/** 在 history[afterIndex+1..]（比这一刀老）里、14 天窗口内，数触及 scope 的 fix / revert-fix，并收集 fix 碰过的源码文件。 */
export function tally(history, afterIndex, nowMs, scope) {
  const isDir = !/\.[a-z0-9]+$/i.test(scope)
  const prefix = scope.replace(/\/?$/, '/')
  const touches = (f) => (isDir ? f.startsWith(prefix) : f === scope)
  const cutoff = nowMs - FIX_WINDOW_DAYS * 86400000
  let fixes = 0
  let reverts = 0
  const fixFiles = new Set()
  for (let i = afterIndex + 1; i < history.length; i++) {
    const c = history[i]
    if (c.ms < cutoff || !c.files.some(touches)) continue
    if (isFixSubject(c.subject)) { fixes++; for (const f of c.files) if (touches(f) && isWatchedSource(f)) fixFiles.add(f) }
    else if (isRevertOfFix(c.subject)) reverts++
  }
  return { fixes, reverts, fixFiles: fixFiles.size }
}

/** 判一个文件：文件 + 所在目录各一票，返回命中原因。 */
export function evaluate(history, afterIndex, nowMs, rel) {
  const file = norm(rel)
  const dir = path.posix.dirname(file)
  const f = tally(history, afterIndex, nowMs, file)
  const d = dir && dir !== '.' ? tally(history, afterIndex, nowMs, dir) : { fixes: 0, reverts: 0, fixFiles: 0 }
  const dirNarrow = d.fixFiles <= DIR_MAX_FILES
  const reasons = []
  if (f.fixes >= PRIOR_FIX_THRESHOLD) reasons.push(`文件近 ${FIX_WINDOW_DAYS} 天已有 ${f.fixes} 个 fix，这一刀是第 ${f.fixes + 1} 个`)
  if (f.reverts >= 1) reasons.push(`文件近 ${FIX_WINDOW_DAYS} 天出现过 ${f.reverts} 次 revert fix`)
  if (dirNarrow && d.fixes >= PRIOR_FIX_THRESHOLD) reasons.push(`目录 ${dir}/ 近 ${FIX_WINDOW_DAYS} 天已有 ${d.fixes} 个 fix（只涉及 ${d.fixFiles} 个文件，算同一概念），这一刀是第 ${d.fixes + 1} 个`)
  if (dirNarrow && d.reverts >= 1) reasons.push(`目录 ${dir}/ 近 ${FIX_WINDOW_DAYS} 天出现过 ${d.reverts} 次 revert fix`)
  return { path: file, dir, file: f, dirCounts: d, hot: reasons.length > 0, reasons }
}

/** 兼容旧调用：文件近 N 天 fix 数。 */
export function countRecentFixes(root, rel, opts = {}) {
  const file = norm(rel)
  return tally(loadHistory(root, { ...opts, pathspecs: [file] }), -1, Date.now(), file).fixes
}

/** 单个路径的体检（给 edit-time-reminder 用）。 */
export function churnFor(root, rel, opts = {}) {
  const file = norm(rel)
  const dir = path.posix.dirname(file)
  return evaluate(loadHistory(root, { ...opts, pathspecs: [dir === '.' ? file : dir] }), -1, Date.now(), file)
}

/** 批量：只看 src/ electron/ 的源码（测试、生成物、文档不算）；只读一遍日志。 */
export function findHotspots(root, paths, opts = {}) {
  const files = [...new Set(paths.map(norm))].filter(isWatchedSource)
  if (!files.length) return []
  const dirs = [...new Set(files.map((f) => path.posix.dirname(f)))]
  const history = loadHistory(root, { ...opts, pathspecs: dirs })
  const now = Date.now()
  return files.map((f) => evaluate(history, -1, now, f)).filter((e) => e.hot)
}

export const directionMessage = (hits) => [
  '【方向检查 · RW】这一刀碰的地方已经被反复修，先别再补：',
  ...hits.flatMap((h) => h.reasons.map((r) => `  · ${h.path}：${r}`)),
  '动作：停止派 / 打修补，先做「类根因复盘」（模板 docs/engineering/direction-check-template.md，产出一页文档），结构性结论交用户拍板；复盘前先写特征测试钉住现状。',
  `提交 fix 时在信息里加一行 \`${TRAILER_KEY}: <复盘文档路径>\`（git commit-msg 会校验）。`,
].join('\n')

/** 提交信息 trailer：取 `Direction-Check: path`（最后一个，忽略 # 注释行）。 */
export function parseDirectionTrailer(message) {
  const lines = String(message || '').split(/\r?\n/).filter((l) => !l.startsWith('#'))
  let value = null
  for (const l of lines) {
    const m = l.match(new RegExp(`^${TRAILER_KEY}:\\s*(\\S.*?)\\s*$`, 'i'))
    if (m) value = m[1]
  }
  return value
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────
export function rangeReport(root, range, git = defaultGit) {
  const inRange = new Set(git(root, ['log', '--no-merges', '--format=%H', range]).split('\n').filter(Boolean))
  if (!inRange.size) return []
  const head = range.includes('..') ? range.split('..')[1] || 'HEAD' : 'HEAD'
  const oldest = Math.min(...[...inRange].map((sha) => Date.parse(git(root, ['log', '-1', '--format=%cI', sha]).trim())))
  const history = loadHistory(root, { ref: head, since: new Date(oldest - FIX_WINDOW_DAYS * 86400000).toISOString(), git })
  const rows = []
  history.forEach((c, idx) => {
    if (!inRange.has(c.sha) || !isFixSubject(c.subject)) return
    const hits = [...new Set(c.files)].filter(isWatchedSource).map((f) => evaluate(history, idx, c.ms, f)).filter((e) => e.hot)
    if (!hits.length) return
    const trailer = parseDirectionTrailer(git(root, ['log', '-1', '--format=%B', c.sha]))
    let docOk = false
    if (trailer) { try { git(root, ['cat-file', '-e', `${head}:${trailer}`]); docOk = true } catch { docOk = false } }
    rows.push({ sha: c.sha.slice(0, 9), subject: c.subject, hits, trailer, docOk })
  })
  return rows
}

function main(argv) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const flags = new Set(argv.filter((a) => a.startsWith('--') && a !== '--range'))
  const rangeIdx = argv.indexOf('--range')
  const json = flags.has('--json')
  if (rangeIdx >= 0) {
    const rows = rangeReport(root, argv[rangeIdx + 1])
    const bad = rows.filter((r) => !r.trailer || !r.docOk)
    if (json) console.log(JSON.stringify({ rows, missing: bad.length }, null, 2))
    else if (!bad.length) console.log(`方向检查：范围内 ${rows.length} 个热点 fix 提交，全部带了有效 ${TRAILER_KEY}。`)
    else {
      console.log(`方向检查（只警告）：${bad.length} 个 fix 提交碰了反复修的地方，却没带有效 ${TRAILER_KEY}：`)
      for (const r of bad) console.log(`  · ${r.sha} ${r.subject}\n      ${r.hits.flatMap((h) => h.reasons.map((x) => `${h.path}：${x}`)).slice(0, 2).join('；')}`)
      console.log('请先做类根因复盘（docs/engineering/direction-check-template.md），再在提交信息加 trailer。')
    }
    process.exit(flags.has('--warn') || !bad.length ? 0 : 1)
  }
  let paths = argv.filter((a) => !a.startsWith('--'))
  if (flags.has('--staged')) paths = gitPaths(['diff', '--cached', '--name-only', '--no-renames'], { cwd: root })
  // 传了目录就展开成该目录下 14 天内被 fix 碰过的源码文件，再判
  const expanded = paths.flatMap((p) => (/\.[a-z0-9]+$/i.test(p) ? [p] : [...new Set(loadHistory(root, { pathspecs: [p] }).flatMap((c) => c.files))].filter(isWatchedSource)))
  const hits = findHotspots(root, expanded)
  if (json) console.log(JSON.stringify(hits, null, 2))
  else console.log(hits.length ? directionMessage(hits) : '方向检查：未命中热点。')
  process.exit(hits.length && !flags.has('--warn') ? 1 : 0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
