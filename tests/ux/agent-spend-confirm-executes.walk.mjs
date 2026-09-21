#!/usr/bin/env node
// 真实用户任务（R13/R16）：**「帮我生成一张六棱柱」→ 我在卡上把清晰度改了 → 我按了那颗印着价的
// 按钮。然后呢？** —— `agent-spend-card.walk.mjs` 停在按钮之前（它只证卡长对了、丢弃干净）；
// 这一条把按下去那一刻**走完**：真的发出去、真的出图、卡收起来。
//
// 只有远端供应商是 loopback 夹具（零额度）；SDK、IPC、ProductionRun、渲染层、落盘全是真的。
// 走查像真人一样点：打字、看卡、在卡上换清晰度、按主按钮——不灌 store、不直调桥、不伪造待决状态。
//
// 2026-09-21（Pass 3b）：这条走查此前**把一次拒绝当成了通过**。原因不是谁改坏了代码——
// `generationProviderBootstrap.ts` 全仓只把 apimart 装成可提交的生成供应商，而这条走查跑在自造的
// `agent-runtime-loopback` 上、且显式 `NOMI_E2E_PRODUCTION_FIXTURE=0`，于是确认必然停在供应商
// 就绪那一步；它断言的那句 toast（「…没有开始生成…」）正是那次拒绝的文案，PR #828 改了措辞就红了。
// 「改文案就红」说明这条走查钉的是拒绝话术，而它的名字叫「确认后真的执行」。现在它跑在
// `generationProvider: 'apimart'` 上：内置 apimart 档案 + 内置 curated mapping + 只认 loopback 的
// `NOMI_E2E_PRODUCTION_FIXTURE` 口子，供应商换成本机这台夹具服务器。
//
// 四条（全部是真人视角看得见的事）：
// 为什么这台机器上的模型**没有价目**：`NOMI_E2E_PRODUCTION_FIXTURE=1` 那条口子同时把 Run 的
// `policy.maxSpend` 钉成 0（`productionRunRuntime.ts`）——这是 E2E 的零额度硬保险：**任何有已知
// 价的作业都提交不了**（`approval-budget-exceeded`）。所以真机上能走完整条链的只有「算不出价」
// 那一档，而那恰好也是今天干净装机的真实处境（内置 204 个生成模型一条价都没有）。
// 「改参数 → 卡上价格原地重算 0.30→0.50 → 改动回写画布」那三拍由 `agent-spend-reprice.walk.mjs`
// 在自造 loopback 供应商上逐拍钉住；有价那条的封印/收据/决门由零额度的
// `electron/capabilityCore/agentPanelSpendConfirm.e2e.test.ts` 断言。
//
// 四条（全部是真人视角看得见的事）：
//   ① 卡在介入槽里等着（这台机器算不出价，主按钮是「仍要生成」）
//   ② 在卡上把清晰度换成 2K——真的点开下拉再选一项，不是往 store 里写值
//   ③ 按主按钮 → **改动真的到了宿主**：盘上那份候选里清晰度就是改后的那个
//      ⚠️ 这里本来还该断言「改后的清晰度真的随请求发到了供应商」——**今天不成立，而且是个真 bug**：
//      `executionContract.ts:compileParameters` 把候选里每个不在 `module.parameterSchema` 的参数
//      整个丢掉，而 `moduleCatalogBootstrap.ts:modelParameterSchema` 只从 `onboarding.fields` 和
//      `mapping.create.defaultParams` 派生——内置目录里 248 个 mapping 只有 12 个带 defaultParams、
//      156 个模型**一个**都没有 onboarding。于是 Agent 这条路上用户在卡上改的参数全被静默丢弃，
//      线缆上跑的是 archetypeWireDefaults 的默认值（实测：卡上选了 2K，供应商收到的是 1k）。
//      档案（archetype）才是「这个模型有哪些参数」的主人，而合同这一侧读的是另一份几乎空的声明。
//      2026-09-21 Pass 3b 实测发现，**没有在这一轮修**（它不是本轮那个发版阻断项，且改动面涉及
//      全部内置模型，属架构裁决）。报告与 TODO 记在案；修好之后请把这条走查的断言改成认线缆值。
//   ④ 产物真的落回**草稿那一刻建的那个节点**，卡收起来；一分钱没花（供应商是本机 loopback）
import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_TIMEOUT_MS, clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { FIXTURE_APIMART_MODEL, FIXTURE_APIMART_VENDOR, flattenRequestText } from './agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, INTERVENTION_CONFIRM,
  createRuntimeWalk, openCanvas, readProject, recorded, sendCanvas,
} from './agent-runtime-walk-support.mjs'

