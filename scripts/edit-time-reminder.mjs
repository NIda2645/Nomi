#!/usr/bin/env node
// 「动手那一刻」的两个提醒（PreToolUse · Write|Edit）。只提醒、不拦、fail-open（任何异常都静默放行）。
//
//  (a) 在 src/、electron/ 新建文件 → 附一份接口级「已有能力清单」，请回一行「已查过 / 没找到」。
//      起因：laneContextFit 是在「pi 已经有压缩」没人看的地方长出来的；agent 不知道有，就不会触发 R5.3。
//  (b) 改的文件近 14 天已有 ≥3 次 fix 提交 → 提醒先过「重写判据」，别再打第 N 个补丁。
//
// 机制已对着官方 hooks 文档核过（https://code.claude.com/docs/en/hooks，2026-10-01）：PreToolUse 的
// `hookSpecificOutput.additionalContext` 会进上下文，位置在**工具结果旁边**——也就是提醒随写入结果一起到，
// 不是写入前；它能让 agent 立刻自查、重写，但拦不住这一次写入。普通 stdout（exit 0）对 PreToolUse 只进调试日志、
// 不进上下文，所以必须走 JSON。stdin 有 session_id / cwd / tool_name / tool_input.file_path。
//
// 阈值（14 天、第 3 次）是试用值，试用到 2026-10-15，用我们自己的提交历史回测校准（见 docs/engineering-rules.md 重写判据）。
// 每次触发写一行 .claude/reuse-reminders.log，供校准。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCapabilityIndex, loadRegistries } from './build-capability-index.mjs'

export const FIX_WINDOW_DAYS = 14
export const FIX_THRESHOLD = 3
const FIX_SUBJECT = /^(fix|hotfix)(\(|:|!)/i
const SOURCE_FILE = /\.(ts|tsx|mts|cts|mjs)$/
const NOT_SOURCE = /\.(test|spec|node-test|e2e\.test)\.[cm]?[jt]sx?$|\.generated\.|\.d\.ts$/

const norm = (p) => String(p || '').split('\\').join('/')

/** 要不要管这个文件：src/、electron/ 下的非测试、非生成的源码。 */
export function isWatchedSource(rel) {
  const r = norm(rel)
  return (r.startsWith('src/') || r.startsWith('electron/')) && SOURCE_FILE.test(r) && !NOT_SOURCE.test(r)
}

/** 近 N 天里这个文件的 fix 提交数（git log 失败 = 0，fail-open）。 */
export function countRecentFixes(root, rel, { days = FIX_WINDOW_DAYS, git = defaultGit } = {}) {
  let out = ''
  try { out = git(root, ['log', `--since=${days} days ago`, '--no-merges', '--format=%s', 'HEAD', '--', rel]) } catch { return 0 }
  return out.split('\n').filter((s) => FIX_SUBJECT.test(s.trim())).length
}

function defaultGit(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
}

export function newFileMessage(rel, indexText) {
  return [
    `【已有能力 · 新建文件前】你在新建 ${rel}。动手前先对一遍：这件事仓库或依赖里是不是已经有了？`,
    indexText,
    '请在回复里补一行：`已查：X、Y；没找到：Z`。（只是提醒，不拦你。这份清单只和登记表一样全——登记漏的能力这里列不出来，拿不准就去读依赖的文档。）',
  ].filter(Boolean).join('\n')
}

export function rewriteMessage(rel, count) {
  return [
    `【重写判据 · 同一文件反复修】${rel} 近 ${FIX_WINDOW_DAYS} 天已有 ${count} 次 fix 提交，这一刀会是第 ${count + 1} 次。`,
    '出现任一条就停止打补丁：① 同一文件 14 天内第三次因 bug 修改；② 要给现有函数加第三个特例分支或参数；③ 改一处要读两处以上的旁路逻辑。',
    '此时选定「补 / 重写 / 删」之一并写出特征测试路径；选重写：先写特征测试钉住旧行为，只重写一个模块，同一次提交删掉旧的。（只是提醒，不拦你。）',
  ].join('\n')
}

/** 纯决策：给定载荷和环境，返回 { kind, message, ... } 或 null。 */
export function decideEditTimeReminder(payload, env) {
  const tool = payload?.tool_name
  if (tool !== 'Write' && tool !== 'Edit') return null
  const abs = payload?.tool_input?.file_path
  if (typeof abs !== 'string' || !abs) return null
  const root = env.root
  const rel = norm(path.relative(root, path.resolve(root, abs)))
  if (rel.startsWith('..') || !isWatchedSource(rel)) return null

  const exists = env.exists(path.resolve(root, abs))
  if (!exists) {
    const index = buildCapabilityIndex({ ...env.registries(), targetRel: rel })
    return { kind: 'new-file', rel, message: newFileMessage(rel, index.text), indexBytes: index.bytes }
  }
  const count = env.countFixes(rel)
  if (count >= FIX_THRESHOLD) return { kind: 'repeat-fix', rel, count, message: rewriteMessage(rel, count) }
  return null
}

function sessionMarker(sessionId) {
  return path.join(os.tmpdir(), `nomi-edit-reminders-${String(sessionId).replace(/[^\w-]/g, '_')}.json`)
}

/** 同一会话同一文件同一类提醒只来一次（否则每次 Edit 都重复，等于噪音）。 */
function alreadySent(sessionId, key) {
  if (!sessionId) return false
  try { return JSON.parse(fs.readFileSync(sessionMarker(sessionId), 'utf8')).includes(key) } catch { return false }
}
function markSent(sessionId, key) {
  if (!sessionId) return
  try {
    const file = sessionMarker(sessionId)
    let list = []
    try { list = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* 第一次 */ }
    fs.writeFileSync(file, JSON.stringify([...list, key]))
  } catch { /* fail-open */ }
}

function appendLog(root, line) {
  try {
    const dir = path.join(root, '.claude')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'reuse-reminders.log'), `${new Date().toISOString()} | ${line}\n`)
  } catch { /* fail-open */ }
}

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const payload = JSON.parse(raw || '{}')
  const cwd = payload.cwd || process.cwd()
  const root = process.env.CLAUDE_PROJECT_DIR
    || execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const result = decideEditTimeReminder(payload, {
    root,
    exists: (p) => fs.existsSync(p),
    registries: () => loadRegistries(root),
    countFixes: (rel) => countRecentFixes(root, rel),
  })
  if (!result) return
  const key = `${result.kind}:${result.rel}`
  if (alreadySent(payload.session_id, key)) return
  markSent(payload.session_id, key)
  appendLog(root, `${result.kind} | ${result.rel} | ${result.count ?? result.indexBytes ?? ''}`)
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: result.message } }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { /* fail-open：任何异常都静默放行 */ }).finally(() => process.exit(0))
}
