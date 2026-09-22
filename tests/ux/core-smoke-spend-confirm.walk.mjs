#!/usr/bin/env node
// 核心冒烟 · **花钱路最小的那一条**（2026-09-22 登记进 CORE_SMOKE_SCENARIOS）。
//
// 守的那件事：「Agent 要花钱 → 面板上出一张报价卡 → 用户点头才扣、点 × 一个节点都不动」这条路
// 每个非纯文档 PR 都走一遍。它此前只在 `agent-spend-card.walk.mjs` 那条大走查里覆盖，而那条不在
// 任何逢 PR 必跑的套件里——09-22 main 上 composer 消失 / 「2 版」打不开那次，CI 是全绿的。
//
// 四条断言（handoff 定的那四条，一条不多）：
//   ① 出卡：Agent 自己不许花钱，钱这一步必须变成介入槽里的一张报价卡，卡上有宿主算出来的真数字；
//   ② 确认后供应商**恰收一次**：不是零（点了没反应）、也不是两次（重试/双发把钱花两遍）；
//   ③ 节点出产物：确认之后那个节点真的拿到结果，不是卡在 running；
//   ④ × 后节点数不变：收回出价不删用户的任何节点（09-21 Q3 用户原话「不生成≠我的节点没了」）。
//
// 零付费：远端只有 `loopbackProvider`（`agent-runtime-fixture.mjs` 起的真 HTTP 回环服务，零额度）。
// SDK、IPC、ProductionRun、渲染层、落盘全是真的；不灌 store、不直调桥、不伪造待决状态。
//
// 用法：
//   pnpm run build && pnpm run test:core-smoke -- --fixture empty
//   pnpm run build && node tests/ux/core-smoke-spend-confirm.walk.mjs   （单跑，默认 empty + confirm 例）
import { DEFAULT_TIMEOUT_MS, clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { FIXTURE_IMAGE_MODEL, FIXTURE_VENDOR, flattenRequestText } from './agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, INTERVENTION_CONFIRM, INTERVENTION_REJECT,
  expandResidentPanel, readProject, recorded, sendCanvas,
} from './agent-runtime-walk-support.mjs'
import { launchCoreSmoke } from './core-smoke/fixture.mjs'

const ASK = 'CORE_SMOKE_SPEND：帮我生成一张六棱柱的图。'
const PLAN_CALL = 'core-smoke-spend-plan'
const GENERATE_CALL = `${PLAN_CALL}-generate`
const PROMPT = '一个悬浮的六棱柱，柔和的演播室灯光'
const PRICE_TOTAL = '[data-v4-price="total"]'

const smoke = await launchCoreSmoke({
  name: 'spend-confirm',
  // 这条场景只需要自己那一个空图片节点当落点；卡上的草稿由 agent 建，不预置待决状态。
  seed: () => ({ nodes: [], groups: [], edges: [] }),
  needs: ['loopbackProvider', 'fixtureTextModel'],
})
// 清单写了 cases: ['confirm', 'cancel']；runner 一个进程跑一例。单跑时默认 confirm。
const caseId = smoke.caseId || 'confirm'
const fixture = smoke.needs.loopbackProvider
const projectId = smoke.project.projectId