// 目录里没有价目 = 干净装机的真实处境，也是 E2E 零额度保险下唯一能真的跑完的一档（见文件头）。
process.env.NOMI_WALK_UNPRICED_MODEL = '1'

const ASK = 'S_SPEND_EXEC：帮我生成一张六棱柱的图。'
const PLAN_CALL = 's-spend-exec-1'
const GENERATE_CALL = `${PLAN_CALL}-generate`
const PRICE_UNAVAILABLE = '[data-v4-price="unavailable"]'
const EDITED_RESOLUTION = '2K'

/** 盘上那份 Run：宿主真正封进合同的那个金额 + 真正落盘的那份产物。 */
function readRunCandidate(projectRoot, runId) {
  const snapshot = path.join(projectRoot, '.nomi', 'runs', runId, 'run.json')
  if (!fs.existsSync(snapshot)) return null
  return JSON.parse(fs.readFileSync(snapshot, 'utf8')).run?.generationPlan?.candidate ?? null
}

function readRun(projectRoot, runId) {
  const snapshot = path.join(projectRoot, '.nomi', 'runs', runId, 'run.json')
  if (!fs.existsSync(snapshot)) return null
  const run = JSON.parse(fs.readFileSync(snapshot, 'utf8')).run
  return {
    envelope: run?.generationPlan?.authorizationEnvelope,
    artifacts: Array.isArray(run?.artifacts) ? run.artifacts : [],
  }
}

