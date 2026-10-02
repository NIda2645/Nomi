#!/usr/bin/env node
// 真付费 · 测试表第 15 行：2 张图，生成 1、去掉 1 → 供应商那边只多 1 个任务（只跑一次）。
//
//   NOMI_SPEND_OK=1 node tests/ux/agent-spend-per-shot-real.paid.mjs
//
// 大脑是真模型（APIMart 的 DeepSeek V3.2），图片模型是真的（APIMart 的 Nano Banana 2），花的是这台机器上用户自己配的 key：
// 一张图的钱 + 几轮文本 token。凭据与原库保护见 _paidRun.mjs / _realProfile.mjs：明文 key 不落地、跑完删凭据副本、
// 原库指纹跑前跑后比对；收据（这一场真正发生的付费调用）写进报告。
import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_TIMEOUT_MS, clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { BRAIN } from './_agentVideoPaid.mjs'
import { openPaidWalk, readProductionRuns, spendReceipt } from './_paidRun.mjs'
import { stationTimeout } from './_station-budget.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, INTERVENTION_ALTERNATE, INTERVENTION_CONFIRM,
  chooseAssistantModel, openCanvas, sendCanvas, waitForV4TurnIdle,
} from './agent-runtime-walk-support.mjs'

const IMAGE = { vendorKey: 'apimart', modelKey: 'gemini-3.1-flash-image-preview' }
const ASK = '画两张图：一张雨后水洼里漂着红色纸船，一张窗台上晒太阳的橘猫，都是 1:1。起草好就直接提交生成，我在确认卡上一张一张点。'
const TITLE = '[data-v4-block="slot-title"]'

const paid = await openPaidWalk('agent-spend-per-shot-real.paid.mjs', 'agent-spend-per-shot-real', [BRAIN, IMAGE])
const { walk } = paid
walk.report.rows = {}
let failure
try {
  const { win } = await walk.start({ first: true })
  const { projectRoot } = await walk.newProject()
  await openCanvas(win)
  await paid.lockToAuthorizedModels(win)
  await chooseAssistantModel(win, paid.label(BRAIN.vendorKey, BRAIN.modelKey), CANVAS_PANEL)
  const noShare = win.getByRole('button', { name: '不分享', exact: true }).first()
  if (await noShare.isVisible().catch(() => false)) await noShare.click()

  await sendCanvas(win, ASK)
  const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  await expect(card.locator(TITLE), '卡问的是这 2 张').toContainText('生成这 2 张图片', { timeout: stationTimeout({ turns: 2 }) })
  await card.locator(TITLE).hover({ position: { x: 2, y: 2 } })
  walk.report.rows['15-card'] = await walk.snap('15-card-two')
  await clickOrFail(card.locator(INTERVENTION_CONFIRM), '第 1 页「生成这张」（真花钱，一张）', { noWaitAfter: true })
  await expect(card.locator(TITLE), '卡还在，只剩第 2 张').toContainText('生成这 1 张图片', { timeout: stationTimeout({ operations: 4 }) })
  await card.locator(TITLE).hover({ position: { x: 2, y: 2 } })
  walk.report.rows['15-one-left'] = await walk.snap('15-card-one-left')
  const probe = await proveProbe(card, '只剩第 2 张的卡')
  await clickOrFail(card.locator(INTERVENTION_ALTERNATE), '第 2 张「去掉这张」', { noWaitAfter: true })
  await expectAbsent(card, { provenBy: probe, message: '两张都定了，卡关掉' }, stationTimeout({ operations: 4 }))
  // 等那一张真的出图（真供应商要几十秒）。
  await expect.poll(() => readProductionRuns(projectRoot).flatMap((run) => run.jobs).filter((job) => job.status === 'ready' || job.status === 'adopted').length,
    { message: '第 1 张出图', timeout: stationTimeout({ operations: 20 }) }).toBe(1)
  await waitForV4TurnIdle(win, { panel: CANVAS_PANEL, doneTimeout: stationTimeout({ turns: 1 }) }).catch(() => undefined)
  walk.report.rows['15-landed'] = await walk.snap('15-landed')
  const runs = readProductionRuns(projectRoot)
  const jobs = runs.flatMap((run) => run.jobs.map((job) => ({ shotId: job.metadata?.shotId, status: job.status, providerTaskId: job.providerTaskId ?? null })))
  const receipt = spendReceipt(projectRoot)
  walk.report.row15 = { jobs, mediaTasks: receipt.media, presentations: runs.map((run) => run.generationPlan?.presentations ?? []) }
  console.log(`[real-15] 作业：${JSON.stringify(jobs)}；供应商任务：${receipt.media.length}`)
  expect(receipt.media.length, '供应商那边只多 1 个任务').toBe(1)
  expect(jobs.filter((job) => job.providerTaskId).length, '只有一镜交给了供应商').toBe(1)
  fs.writeFileSync(path.join(walk.report.outputDir, 'row15.json'), JSON.stringify(walk.report.row15, null, 2))
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
}
