#!/usr/bin/env node
// 「等用户只有一个 owner」的四条端到端证明（2026-09-22 · 裁决 A / C / E / F）。
//
// 真 Electron、真页面输入、真工具轨迹；文本模型与生成供应商都是 loopback（零额度）。
//
//   ① 报价卡待决时用户在输入框里打了字（E）→ 那句话**就是对这张卡的回答**：这一次出价收回、
//      草稿和画布节点都留着，`generate` 以成功形状把那句话一字不改交给模型；供应商一个请求都没收到。
//   ② 同一份草稿再出一次价 → 卡回来（同一个 operationId，不是新起一份）。
//   ③ 卡还挂着的时候**冷重启**（C）→ 那一次出价被收回：重开项目没有卡、没有人在等；
//      计划是 draft / 未 present（**不是** cancelled——重启不是用户说「不」），节点一个没少。
//   ④ 重启后用户再说一句「生成」→ 同一个 operationId 的卡 → 点「生成」→ 供应商**恰好收到一次**；
//      同一回合里模型**再调一次** `generate`（F）→ 不管宿主怎么答它，供应商仍然只收到那一次。
//
// 「看卡 >90 秒再确认仍成功」不在这里：`check:test-waits` 不许走查里放墙钟空等，而那条要证的不变量
// 本来也不是「90 秒」，是「等待不计入工具超时」——由 `tests/agent-runtime/lane-preflight-wait.test.mts`
// 用一个 50ms 预算的工具 + 阳性对照证（等在 execute 里同样久 → 超时）。

import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_TIMEOUT_MS, clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { FIXTURE_APIMART_MODEL, FIXTURE_APIMART_VENDOR, flattenRequestText } from './agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, INTERVENTION_CONFIRM,
  closeSpendCard, createRuntimeWalk, hasToolResult, openCanvas, readProject, recorded, sendCanvas,
} from './agent-runtime-walk-support.mjs'

// 目录里没有价目 = 干净装机的真实处境，也是零额度保险下唯一能真的跑完确认链的一档。
process.env.NOMI_WALK_UNPRICED_MODEL = '1'

const REDIRECT = 'S_WO_REDIRECT：先别生成，背景换成清晨的薄雾。'

function readPlan(projectRoot, runId) {
  const snapshot = path.join(projectRoot, '.nomi', 'runs', runId, 'run.json')
  if (!fs.existsSync(snapshot)) return null
  return JSON.parse(fs.readFileSync(snapshot, 'utf8')).run?.generationPlan ?? null
}

