#!/usr/bin/env node
// 剧本 PB90 · 付费小额组 · 「Seedream 5.0 出一张最小档的图，看它落不落得了地」
//
// 用户 2026-09-29（0.22.1）：Seedream 5.0（两家渠道各几次）供应商那边出了图，Nomi 却显示失败，还劝切换供应商。
// 零花费夹具复现不了「真供应商回的那张图长什么样」，所以这一条只进付费小额组：发版前、显式 NOMI_SPEND_OK=1 才跑，
// 护栏、凭据副本与收据全走 tests/ux/_paidRun.mjs（CI 里拒跑、用户 Nomi 开着拒跑、原库指纹跑前跑后比对）。
//
// 花费：1 张 Seedream 5.0 Pro、1K、1:1（画布直生成，确认框点一次）。
// 核对（铁律 1 / 4）：
//   · 供应商只收到这一笔（节点运行记录 + 收据里恰好一个任务号）；
//   · 供应商给了任务号、节点却落成失败时，失败提示不许劝「换一家」（那等于劝人再花一次钱），并记下本机校验的原话。
//
// 2026-09-29 写好、未跑（任务书：这一阶段不花钱）。用法：
//   NOMI_SPEND_OK=1 node tests/ux/full-walk/playbooks/pb90-seedream5.paid.mjs
import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_TIMEOUT_MS, clickOrFail, expect } from '../../_assert.mjs'
import { openPaidWalk, spendReceipt } from '../../_paidRun.mjs'
import { stationTimeout } from '../../_station-budget.mjs'
import { clickNodeGenerate } from '../actions.mjs'

const SCRIPT = 'pb90-seedream5.paid.mjs'
const SEEDREAM = { vendorKey: 'apimart', modelKey: 'doubao-seedream-5-0-pro' }
const PROMPT = '白色桌面上的一只蓝色玻璃杯，柔和的窗光'

const paid = await openPaidWalk(SCRIPT, 'full-walk-seedream5', [SEEDREAM])
const { walk } = paid
let failure
const findings = []
try {
  const { win } = await walk.start({ first: true })
  await paid.lockToAuthorizedModels(win)
  const { projectId, projectRoot } = await walk.newProject()
  await clickOrFail(win.getByRole('button', { name: '生成', exact: true }), '顶栏「生成」')
  const nodes = async () => (await win.evaluate((id) => window.nomiDesktop.projects.readAsync(id), projectId)).payload.generationCanvas.nodes ?? []
  const before = new Set((await nodes()).map((node) => node.id))
  await clickOrFail(win.locator('[aria-label="添加图片节点"]').first(), '画布「添加图片节点」')
  await expect.poll(async () => (await nodes()).filter((node) => !before.has(node.id)).length, { message: '新卡落盘', timeout: DEFAULT_TIMEOUT_MS }).toBe(1)
  const nodeId = (await nodes()).find((node) => !before.has(node.id)).id
  const editor = win.locator(`[data-node-id="${nodeId}"] div[contenteditable="true"]`).last()
  await clickOrFail(editor, '新卡的提示词输入框')
  await editor.fill(PROMPT)
  // 模型：Seedream 5.0 Pro；清晰度取最小档 1K（参数芯片在就点，不在就记下默认值——花钱前核对）。
  await clickOrFail(win.locator(`[data-node-id="${nodeId}"] button[aria-label="模型"]`).first(), '卡上的模型下拉')
  await clickOrFail(win.locator('[data-nomi-select-dropdown] [data-nomi-select-option-label]').filter({ hasText: /Seedream 5\.0/ }).first(), '「Seedream 5.0 Pro」')
  const meta = (await nodes()).find((node) => node.id === nodeId)?.meta ?? {}
  if (meta.modelKey !== SEEDREAM.modelKey) throw new Error(`花钱前核对：卡上的模型是 ${meta.modelVendor}/${meta.modelKey}，不是被授权的 Seedream 5.0 Pro（一分钱没花）`)
  if (meta.resolution && !/^1k$/i.test(String(meta.resolution))) findings.push({ kind: 'note', message: `清晰度默认是 ${meta.resolution}，不是最小档 1K` })

  await clickNodeGenerate(win, nodeId)
  await expect.poll(async () => (await nodes()).find((node) => node.id === nodeId)?.status, { message: '这一张落定（成功或失败）', timeout: stationTimeout({ operations: 12 }) })
    .toMatch(/^(success|error|recoverable)$/)
  const landed = (await nodes()).find((node) => node.id === nodeId)
  const receipt = spendReceipt(projectRoot)
  walk.report.fullWalk = { nodeStatus: landed.status, error: landed.error ?? null, taskId: landed.result?.taskId ?? landed.runs?.[0]?.taskId ?? null, media: receipt.media }
  if (receipt.media.length !== 1) findings.push({ invariant: 1, rule: 'exactly-one-submission', message: `供应商收到 ${receipt.media.length} 笔（应恰好 1 笔）` })
  if (landed.status !== 'success') {
    const notice = await win.locator('.mantine-Notification-root').allInnerTexts()
    const decodeFailed = /decode|解码|校验/i.test(String(landed.error ?? ''))
    if (decodeFailed) findings.push({ invariant: 4, rule: 'provider-succeeded-nomi-failed', message: `供应商给了任务号，Nomi 本机校验判失败：${String(landed.error).slice(0, 200)}` })
    if (notice.some((text) => /切到|Switch to/.test(text))) findings.push({ invariant: 4, rule: 'suggests-switching-after-local-failure', message: `本机判失败之后提示劝换一家：${notice.join(' | ').slice(0, 200)}` })
  }
  await walk.snap('seedream5-landed')
  walk.report.fullWalk.findings = findings
  fs.writeFileSync(path.join(walk.outputDir, 'full-walk-findings.json'), JSON.stringify(findings, null, 2))
} catch (error) {
  failure = error
  process.exitCode = 2
} finally {
  await paid.finish(failure)
}
if (!failure && findings.some((finding) => finding.invariant)) process.exitCode = 1