const walk = await createRuntimeWalk('spend-confirm-executes', { generationProvider: 'apimart' })
let failure
try {
  const { win } = await walk.start({ first: true })
  const { projectId } = await walk.newProject()
  const projectRoot = walk.report.projectRoot
  await openCanvas(win)

  // ① agent 只建草稿——付费能力不在模型工具面里（paidBoundary），钱那一下只能由人按。
  const planner = walk.fixture.expectText({
    label: 'the agent drafts a generation instead of spending on its own',
    match: (body) => flattenRequestText(body).includes('S_SPEND_EXEC'),
    reply: { type: 'tool', id: PLAN_CALL, name: 'draft_shots', args: {
      // 20 动词：draft_shots 建草稿（落画布、不出卡），generate 才把报价卡摆到用户面前。
      shots: [{ prompt: '一个悬浮的六棱柱，柔和的演播室灯光', taskKind: 'text_to_image', candidate: { providerId: FIXTURE_APIMART_VENDOR, modelId: FIXTURE_APIMART_MODEL }, parameters: { aspect_ratio: '16:9' } }],
    } },
  })
  let operationId
  const plannerDoneDraft = walk.fixture.expectText({
    label: 'the draft result comes back with the host-generated operationId',
    match: (body) => {
      const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === PLAN_CALL)
      if (!result) return false
      operationId = /"operationId":"([^"]+)"/.exec(String(result.content))?.[1]
      return true
    },
    reply: { type: 'hold' },
  })
  const plannerDone = walk.fixture.expectText({
    label: 'the drafting turn completes through the same SDK turn',
    match: (body) => (body.messages ?? []).some((message) => message.role === 'tool' && message.tool_call_id === GENERATE_CALL),
    reply: { type: 'text', text: 'S_SPEND_EXEC_DONE：草稿已就绪，等你确认。' },
  })
  await sendCanvas(win, ASK)
  await recorded(planner.received, 'generation draft request')
  await recorded(plannerDoneDraft.received, 'generation draft result')
  plannerDoneDraft.release({ type: 'tool', id: GENERATE_CALL, name: 'generate', args: { operationId } })
  await recorded(plannerDone.received, 'generation draft result')

  await expect.poll(async () => (await readProject(win, projectId)).payload.generationCanvas.nodes.length,
    { timeout: DEFAULT_TIMEOUT_MS }).toBe(1)
  const draftedNodeId = (await readProject(win, projectId)).payload.generationCanvas.nodes[0].id

  const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  const cardProbe = await proveProbe(card, 'The paid confirmation lives in the agent panel intervention slot')
  await expect(card.locator(PRICE_UNAVAILABLE), '这台机器的目录里没有价目，卡上如实说算不出')
    // 2026-09-22 换壳：这句话搬到页脚左下，措辞按用户拍板换成下面这一句
    // （它比「暂时算不出」多说了一件事：钱还是会扣，只是由供应商算）。锚点没变。
    .toHaveText('价格未知 · 以供应商账单为准')
  expect(walk.fixture.images, '卡还没按之前，一次供应商生成都没发生').toHaveLength(0)

  // ② 在卡上把清晰度换掉。这是真的点开下拉再选一项——不是往 store 里写一个值。
  // 比例必须先是一个具体值：这个档案的跨字段约束是「auto 只能配 1K」，草稿如果留 auto，
  // 把清晰度改成 2K 就是一份非法组合。
  const resolutionChip = card.locator('[data-parameter-chip="resolution"]')
  await expect(resolutionChip, '付费卡底栏上的清晰度 chip').toBeVisible()
  await clickOrFail(resolutionChip.locator('button').first(), '卡上的清晰度 chip')
  await clickOrFail(win.locator('[data-nomi-select-dropdown] [role="option"]').filter({ hasText: EDITED_RESOLUTION }).first(),
    `清晰度选项「${EDITED_RESOLUTION}」`)
  await expect(resolutionChip, 'chip 上印的值就是选完的那个')
    .toHaveAttribute('data-parameter-chip-value', EDITED_RESOLUTION)
  await walk.snap('spend-card-resolution-edited')

  // ③ 按主按钮。改动是在**按下那一刻**才写进 durable 候选的（持续双向同步会和落地链拉锯，
  //    见 useAgentPanelSpendConfirm 里的理由）。所以「盘上那份候选里清晰度是 2K」就是
  //    「这一下真的把改动送到了主进程」的证据——它落在盘上，渲染层伪造不了。
  const hostRefusals = []
  win.on('console', (message) => {
    const text = message.text()
    if (text.includes('[spend-confirm] host refused')) hostRefusals.push(text)
    if (process.env.NOMI_WALK_DEBUG === '1') console.log('[console]', message.type(), text.slice(0, 400))
  })
  await clickOrFail(card.locator(INTERVENTION_CONFIRM), '卡上的主按钮「仍要生成」', { noWaitAfter: true })

  // 先等「有结论」再判对错：只等 images 的话，一次被拒会以超时的形状报出来，看不见真正的原因。
  await expect.poll(() => walk.fixture.images.length + hostRefusals.length,
    { message: '按下确认之后必须有结论（发出去了，或者宿主说了为什么不行）', timeout: DEFAULT_TIMEOUT_MS }).toBeGreaterThan(0)
  expect(hostRefusals, `宿主不许拒（实际：${hostRefusals.join(' ')}）`).toHaveLength(0)
  expect(walk.fixture.images, '按下确认之后，供应商必须真的收到一次生成请求').not.toHaveLength(0)
  const submitted = walk.fixture.images[0].body
  expect(JSON.stringify(submitted), '发出去的就是卡上那一镜').toContain('六棱柱')
  // 改动真的到了主进程：盘上那份候选（不是渲染层的 store）带着改后的清晰度。
  const revised = readRunCandidate(projectRoot, operationId)
  expect(revised?.parameters?.resolution, '卡上改的那个清晰度真的落进了盘上那份候选').toBe(EDITED_RESOLUTION)
  expect(revised?.parameters?.aspect_ratio, 'agent 定的比例也还在').toBe('16:9')

  // ④ 产物真的落回草稿那一刻建的那个节点；卡答完就收起来；一分钱没花。
  await expect.poll(() => (readRun(projectRoot, operationId)?.artifacts ?? []).filter((item) => item.status === 'ready').length,
    { message: '产物必须真的落盘 —— 这就是用户说的「出图」', timeout: 90_000 }).toBeGreaterThan(0)
  await expect(win.locator(`[data-node-id="${draftedNodeId}"][data-status="success"]`),
    '还是草稿那一刻建的那个节点，屏上变成 success').toBeVisible({ timeout: 90_000 })
  await expectAbsent(card, { provenBy: cardProbe, message: '答完的卡要收起来（问题答完了就不该还在等人答）' })
  const nodes = (await readProject(win, projectId)).payload.generationCanvas.nodes
  expect(nodes, '全程只有一个节点（落地幂等：建草稿 / 改参数 / 出图共用同一个章）').toHaveLength(1)
  expect(nodes[0].id, '还是草稿那一刻建的那个节点').toBe(draftedNodeId)
  await walk.snap('spend-confirm-really-generated')

  walk.report.verified = ['card-waits-in-intervention-slot', 'param-edited-on-the-card',
    'confirm-pushes-the-edit-into-the-durable-candidate',
    'the-node-really-gets-its-artifact-and-the-card-folds-away']
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
