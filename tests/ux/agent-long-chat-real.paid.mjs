#!/usr/bin/env node
// 真模型数字 · 长对话：「读剧本 → 改 → 写回」来回 N 回合，每一次模型请求的输入 token、每回合时长、回合成功率。
//
//   NOMI_SPEND_OK=1 NOMI_REAL_ROUNDS=10 NOMI_REAL_LABEL=after node tests/ux/agent-long-chat-real.paid.mjs
//
// 同一份脚本在「修前」（main）与「修后」（本分支）两个构建上各跑一遍，数字写进验收页第 15 行。
// 只花文本模型的 token（APIMart 的 DeepSeek V3.2）；不碰图片 / 视频模型，没有任何生成提交。
// 凭据与原库保护见 _paidRun.mjs / _realProfile.mjs：明文 key 不落地、跑完删凭据副本、原库指纹跑前跑后比对。
import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_TIMEOUT_MS, clickOrFail, expect } from './_assert.mjs'
import { BRAIN } from './_agentVideoPaid.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { laneMessages, readLaneTranscripts } from './agent-lane-observer.mjs'
import { CREATION_PANEL, DOCUMENT, chooseAssistantModel, expandResidentPanel, sendCreation, waitForV4TurnIdle } from './agent-runtime-walk-support.mjs'

const ROUNDS = Number(process.env.NOMI_REAL_ROUNDS || 10)
const LABEL = process.env.NOMI_REAL_LABEL || 'run'
const scene = (index) => [`第${index}场 · 海港`, ...Array.from({ length: 75 }, (_, line) =>
  `${index}-${line + 1}　清晨的渔港，雾还没散。老渔民阿福把缆绳一圈圈绕在木桩上，远处的汽笛声压着浪头，他回头看了一眼空荡荡的码头，像是在等一个不会回来的人。`)].join('\n')
const SCRIPT = [scene(1), scene(2), scene(3)].join('\n\n')
const ASK = (round) => `第 ${round} 轮：把文稿里的剧本再收紧一点——先读全文，挑一场改得更短，改完把那一场写回文稿。每次只改一场。`

const paid = await openPaidWalk('agent-long-chat-real.paid.mjs', 'agent-long-chat-real', [BRAIN])
const { walk } = paid
let failure
try {
  const { win } = await walk.start({ first: true })
  await walk.newProject()
  await expandResidentPanel(win)
  await chooseAssistantModel(win, paid.label(BRAIN.vendorKey, BRAIN.modelKey), CREATION_PANEL)
  const doc = win.locator(DOCUMENT)
  await clickOrFail(doc, '文稿编辑区')
  await doc.fill(SCRIPT)
  const consent = win.getByRole('button', { name: '不分享', exact: true }).first()
  if (await consent.isVisible().catch(() => false)) await consent.click()

  const roundWall = []
  for (let round = 1; round <= ROUNDS; round += 1) {
    const startedAt = Date.now()
    try {
      await sendCreation(win, ASK(round))
      await waitForV4TurnIdle(win, { panel: CREATION_PANEL, doneTimeout: stationTimeout({ turns: 3 }) })
    } catch (error) {
      roundWall.push({ round, ms: Date.now() - startedAt, harnessError: String(error?.message ?? error).split('\n')[0] })
      continue
    }
    roundWall.push({ round, ms: Date.now() - startedAt })
    console.log(`[long-chat] 第 ${round} 轮 ${Math.round((Date.now() - startedAt) / 1000)}s`)
  }

  // 每一次模型请求的输入 token：从磁盘上的 lane transcript 读（assistant 消息上的 usage.input），按用户消息分回合。
  const turns = []
  for (const session of readLaneTranscripts(walk.report.projectRoot)) {
    for (const message of laneMessages(session)) {
      if (message.role === 'user' || message.role === 'nomi.input') turns.push({ inputs: [], failed: false, text: false })
      else if (message.role === 'assistant' && turns.length) {
        const turn = turns.at(-1)
        // 一次请求真正送进模型的输入 = 没命中缓存的 + 命中缓存读的 + 写缓存的（只看 usage.input 会漏掉缓存命中的那一大块）。
        if (message.usage) turn.inputs.push((Number(message.usage.input) || 0) + (Number(message.usage.cacheRead) || 0) + (Number(message.usage.cacheWrite) || 0))
        if (message.stopReason === 'error') turn.failed = true
        if (Array.isArray(message.content) && message.content.some((part) => part?.type === 'text' && String(part.text).trim())) turn.text = true
      }
    }
  }
  const requests = turns.flatMap((turn) => turn.inputs)
  const numbers = {
    label: LABEL, rounds: ROUNDS, turnsRecorded: turns.length, requests: requests.length,
    maxInputTokens: Math.max(0, ...requests),
    perTurnMax: turns.map((turn) => Math.max(0, ...turn.inputs)),
    perTurnSum: turns.map((turn) => turn.inputs.reduce((sum, value) => sum + value, 0)),
    meanRoundSeconds: Math.round(roundWall.reduce((sum, item) => sum + item.ms, 0) / Math.max(1, roundWall.length) / 1000),
    roundSuccess: `${turns.filter((turn) => !turn.failed && turn.text).length}/${ROUNDS}`,
    harnessErrors: roundWall.filter((item) => item.harnessError).length,
  }
  walk.report.numbers = numbers
  console.log(`[long-chat] ${JSON.stringify(numbers)}`)
  fs.writeFileSync(path.join(walk.report.outputDir, `long-chat-${LABEL}.json`), JSON.stringify({ numbers, roundWall }, null, 2))
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
}
