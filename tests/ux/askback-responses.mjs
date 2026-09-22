#!/usr/bin/env node
// 把一轮走查的**模型正文**抄进证据目录：`responses/<caseId>.md`，逐字。
//
// 为什么要抄：轨迹 jsonl 只记工具调用，正文只有 lane transcript 里有；而 transcript 那份
// （`tests/ux/shots/.../evidence/agent-sessions/`）住在 `.gitignore` 忽略的 `tests/ux/shots/` 下，
// 下一轮起跑就会被覆盖。「模型自己认为该问」这一格的判据（`judgeProseQuestion`）读的就是它，
// 证据目录里没有这份原文，那一格事后就不可复核。run5 / run6 是手抄的，这里落成脚本。
//
// 用法：
//   node tests/ux/askback-responses.mjs <shotsDir> <evidenceDir> --label run7
//
// 归属靠的是 `readLaneTranscripts` 的**按文件名 ISO 时间戳排序**（agent-lane-observer.mjs 里那段注释
// 讲了 run4 为什么错）：每一轮走查都开一个「新对话」，所以第 n 个 session 就是第 n 个用例。
// 会话数与用例数对不上时**不猜**，直接报错退出——归错用例比没有这份文件更坏。
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { readLaneTranscripts, laneMessages } from './agent-lane-observer.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { label: { type: 'string' } },
})
const [shotsDir, evidenceDir] = positionals
if (!shotsDir || !evidenceDir) {
  console.error('usage: node tests/ux/askback-responses.mjs <shotsDir> <evidenceDir> [--label run7]')
  process.exit(1)
}
const LABEL = values.label || 'run'

const report = JSON.parse(fs.readFileSync(path.join(shotsDir, 'report.json'), 'utf8'))
// `readLaneTranscripts` 要的是**项目根**，它自己去拼 `.nomi/agent-sessions`。
// 走查收尾时把那个目录整个拷成了 `<shotsDir>/evidence/agent-sessions`，所以这里造一个同形的根。
const projectRoot = path.join(shotsDir, 'evidence', '_as-project')
fs.rmSync(projectRoot, { recursive: true, force: true })
fs.mkdirSync(path.join(projectRoot, '.nomi'), { recursive: true })
fs.cpSync(path.join(shotsDir, 'evidence', 'agent-sessions'), path.join(projectRoot, '.nomi', 'agent-sessions'), { recursive: true })

// 一条**空**的 lane 不是一轮：走查开跑时项目里已经有 `main`（0 条消息），
// 18 轮各自 `新对话 N`，于是磁盘上是 19 个 session。按序号硬配就会整体错开一位。
const sessions = readLaneTranscripts(projectRoot).filter((session) => laneMessages(session).length > 0)
if (sessions.length !== report.cases.length) {
  console.error(`非空会话数 ${sessions.length} ≠ 用例数 ${report.cases.length}——按序号归属会归错，这里不猜。`)
  process.exit(1)
}

const outDir = path.join(evidenceDir, 'responses')
fs.mkdirSync(outDir, { recursive: true })
for (const [index, row] of report.cases.entries()) {
  const session = sessions[index]
  const prose = []
  for (const message of laneMessages(session)) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (part?.type === 'text' && typeof part.text === 'string' && part.text.trim()) prose.push(part.text)
    }
  }
  const q = row.proseQuestion ?? {}
  const lines = [
    `# ${LABEL} · ${row.id}`,
    '',
    `> 用户原话：${row.text ?? ''}`,
    '>',
    `> shouldAsk=${row.shouldAsk} · 调了 ask_user=${row.askedUser === true} · **正文里问了=${row.askedInProse === true}**`
      + `（问号收尾=${q.endsWithQuestion === true} · 编号选项=${q.numberedOptions === true}）`,
    '>',
    // 没跑到模型的轮次**先说这一句**：那几份文件是空的，而「空」正是那件事的直接证据，
    // 不写明的话读的人会以为是抄漏了。
    `> 跑到模型=${row.reachedModel !== false}${row.reachedModel === false ? ` · 结局：\`${row.assistantError ?? 'failed'}\`` : ''}`,
    '',
    // 引的是**真的那一份**（`evidence/agent-sessions/…`），不是下面那个临时搭出来的项目根——
    // 后者跑完就删了，写进证据里等于指向一个不存在的文件。
    `来源：\`${path.join('evidence', 'agent-sessions', path.relative(path.join(projectRoot, '.nomi', 'agent-sessions'), session.path))}\``
      + '（走查收尾时拷进 `tests/ux/shots/askback-real-model/ask-run7/` 的那份 lane transcript）里的 assistant 文本段，'
      + '逐字，与 `*.trace/trace.md` 的 `### Response` 同一份。',
    `判据：\`tests/ux/askback-option-judges.mjs\` 的 \`judgeProseQuestion\`，量的是**最后一条**消息。`,
    '',
    '---',
    '',
  ]
  if (prose.length === 0) lines.push('_这一轮模型没有写下任何正文。_', '')
  for (const [n, text] of prose.entries()) lines.push(`## 第 ${n + 1} 段`, '', text, '', '')
  fs.writeFileSync(path.join(outDir, `${row.id}.md`), lines.join('\n'))
}
fs.rmSync(projectRoot, { recursive: true, force: true })
console.log(`responses → ${outDir}（${report.cases.length} 份）`)
