#!/usr/bin/env node
// 每日雷达（SessionStart hook 的本体）：会话一开就把「用户反馈雷达」「供应商模型雷达」跑掉并把结果注入上下文，
// 再提醒「论文雷达」「三日竞品雷达」。
//
// 为什么从 CLAUDE.md 的一段指令改成 hook：必须每次发生的事写成 hook，不写成指令（调研报告 §一.2；官方：CLAUDE.md 是 advisory，
// hook 是 deterministic）。原先靠 agent 在第一条消息里自觉去跑，跑没跑、跑败了有没有说成「没有新东西」都没人管。
//
// 不变量：**脚本跑败 = 明说「今天没查成」，绝不能说成「没有新反馈 / 没有新模型」**——失败的输出里不含任何「无新增」措辞。
// 一天只成功跑一次（标记 .claude/radar-last-run.json，按本机日期）；失败的下次会话重试，成功的不重跑。
// 细则与分诊规矩见 docs/engineering/daily-radars.md。普通 stdout 在 SessionStart 会进上下文（官方 hooks 文档）。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RADARS = [
  { key: 'intake', label: '用户反馈雷达', script: 'intake:radar', argv: ['scripts/intake-radar.mjs'], next: '有新反馈或有突增时才起 nomi-intake-radar 技能做分诊（真 bug / 配置问题 / 体验问题 / 数据上报问题，挂私有待办）' },
  { key: 'models', label: '供应商模型雷达', script: 'radar:models', argv: ['node_modules/tsx/dist/cli.mjs', 'scripts/model-radar.ts'], next: '`新增 > 0` 时才起 nomi-model-radar 技能做分诊；要接某个先出接入方案，点头后才写码；快照等用户看过再 -- --update-baseline' },
]
const TAIL_LINES = 14
const TAIL_CHARS = 1200
const TIMEOUT_MS = 60_000

const pad = (n) => String(n).padStart(2, '0')
export const localDate = (now) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

const tail = (text) => {
  const lines = String(text || '').split('\n').map((l) => l.trimEnd()).filter(Boolean)
  const out = lines.slice(-TAIL_LINES).join('\n')
  return out.length > TAIL_CHARS ? `…${out.slice(-TAIL_CHARS)}` : out
}

// 直接用 node 跑脚本本体（等价于 package.json 里 intake:radar / radar:models 的命令），不经 pnpm：
// hook 的 PATH 里不一定有 pnpm（Windows 上从 cmd 起子进程就找不到），而找不到它只会让雷达天天「没查成」。
function defaultRun(root, radar) {
  const result = spawnSync(process.execPath, radar.argv, { cwd: root, encoding: 'utf8', timeout: TIMEOUT_MS, windowsHide: true })
  return { status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, error: result.error }
}

function readMarker(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} }
}

/** 最新一份 docs/research/<date>-radar.md 的日期（没有 = null）。 */
export function latestPaperRadarDate(root, readdir = fs.readdirSync) {
  try {
    const dates = readdir(path.join(root, 'docs', 'research'))
      .map((name) => /^(\d{4}-\d{2}-\d{2})-radar\.md$/.exec(name)?.[1])
      .filter(Boolean)
      .sort()
    return dates.at(-1) ?? null
  } catch { return null }
}

/**
 * 纯逻辑（可测）：返回 { text, marker }。run(root, radar) 注入，便于喂假结果。
 */
export function runDailyRadar({ root, now = new Date(), run = defaultRun, marker = {}, readdir = fs.readdirSync }) {
  const today = localDate(now)
  const state = marker.date === today ? { ...marker } : { date: today }
  const lines = []

  for (const radar of RADARS) {
    if (state[radar.key]?.ok) {
      lines.push(`【${radar.label}】今天已跑过（${state[radar.key].at}），不重跑；要重跑：pnpm run ${radar.script}`)
      continue
    }
    const result = run(root, radar)
    const at = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    if (result.status === 0) {
      state[radar.key] = { ok: true, at }
      lines.push(`【${radar.label}】已跑（pnpm run ${radar.script}）：`)
      lines.push(tail(result.stdout) || '（脚本没有输出）')
      lines.push(`→ ${radar.next}`)
    } else {
      const why = result.error?.code === 'ETIMEDOUT' || result.signal ? `超时（>${TIMEOUT_MS / 1000}s）`
        : result.error ? `没能启动：${result.error.message}`
          : `脚本退出码 ${result.status}`
      state[radar.key] = { ok: false, at }
      lines.push(`【${radar.label}】今天没查成：${why}。这是脚本报错，**不是没有新东西**——不要说成「没有新反馈 / 没有新模型」。手动重跑：pnpm run ${radar.script}`)
      const detail = tail(result.stderr || result.stdout)
      if (detail) lines.push(detail)
    }
  }

  const paper = latestPaperRadarDate(root, readdir)
  if (paper === today) lines.push(`【论文雷达】今天已有 docs/research/${today}-radar.md，跳过。`)
  else lines.push(`【论文雷达】今天还没有 docs/research/${today}-radar.md（最新：${paper ?? '无'}）→ 静默跑 nomi-research-radar 技能（额度默认授权），回答时带出当天最该动的 1-2 件事。`)
  lines.push('【三日竞品雷达】首轮检查到期 / 未完成周期（nomi-competitive-radar；入口 docs/research/competitive/README.md）；失败不能记「无更新」，研究建议不能自动变成开发或发布授权。')
  return { text: lines.join('\n'), marker: state }
}

function main() {
  const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const markerFile = path.join(root, '.claude', 'radar-last-run.json')
  const { text, marker } = runDailyRadar({ root, marker: readMarker(markerFile) })
  try {
    fs.mkdirSync(path.dirname(markerFile), { recursive: true })
    fs.writeFileSync(markerFile, JSON.stringify(marker))
  } catch { /* 标记写不进去只会让下次再跑一遍 */ }
  process.stdout.write(`${text}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    process.stdout.write(`【每日雷达】今天没查成：雷达 hook 自己出错（${error instanceof Error ? error.message : String(error)}）。不是没有新东西；请手动跑 pnpm run intake:radar 与 pnpm run radar:models。\n`)
  }
  process.exit(0)
}
