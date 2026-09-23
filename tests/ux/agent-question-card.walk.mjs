#!/usr/bin/env node
// 反问卡的**真人式**整机走查：像人一样打字、像人一样点那颗 chip、像人一样在卡里自己写一句。
//
// ── 它补的是哪一格 ──
//
// 真实模型那条腿（`agent-askback-real-model.walk.mjs`）证的是「它会不会问」，
// 要花钱、而且模型问不问是概率的。这条腿证的是另一件事：**问出来之后，用户答得了吗**。
// 所以远端供应商用 loopback（零额度、必然触发），而从「打字」到「点 chip」到
// 「在卡里写一句」全部是真实 UI 动作——渲染层、IPC、AgentLane、审批闸、pi SDK、
// 落盘一条不绕（`docs/lessons/tests-must-drive-ui-like-a-human.md`）。
//
// 两条真人任务（任务书点名的那两条）：
//   ① 点 chip 作答 → 回合**在同一轮里**继续，模型收到的就是 chip 上那几个字；
//   ② 卡内自由输入作答 → 同上，模型收到的是他打的那句话。
//
// 两轨都拍 zh / en 真截图（EN 串长 1.5–2 倍，截断只有眼睛看得出，R15）。
//
// Run: pnpm run build && node tests/ux/agent-question-card.walk.mjs
import { stationTimeout } from './_station-budget.mjs'
import fs from 'node:fs'
import path from 'node:path'

import { clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { flattenRequestText } from './agent-runtime-fixture.mjs'
import { FIXTURE_TEXT_MODEL_LABEL } from './agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, chooseAssistantModel, createRuntimeWalk,
  hasToolResult, openCanvas, sendCanvas, waitForV4TurnIdle,
} from './agent-runtime-walk-support.mjs'

const CHIP_CALL = 'q-chip-1'
const FREE_CALL = 'q-free-1'
const CHIP_DONE = 'Q_CHIP_DONE：好，按镜 2 那条走。'
const FREE_DONE = 'Q_FREE_DONE：收到，按你说的那版做。'

/** ① 指代不清：选项**就是候选本身**（2026-09-21 用户点名的内容规矩）。 */
const CHIP_ARGS = {
  questions: [{
    question: '要删哪一个？',
    options: [
      { id: 'shot-2', label: '镜 2 · 推门', description: '画布中间那张，还没出过图' },
      { id: 'shot-3', label: '镜 3 · 走廊', description: '最右边那张静帧' },
    ],
  }],
}
/** ② 没有短清单能覆盖的题：一个选项都不给，卡照样成立——自由输入是卡的固有能力。 */
const FREE_ARGS = { questions: [{ question: '这支片子想给谁看？我按那个人的口味定语气和节奏。' }] }

const CHIP_ANSWER = '镜 2 · 推门'
const FREE_ANSWER = '给我妈看，她不爱看快剪'

const walk = await createRuntimeWalk('question-card')
const outDir = walk.outputDir
let failure

