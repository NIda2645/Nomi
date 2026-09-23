#!/usr/bin/env node
// 「有卡待答时，用户在 composer 里继续打字」——这句话绝不允许石沉大海（2026-09-22 裁决 E）。
//
// ── 它补的是哪一格 ──
//
// 2026-09-22 真实模型 run3：A3 留下一张没人答的提问卡，之后 **15 句话连着没有任何反应**
// （`docs/evidence/2026-09-22-askback-real-model-run3/README.md`）。用户 09-21 拍板的是
// 「有问题待答时 composer 降一档，仍可用（先回答上面的问题，或继续说别的）」。
// 这条走查把那一刻钉成可重跑的零额度剧本：loopback 供应商必然出卡，UI 动作全真。
//
// 三条真人任务：
//   ① 提问卡待答 → 在 composer 里打一句、按回车      → 这句话**就是那道题的答案**，同一回合继续，
//      那一行读作「已回答 · 原话」——**不是**「✕ 已拒绝」（他明明刚回答了一个问题）；
//   ② 提问卡待答 → 打一句、按 Alt+回车（「排在这一轮之后」）→ 同上。有卡等人时这一轮不等他答就结束不了，
//      排在它后面 = 石沉大海；
//   ③ 提问卡待答 → 打一句、**点那颗圆钮** → 同上。复现时（2026-09-22）这颗钮此刻是「停止」：回合被停掉、
//      他打的字原样留在输入框里没发出去——run3 的走查点的就是它，连着 15 句没反应。
//      已修（2026-09-22，`AgentPanelV4Composer.tsx`）：在跑的时候，框里有字这颗钮就是「发送」，空着才是「停止」。
//
// Run: pnpm run build && node tests/ux/agent-gate-typing-answers.walk.mjs
import path from 'node:path'

import { DEFAULT_TIMEOUT_MS, clickOrFail, expect } from './_assert.mjs'
import { flattenRequestText, FIXTURE_TEXT_MODEL_LABEL } from './agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, COMPOSER_INPUT, COMPOSER_SEND, chooseAssistantModel, createRuntimeWalk,
  hasToolResult, openCanvas, sendCanvas, waitForV4TurnIdle,
} from './agent-runtime-walk-support.mjs'

const ASK_ARGS = { questions: [{ question: '这支片子想给谁看？' }] }
const CASES = [
  { id: 'enter', call: 'q-typing-enter', typed: '给我妈看，她不爱看快剪', done: 'TYPING_ENTER_DONE：好，按她的口味来。', how: 'Enter' },
  { id: 'follow-up', call: 'q-typing-follow', typed: '给同事看的，要短', done: 'TYPING_FOLLOW_DONE：好，做短的。', how: 'Alt+Enter' },
  { id: 'button', call: 'q-typing-button', typed: '算了先不删，帮我看看镜 2', done: 'TYPING_BUTTON_DONE：好，先看镜 2。', how: 'button' },
]

const walk = await createRuntimeWalk('gate-typing-answers')
const outDir = walk.outputDir
let failure

try {
  const { win } = await walk.start({ first: true })
  await walk.newProject()
  await chooseAssistantModel(win, FIXTURE_TEXT_MODEL_LABEL)
  await openCanvas(win)

  for (const item of CASES) {
    const ask = walk.fixture.expectText({
      label: `${item.id}：模型发出一次提问`, match: () => true,
      reply: { type: 'tool', id: item.call, name: 'ask_user', args: ASK_ARGS },
    })
    const answered = walk.fixture.expectText({
      label: `${item.id}：用户在 composer 里打的那句话回到模型手里`,
      match: (body) => hasToolResult(body, item.call),
      reply: { type: 'text', text: item.done },
    })
    await sendCanvas(win, `开始（${item.id}）`)
    await ask.received
    const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="question"]`).first()
    await expect(card, `${item.id}：提问卡出现`).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
    await win.screenshot({ path: path.join(outDir, `zh-${item.id}-card-pending.png`) })

    // **像人一样**：不去碰那张卡，直接在下面的 composer 里打字。
    const input = win.locator(`${CANVAS_PANEL} ${COMPOSER_INPUT}`)
    await input.click()
    await win.keyboard.type(item.typed, { delay: 8 })
    if (item.how === 'button') await clickOrFail(win.locator(`${CANVAS_PANEL} ${COMPOSER_SEND}`), 'composer 上那颗圆钮')
    else await win.keyboard.press(item.how)

    await waitForV4TurnIdle(win, {
      panel: CANVAS_PANEL,
      settledBy: win.locator(CANVAS_PANEL).getByText(item.done, { exact: false }).first(),
    })
    const body = flattenRequestText((await answered.received).body)
    expect(body, `${item.id}：模型必须读到用户打的那句话，而不是什么都没发生`).toContain(item.typed)
    // 面板上那一行：他**回答**了一个问题，不是拒绝了一个动作。
    const receipt = win.locator(`${CANVAS_PANEL} [data-v4-block]`).filter({ hasText: '已回答' }).filter({ hasText: item.typed }).first()
    await expect(receipt, `${item.id}：答完那一行要读作「已回答 · 原话」`).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
    await win.screenshot({ path: path.join(outDir, `zh-${item.id}-after.png`) })
  }
  console.log('gate-typing-answers walk ✅ shots →', outDir)
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