let failed = null
try {
  const win = await smoke.openProject()
  await expandResidentPanel(win)
  await expect(win.locator(`${CANVAS_PANEL} [data-v4-block="composer"]`),
    '默认档位就是「每次问我」：钱这一步不许被档位放行').toHaveAttribute('data-spend-policy', 'confirm')

  const nodesBefore = (await readProject(win, projectId)).payload.generationCanvas.nodes.map((entry) => entry.id).sort()

  // ── agent 只建草稿。付费能力按设计不在模型工具面里（paidBoundary）──────────────────────
  const planner = fixture.expectText({
    label: 'the agent drafts a generation instead of spending on its own',
    match: (body) => flattenRequestText(body).includes('CORE_SMOKE_SPEND'),
    reply: { type: 'tool', id: PLAN_CALL, name: 'draft_shots', args: {
      shots: [{ prompt: PROMPT, taskKind: 'text_to_image', candidate: { providerId: FIXTURE_VENDOR, modelId: FIXTURE_IMAGE_MODEL }, parameters: { size: '1024x1024' } }],
    } },
  })
  let operationId
  const draftResult = fixture.expectText({
    label: 'the draft result carries the host-generated operationId',
    match: (body) => {
      const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === PLAN_CALL)
      if (!result) return false
      operationId = /"operationId":"([^"]+)"/.exec(String(result.content))?.[1]
      return true
    },
    reply: { type: 'hold' },
  })
  const turnDone = fixture.expectText({
    label: 'the turn completes only after the user answered the priced card',
    match: (body) => (body.messages ?? []).some((message) => message.role === 'tool' && message.tool_call_id === GENERATE_CALL),
    reply: { type: 'text', text: 'CORE_SMOKE_SPEND_DONE' },
  })
  await sendCanvas(win, ASK)
  await recorded(planner.received, 'generation draft request')
  await recorded(draftResult.received, 'generation draft result')
  draftResult.release({ type: 'tool', id: GENERATE_CALL, name: 'generate', args: { operationId } })

  // 草稿先落画布：用户看得见 agent 到底要生成什么，钱还没动。
  await expect.poll(async () => (await readProject(win, projectId)).payload.generationCanvas.nodes.length,
    { timeout: DEFAULT_TIMEOUT_MS, message: '草稿要先落成画布上的一个节点' }).toBe(nodesBefore.length + 1)
  const drafted = (await readProject(win, projectId)).payload.generationCanvas.nodes
    .find((entry) => !nodesBefore.includes(entry.id))
  expect(Boolean(drafted), '落地的那个节点要认得出来').toBe(true)

  // ── ① 出卡 ────────────────────────────────────────────────────────────────────────
  const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  const cardProof = await proveProbe(card, 'The paid confirmation lives in the agent panel intervention slot')
  await expect(card.locator(PRICE_TOTAL), '卡上是宿主按目录 pricing 算出来的数字，不是一个标签').toContainText('0.30')
  await expect(card, '卡体就是那张生成框整件：提示词在卡上').toContainText('六棱柱')
  expect(fixture.images, '卡还没答，一次媒体请求都不许发').toHaveLength(0)
  const nodesWithDraft = (await readProject(win, projectId)).payload.generationCanvas.nodes.map((entry) => entry.id).sort()

  if (caseId === 'cancel') {
    // ── ④ × 后节点数不变 ──────────────────────────────────────────────────────────
    // 09-22 下午用户拍板：× 只收回**这一次出价**，节点和草稿都留着。
    await clickOrFail(card.locator(INTERVENTION_REJECT), '收回这次出价')
    await expectAbsent(card, { provenBy: cardProof, message: '收回之后付款卡退出介入槽' })
    const declined = flattenRequestText((await recorded(turnDone.received, 'generate returns once the user closed the card')).body)
    expect(declined, '模型读到的是「他关了这张卡」，不是一个错误').toContain('closed the priced card without approving')
    // 落地轮询在这段时间里对这份计划又跑过好几趟——节点数还是要一个不多一个不少。
    await expect.poll(async () => (await readProject(win, projectId)).payload.generationCanvas.nodes.map((entry) => entry.id).sort(),
      { timeout: DEFAULT_TIMEOUT_MS, message: '× 一个节点都不删（09-21 Q3：不生成≠我的节点没了）' })
      .toEqual(nodesWithDraft)
    expect(fixture.images, '× 之后一次媒体请求都没发出去').toHaveLength(0)
    console.log(`[core-smoke] spend-confirm/cancel 通过：节点 ${nodesWithDraft.length} 个不变，媒体请求 0 次`)
  } else {
    // ── ② 确认后供应商恰收一次 · ③ 节点出产物 ──────────────────────────────────────
    await clickOrFail(card.locator(INTERVENTION_CONFIRM), '按下那颗印着价的确认钮')
    await expectAbsent(card, { provenBy: cardProof, message: '答完之后付款卡退出介入槽' })
    await recorded(turnDone.received, 'generate returns once the user approved')
    await expect.poll(() => fixture.images.length,
      { timeout: DEFAULT_TIMEOUT_MS, message: '确认之后供应商要收到这一次生成' }).toBe(1)
    // 「恰一次」不是「至少一次」：再等一段，重试 / 双发会在这里现形。
    await win.waitForTimeout(1_500)
    expect(fixture.images, '一次确认只许扣一次：出站媒体请求恰好一次').toHaveLength(1)
    await expect.poll(async () => {
      const node = (await readProject(win, projectId)).payload.generationCanvas.nodes.find((entry) => entry.id === drafted.id)
      return node?.status
    }, { timeout: DEFAULT_TIMEOUT_MS, message: '确认之后那个节点要真的拿到产物' }).toBe('success')
    const node = (await readProject(win, projectId)).payload.generationCanvas.nodes.find((entry) => entry.id === drafted.id)
    expect(Boolean(node?.result?.url), '产物要有真的地址，不是一个空壳成功态').toBe(true)
    await expect.poll(async () => (await readProject(win, projectId)).payload.generationCanvas.nodes.map((entry) => entry.id).sort(),
      { timeout: DEFAULT_TIMEOUT_MS, message: '确认也不许凭空多出或少掉节点' }).toEqual(nodesWithDraft)
    console.log(`[core-smoke] spend-confirm/confirm 通过：出站 1 次，节点 ${node.id} 落成 success`)
  }
} catch (error) {
  failed = error
  console.error('[core-smoke] spend-confirm 失败：', error?.stack || error)
} finally {
  await smoke.close()
}
process.exit(failed ? 1 : 0)