try {
  const { win } = await walk.start({ first: true })
  await walk.newProject()
  await chooseAssistantModel(win, FIXTURE_TEXT_MODEL_LABEL)
  await openCanvas(win)

  // ── ① chip 作答 ────────────────────────────────────────────────────────
  const askChip = walk.fixture.expectText({
    label: '第一轮把一次提问发出来',
    match: () => true,
    reply: { type: 'tool', id: CHIP_CALL, name: 'ask_user', args: CHIP_ARGS },
  })
  const chipAnswered = walk.fixture.expectText({
    label: '用户点的那颗 chip 一字不改回到模型手里',
    match: (body) => hasToolResult(body, CHIP_CALL),
    reply: { type: 'text', text: CHIP_DONE },
  })
  await sendCanvas(win, '把那个删了')
  await askChip.received

  const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="question"]`).first()
  await card.waitFor({ state: 'visible', timeout: stationTimeout() })
  await expect(card.getByText('要删哪一个？', { exact: false }).first())
    .toBeVisible({ timeout: stationTimeout() })
  // 说明那一行也要真的印出来——它是「用户认得出哪一个」的唯一凭据。
  await expect(card.getByText('画布中间那张，还没出过图', { exact: false }).first())
    .toBeVisible({ timeout: stationTimeout() })
  await win.screenshot({ path: path.join(outDir, 'zh-question-chip-before.png') })

  // 「第二张卡上一个选项都没有」是一句**不存在**断言，所以探针要在**这张卡还在**的时候证：
  // 它此刻数得到 2 颗。等到第二张卡出来再证就晚了——那时它当然是 0，
  // 而「0」既可能是「真的没有」也可能是「选择器坏了」（`proveProbe` 在签名上逼着做这一步）。
  const optionProbe = await proveProbe(
    card.locator('[data-v4-control="question-option"]'),
    '第一张卡上的选项 chip（证明这个探针不是瞎的）',
  )

  // **像人一样点**：按 chip 上印的字找它，不按 id、不按第 n 个。
  const chip = card.locator('[data-v4-control="question-option"]').filter({ hasText: '镜 2 · 推门' }).first()
  await clickOrFail(chip, '反问卡上那颗「镜 2 · 推门」')
  // 落地的**阳性**信号 = 答完之后模型那句回话真的印在面板上。
  // 只等 `running` 消失是一句「不存在」断言，而 loopback 回得比第一帧还快。
  await waitForV4TurnIdle(win, {
    panel: CANVAS_PANEL,
    settledBy: win.locator(CANVAS_PANEL).getByText(CHIP_DONE, { exact: false }).first(),
  })

  const chipBody = flattenRequestText((await chipAnswered.received).body)
  expect(chipBody, '点 chip 之后，模型收到的必须就是 chip 上那几个字').toContain(CHIP_ANSWER)
  // 答完那一行必须读作「已回答」，**不许**写成失败。
  // 2026-09-21 第一次真机跑出来的就是「问你一个问题 ⚠ 失败」：协议上那次确实是
  // `allow:false`（没有东西要执行），而面板把「没跑」读成了「坏了」。
  // 用户刚刚回答了一个问题，屏幕上告诉他失败了——这条断言就是为它立的。
  // 答完那一行印的是「已回答 · 他的原话」。收据行在 `output-denied` 档下不带展开体，
  // 所以按**那一行的文字**找它，不按 `<details>` 外壳找。
  const chipReceipt = win.locator(`${CANVAS_PANEL} [data-v4-block]`).filter({ hasText: '已回答' }).first()
  await expect(chipReceipt, '答完之后那一行要读作「已回答」').toBeVisible({ timeout: stationTimeout() })
  await expect(chipReceipt, '「已回答」那一行要带上他选的那几个字').toContainText(CHIP_ANSWER)
  await expect(
    win.locator(`${CANVAS_PANEL} [data-v4-block]`).filter({ hasText: '问你一个问题' }).filter({ hasText: '失败' }),
    '用户刚回答完一个问题，屏幕上不许告诉他「失败」',
  ).toHaveCount(0, { timeout: stationTimeout() })
  await win.screenshot({ path: path.join(outDir, 'zh-question-chip-after.png') })

  // ── ② 卡内自由输入 ─────────────────────────────────────────────────────
  const askFree = walk.fixture.expectText({
    label: '第二轮问一个没有短清单的问题',
    match: () => true,
    reply: { type: 'tool', id: FREE_CALL, name: 'ask_user', args: FREE_ARGS },
  })
  const freeAnswered = walk.fixture.expectText({
    label: '他自己打的那句话一字不改回到模型手里',
    match: (body) => hasToolResult(body, FREE_CALL),
    reply: { type: 'text', text: FREE_DONE },
  })
  await sendCanvas(win, '帮我定个调子')
  await askFree.received

  const freeCard = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="question"]`).first()
  await freeCard.waitFor({ state: 'visible', timeout: stationTimeout() })
  // 一个选项都没有的那张卡：**自由输入那一行必须还在**（它跟着 kind 走，不跟着 options 走）。
  const answerInput = freeCard.locator('[data-v4-control="question-answer"]').first()
  await answerInput.waitFor({ state: 'visible', timeout: stationTimeout() })
  await expectAbsent(
    freeCard.locator('[data-v4-control="question-option"]'),
    { provenBy: optionProbe, message: '没给选项的那张卡上不该凭空长出 chip' },
  )
  await win.screenshot({ path: path.join(outDir, 'zh-question-free-before.png') })

  // **像人一样写**：点进那一行、逐字打、按回车。
  await answerInput.click()
  await win.keyboard.type(FREE_ANSWER, { delay: 12 })
  await win.keyboard.press('Enter')
  await waitForV4TurnIdle(win, {
    panel: CANVAS_PANEL,
    settledBy: win.locator(CANVAS_PANEL).getByText(FREE_DONE, { exact: false }).first(),
  })

  const freeBody = flattenRequestText((await freeAnswered.received).body)
  expect(freeBody, '卡内打的那句话必须原样成为模型看到的 tool result').toContain(FREE_ANSWER)
  await win.screenshot({ path: path.join(outDir, 'zh-question-free-after.png') })

  // ── EN 轨不在这条走查里 ──────────────────────────────────────────────
  //
  // 这里**不能**用 `win.evaluate(setItem) + win.reload()` 换语言：原地刷新之后
  // `getActiveWorkbenchProjectId()` 恒 null，面板会静默空掉，看起来像极了一个真 bug
  // （`docs/lessons/walkthrough-no-win-reload.md`）。而这条走查的全部价值是
  // 「答得了吗」，不是「英文外壳长什么样」。
  // EN 那一轨由 `design-lab-question-card-generality.walk.mjs` 出（它本来就是 zh/en 两轨），
  // 两边渲的是同一个 `V4Intervention`。

  console.log('question-card walk ✅ shots →', outDir)
  console.log(fs.readdirSync(outDir).filter((file) => file.endsWith('.png')).join('\n'))
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