const walk = await createRuntimeWalk('spend-waiting-owner', { generationProvider: 'apimart' })
let failure
try {
  let { win } = await walk.start({ first: true })
  const { projectId, name } = await walk.newProject()
  const projectRoot = walk.report.projectRoot
  await openCanvas(win)
  const nodeIds = async () => (await readProject(win, projectId)).payload.generationCanvas.nodes.map((node) => node.id).sort()
  let card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)

  // ── ① 起草 → 出价 → 卡待决时用户打字 ────────────────────────────────────────────────
  const drafting = walk.fixture.expectText({
    label: 'the agent drafts one shot',
    match: (body) => flattenRequestText(body).includes('S_WO_ASK'),
    reply: { type: 'tool', id: 'wo-draft', name: 'draft_shots', args: {
      shots: [{ prompt: '一个悬浮的六棱柱，柔和的演播室灯光', taskKind: 'text_to_image', candidate: { providerId: FIXTURE_APIMART_VENDOR, modelId: FIXTURE_APIMART_MODEL }, parameters: { aspect_ratio: '16:9' } }],
    } },
  })
  let operationId
  const drafted = walk.fixture.expectText({
    label: 'the draft comes back with its operationId',
    match: (body) => {
      const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === 'wo-draft')
      if (!result) return false
      operationId = /"operationId":"([^"]+)"/.exec(String(result.content))?.[1]
      return true
    },
    reply: { type: 'hold' },
  })
  const redirected = walk.fixture.expectText({
    label: 'generate returns with what the user typed while the card was waiting',
    match: (body) => hasToolResult(body, 'wo-generate-1'),
    reply: { type: 'text', text: 'S_WO_HEARD：好，先不生成，我把背景改成清晨的薄雾。' },
  })
  await sendCanvas(win, 'S_WO_ASK：帮我生成一张六棱柱的图。')
  await recorded(drafting.received, 'draft request')
  await recorded(drafted.received, 'draft result')
  drafted.release({ type: 'tool', id: 'wo-generate-1', name: 'generate', args: { operationId } })
  const firstCardProof = await proveProbe(card, 'the priced card is really on screen before the user types')
  await expect.poll(nodeIds, { timeout: DEFAULT_TIMEOUT_MS }).toHaveLength(1)
  const draftedNodes = await nodeIds()
  await walk.snap('waiting-owner-01-card-pending')

  await sendCanvas(win, REDIRECT)
  const heard = flattenRequestText((await recorded(redirected.received, 'the turn continues with the typed text')).body)
  expect(heard, '那句话一字不改到了模型手里——不许石沉大海').toContain('背景换成清晨的薄雾')
  expect(heard, '模型读到的是「出价收回、什么都没花、草稿留着」，不是一个错误').toContain('this quote was withdrawn')
  await expectAbsent(card, { provenBy: firstCardProof, message: '打字 = 对这张卡的回答：这一次出价收回，卡不留着' })
  await expect(win.locator(`${CANVAS_PANEL}`).getByText('S_WO_HEARD', { exact: false }), '回合在同一轮里接着说话').toBeVisible()
  expect(readPlan(projectRoot, operationId), '收回的是这一次出价，不是这份计划').toMatchObject({ state: 'draft', cardHidden: true })
  expect(readPlan(projectRoot, operationId).cancelReason, '打字不是 ×').toBeUndefined()
  expect(await nodeIds(), '画布上的占位一个没动').toEqual(draftedNodes)
  expect(walk.fixture.images, '到此一次供应商请求都没有').toHaveLength(0)
  await walk.snap('waiting-owner-02-typed-text-withdrew-the-quote')

  // ── ② 同一份草稿再出一次价 → ③ 卡挂着的时候冷重启 ──────────────────────────────────
  const again = walk.fixture.expectText({
    label: 'the user asks again and the agent presents the SAME draft',
    match: (body) => flattenRequestText(body).includes('S_WO_AGAIN'),
    reply: { type: 'tool', id: 'wo-generate-2', name: 'generate', args: { operationId } },
  })
  await sendCanvas(win, 'S_WO_AGAIN：好了，就按现在这份生成吧。')
  await recorded(again.received, 'second present request')
  await expect(card, '同一个 operationId 的卡回来了').toBeVisible()
  const pendingCardProof = await proveProbe(card, 'the re-presented card is on screen before the restart')
  await walk.snap('waiting-owner-03-same-draft-presented-again')

  const requestsBeforeCold = walk.fixture.requests.length
  await walk.stopApp()
  ;({ win } = await walk.start())
  const projectCard = win.locator('[data-project-card="true"]').filter({ hasText: name })
  await expect(projectCard).toBeVisible()
  await projectCard.hover()
  await clickOrFail(projectCard.getByRole('button', { name: /继续创作/ }), '冷启动后重开这个项目')
  await win.waitForFunction((id) => location.href.includes(`projectId=${encodeURIComponent(id)}`), projectId)
  await openCanvas(win)
  card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  // 清扫挂在「打开项目」的补齐钩子上，是异步的：等盘上那份计划真的回到未 present，再断言卡不在。
  await expect.poll(() => readPlan(projectRoot, operationId)?.cardHidden === true, { timeout: DEFAULT_TIMEOUT_MS,
    message: '重启后那一次出价必须被收回（回 draft / 未 present）' }).toBe(true)
  await expectAbsent(card, { provenBy: pendingCardProof, message: '重启后没有任何人在等那张卡，它不许再出现' })
  expect(readPlan(projectRoot, operationId), '重启不是用户说「不」：计划还是 draft，不是 cancelled').toMatchObject({ state: 'draft' })
  expect(readPlan(projectRoot, operationId).cancelReason).toBeUndefined()
  expect(await nodeIds(), '重启前后画布节点一个没少、一个没多').toEqual(draftedNodes)
  expect(walk.fixture.images, '重启不提交媒体').toHaveLength(0)
  expect(walk.fixture.requests, '重启不重新请求模型').toHaveLength(requestsBeforeCold)
  await walk.snap('waiting-owner-04-restart-withdrew-the-quote')

  // ── ④ 重启后再说一句 → 同一份草稿出价 → 确认 → 同回合再 generate，钱只花一次 ─────────
  const afterRestart = walk.fixture.expectText({
    label: 'after the restart the user asks once more',
    match: (body) => flattenRequestText(body).includes('S_WO_FINAL'),
    reply: { type: 'tool', id: 'wo-generate-3', name: 'generate', args: { operationId } },
  })
  const approved = walk.fixture.expectText({
    label: 'generate returns approved, and the model (wrongly) calls generate once more in the same turn',
    match: (body) => hasToolResult(body, 'wo-generate-3'),
    reply: { type: 'tool', id: 'wo-generate-4', name: 'generate', args: { operationId } },
  })
  const secondAnswer = walk.fixture.expectText({
    label: 'whatever the host answers to the repeated generate, the turn ends',
    match: (body) => hasToolResult(body, 'wo-generate-4'),
    reply: { type: 'text', text: 'S_WO_DONE：已经在生成了。' },
  })
  await sendCanvas(win, 'S_WO_FINAL：生成吧。')
  await recorded(afterRestart.received, 'present after restart')
  await expect(card, '重启后说一句「生成」= 对同一份草稿重新出价').toBeVisible()
  const hostRefusals = []
  win.on('console', (message) => { if (message.text().includes('[spend-confirm] host refused')) hostRefusals.push(message.text()) })
  await clickOrFail(card.locator(INTERVENTION_CONFIRM), '卡上的主按钮', { noWaitAfter: true })
  await expect.poll(() => walk.fixture.images.length + hostRefusals.length,
    { message: '按下确认之后必须有结论', timeout: DEFAULT_TIMEOUT_MS }).toBeGreaterThan(0)
  expect(hostRefusals, `宿主不许拒（实际：${hostRefusals.join(' ')}）`).toHaveLength(0)
  expect(flattenRequestText((await recorded(approved.received, 'generate returns approved')).body),
    '模型读到「用户批了、已经开始生成」').toContain('The user approved the priced card')

  // 同回合第二次 generate：宿主可以拒（上一批还没结清），也可以再摆一张卡——但**不许**自己再花一次。
  // 再摆出来的卡像人一样关掉；两种走法下供应商收到的都必须还是那一次。
  const repeatCard = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  const settled = recorded(secondAnswer.received, 'the repeated generate is answered')
  const outcome = await Promise.race([
    settled.then(() => 'answered'),
    repeatCard.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT_MS }).then(() => 'card').catch(() => 'answered'),
  ])
  if (outcome === 'card') await closeSpendCard(repeatCard, '关掉重复出的那张卡')
  const repeatedText = flattenRequestText((await settled).body)
  expect(repeatedText, '重复的那次 generate 不许说「又开始生成了」').not.toMatch(/generation has started[^]*generation has started/)
  expect(walk.fixture.images, '同一回合里再调一次 generate，供应商仍然只收到一次（只扣一次）').toHaveLength(1)
  await walk.snap('waiting-owner-05-confirmed-once-charged-once')

  walk.report.verified = ['typed-text-answers-the-spend-card-and-withdraws-only-the-quote',
    'same-draft-can-be-presented-again', 'restart-withdraws-the-quote-not-the-plan',
    'confirm-after-restart-reaches-the-vendor-once', 'repeated-generate-in-the-same-turn-charges-nothing-more']
  walk.report.repeatedGenerate = outcome
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
