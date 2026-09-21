#!/usr/bin/env node
// 真实用户任务（R13）：**这台机器的模型目录里一条价都没填**（= 今天 204 个内置生成模型的真实处境，
// 也是每一台干净装机），我让 Agent 生成一张图，卡上会说什么？按下去会发生什么？
//
// 开闸前的答案：卡上写「暂时算不出价格」、主按钮退成「仍要生成」——**按下去必然失败**，
// 原因（`generation_pricing_unknown`）只进 console，用户只看到一个按了没反应的按钮（TODO T-MO-25）。
// 2026-09-21 用户拍板开闸后，这一条要证的是三件事：
//   ① 卡上那句话还在、按钮还是「仍要生成」，而且**整张卡上没有任何 ¥0**（未知≠免费）；
//   ② 按下去**真的过了价格那道闸**——宿主为一个算不出价的镜头铸出了付费授权信封，
//      盘上那份 Run 里 `price.maximum === null`、`budget.unknownJobCount === 1`（不是 0）；
//   ③ 英文一样（EN 串长 1.5-2 倍，截断只有眼睛看得出）。
//
// ⚠️ 这条走查证不到「产物真的落回节点」，和 `agent-spend-confirm-executes.walk.mjs` 同一个原因：
// 这台夹具的供应商身份是 `agent-runtime-loopback`，而 `generationProviderBootstrap.ts` 只把
// **apimart** 装成可提交的生成供应商。所以按下确认之后宿主会在**价格闸之后**、供应商那一步
// 诚实地停下来，一分钱不花。「确认 → 封印 → 铸收据 → 决门 → 真的发出去 → 账本记未知」那一整条，
// 由零额度的 `electron/capabilityCore/unknownPriceSpendConfirm.e2e.test.ts` 在真 loopback HTTP
// 供应商上逐条断言（Agent 面板 + 全自动两条路）。
import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_TIMEOUT_MS, clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { FIXTURE_IMAGE_MODEL, FIXTURE_VENDOR, flattenRequestText } from './agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, INTERVENTION_CONFIRM,
  createRuntimeWalk, openCanvas, readProject, recorded, sendCanvas,
} from './agent-runtime-walk-support.mjs'

// 这条走查的前提就是「目录里没有价目」。不设这个开关，夹具会种一行 pricing，
// 整条走查测的就是另一个世界了——所以在这里硬设，不靠调用方记得传。
process.env.NOMI_WALK_UNPRICED_MODEL = '1'

const ASK = 'S_UNPRICED：帮我生成一张六棱柱的图。'
const PLAN_CALL = 's-unpriced-1'
const GENERATE_CALL = `${PLAN_CALL}-generate`
const EN_PLAN_CALL = 's-unpriced-en-1'
const EN_GENERATE_CALL = `${EN_PLAN_CALL}-generate`
const PRICE_UNAVAILABLE = '[data-v4-price="unavailable"]'
const PRICE_TOTAL = '[data-v4-price="total"]'

/** 盘上那份 Run 的授权信封——「宿主真的为一个算不出价的镜头铸了付费授权」的唯一硬证据。 */
function readRunEnvelope(projectRoot, runId) {
  const snapshot = path.join(projectRoot, '.nomi', 'runs', runId, 'run.json')
  if (!fs.existsSync(snapshot)) return null
  const run = JSON.parse(fs.readFileSync(snapshot, 'utf8')).run
  return { state: run?.generationPlan?.state, envelope: run?.generationPlan?.authorizationEnvelope, budget: run?.budget }
}

const walk = await createRuntimeWalk('spend-unknown-price')
let failure
try {
  const { win } = await walk.start({ first: true })
  const { projectId } = await walk.newProject()
  const projectRoot = walk.report.projectRoot
  await openCanvas(win)

  const planner = walk.fixture.expectText({
    label: 'the agent drafts a generation on a model the catalog cannot price',
    match: (body) => flattenRequestText(body).includes('S_UNPRICED'),
    reply: { type: 'tool', id: PLAN_CALL, name: 'draft_shots', args: {
      shots: [{ prompt: '一个悬浮的六棱柱，柔和的演播室灯光', taskKind: 'text_to_image', candidate: { providerId: FIXTURE_VENDOR, modelId: FIXTURE_IMAGE_MODEL }, parameters: { size: '1024x1024' } }],
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
    reply: { type: 'text', text: 'S_UNPRICED_DONE：草稿已就绪，等你确认。' },
  })
  await sendCanvas(win, ASK)
  await recorded(planner.received, 'generation draft request')
  await recorded(plannerDoneDraft.received, 'generation draft result')
  plannerDoneDraft.release({ type: 'tool', id: GENERATE_CALL, name: 'generate', args: { operationId } })
  await recorded(plannerDone.received, 'generation draft result')

  await expect.poll(async () => (await readProject(win, projectId)).payload.generationCanvas.nodes.length,
    { timeout: DEFAULT_TIMEOUT_MS }).toBe(1)

  // ── ① 卡上说的是「算不出」，不是「免费」──
  const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  await proveProbe(card, 'The unpriced paid confirmation still reaches the intervention slot')
  const priceProbe = await proveProbe(card.locator(PRICE_UNAVAILABLE),
    'the card renders a data-v4-price slot at all（同一个属性、同一处 DOM）')
  await expect(card.locator(PRICE_UNAVAILABLE), '价格位印的是「暂时算不出价格」（warning 色）')
    .toHaveText('暂时算不出价格')
  // 「合计」那一格不在。基线由上面那条证过：同一个 `data-v4-price` 属性**测得到东西**，
  // 所以这里的「没看到」不是探针失灵——而是这张卡确实在「算不出」那一档，根本没有合计可印。
  await expectAbsent(card.locator(PRICE_TOTAL), { provenBy: priceProbe, message: '算不出价时根本没有「合计」那一格' })
  await expect(card.locator(INTERVENTION_CONFIRM), '主按钮退成「仍要生成」（不印金额）')
    .toHaveText('仍要生成')
  await expect(card, '多一句诚实交代：继续就得接受花多少事后才知道')
    .toContainText('花多少事后才知道')
  // **整张卡上不许有 ¥0 / 0.00**：三种可能（免费 / 算不出 / 真的零元）里，只有印 0 会被读成「这次免费」。
  const zhCardText = (await card.innerText()).replace(/\s+/g, ' ')
  expect(zhCardText, `卡上不许出现任何代表未知的 0（实际文本：${zhCardText}）`).not.toMatch(/[¥￥$]\s?0(?!\d)/)
  expect(zhCardText, '也不许是 0.00 那种写法').not.toContain('0.00')
  expect(walk.fixture.images, '卡还没按之前，一次供应商生成都没发生').toHaveLength(0)
  await walk.snap('unknown-price-card-zh')

  // ── ② 按下去：**不再是价格把你挡住了** ──
  //
  // 这台夹具的供应商身份是 `agent-runtime-loopback`，而 `generationProviderBootstrap.ts` 只把
  // apimart 装成可提交的生成供应商——所以 `gate_request` 会在**供应商就绪**那一步停下（它排在
  // 价格之前的位置上：mcpGenerationTools.ts 先查 readiness 再封印）。要证的正是这个：
  // 用户按下去之后听到的是「供应商」那件事，**不再是价格**。开闸前这颗钮按下去必然失败、
  // 而且原因只进 console（TODO T-MO-25）；现在失败原因既看得见，也和价格无关。
  //
  // 「确认 → 封印 → 铸收据 → 决门 → 真的发出去 → 账本记未知」那一整条由
  // electron/capabilityCore/unknownPriceSpendConfirm.e2e.test.ts 在真 loopback HTTP 供应商上断言；
  // 外部 MCP 那条由 tests/ux/mcp-l2-journeys.e2e.mjs 在 apimart 夹具供应商上跑完整程。
  // 用户那一侧看得见的证据（toast）与排查那一侧的证据（console 里宿主的原话）都要抓：
  // 前者证「按下去有回应」，后者证「停下来的理由不是价格」——两句话缺一条这条走查就不成立。
  const hostRefusals = []
  win.on('console', (message) => {
    const text = message.text()
    if (text.includes('[spend-confirm] host refused')) hostRefusals.push(text)
  })
  await win.evaluate(() => {
    window.__nomiToastLog = []
    const record = () => {
      for (const node of document.querySelectorAll('[class*="mantine-Notification-root"]')) {
        const text = (node.textContent ?? '').trim()
        if (text && !window.__nomiToastLog.includes(text)) window.__nomiToastLog.push(text)
      }
    }
    record()
    new MutationObserver(record).observe(document.body, { childList: true, subtree: true })
  })
  await clickOrFail(card.locator(INTERVENTION_CONFIRM), '卡上的主按钮「仍要生成」', { noWaitAfter: true })

  await expect.poll(async () => (await win.evaluate(() => window.__nomiToastLog ?? [])).length,
    { message: '按下去必须当场有回应，不能按了没反应（开闸前这里是一片沉默）', timeout: DEFAULT_TIMEOUT_MS }).toBeGreaterThan(0)
  const spoken = (await win.evaluate(() => window.__nomiToastLog ?? [])).join(' ')
  expect(spoken, '屏上说的是人话').toContain('暂时无法确认这一步的结果')
  expect(spoken, '不许把宿主的内部错误串倒给中文用户').not.toContain('configured_provider')

  // **这条走查真正要证的那一句**：宿主停下来的理由不再是价格。
  await expect.poll(() => hostRefusals.length,
    { message: '宿主那句原话必须进控制台（供排查），不能吞掉', timeout: DEFAULT_TIMEOUT_MS }).toBeGreaterThan(0)
  const refusal = hostRefusals.join(' ')
  // 阳性对照在上面：卡上 `data-v4-price="unavailable"` 在、`total` 不在 ⇒ 我们**确实**在
  // 「算不出价」那一档。所以这条「不是价格」才有意义，不是一句碰巧成立的否定。
  // 开闸前这里必然是 `generation_pricing_unknown`；现在它是供应商那一侧的失败
  // （这台夹具的 `agent-runtime-loopback` 不是可提交的生成供应商，见文件头）。
  expect(refusal, `「算不出价」这条拒绝已经不存在了（实际：${refusal}）`).not.toContain('pricing_unknown')
  expect(refusal, '也不该是任何价格相关的拒绝').not.toMatch(/known price|pricing/i)
  expect(refusal, '宿主确实回了一个失败码（不是空的）').toMatch(/generation_\w+/)
  // 阳性对照：Run 确实在盘上（不是「按钮压根没接上」）。
  const run = readRunEnvelope(projectRoot, operationId)
  expect(run, '这一笔的 Run 真的在盘上').toBeTruthy()
  expect(walk.fixture.images, '被拒之后依然一次供应商生成都没发生（零额度）').toHaveLength(0)
  await expect(card, '被拒之后卡还在等人答（问题没答完就不该消失）').toBeVisible()
  await walk.snap('unknown-price-after-confirm-zh')

  // ── ③ 英文：同一条路再走一遍（EN 串长 1.5-2 倍，截断只有眼睛看得出）──
  //
  // 为什么是**第二份草稿**而不是把上面那张卡切成英文：上面那张刚被按过一次（宿主拒了），
  // 拿一张带着拒绝态的卡去看文案，看到的是拒绝态不是未知价那一档。
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'en'))
  await win.reload()
  const enPlanner = walk.fixture.expectText({
    label: 'a second unpriced draft, this time with the UI in English',
    match: (body) => flattenRequestText(body).includes('S_UNPRICED_EN'),
    reply: { type: 'tool', id: EN_PLAN_CALL, name: 'draft_shots', args: {
      shots: [{ prompt: 'A floating hexagonal prism, soft studio lighting', taskKind: 'text_to_image', candidate: { providerId: FIXTURE_VENDOR, modelId: FIXTURE_IMAGE_MODEL }, parameters: { size: '1024x1024' } }],
    } },
  })
  let enOperationId
  const enDraftResult = walk.fixture.expectText({
    label: 'the English draft result carries its own operationId',
    match: (body) => {
      const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === EN_PLAN_CALL)
      if (!result) return false
      enOperationId = /"operationId":"([^"]+)"/.exec(String(result.content))?.[1]
      return true
    },
    reply: { type: 'hold' },
  })
  const enDone = walk.fixture.expectText({
    label: 'the English drafting turn completes',
    match: (body) => (body.messages ?? []).some((message) => message.role === 'tool' && message.tool_call_id === EN_GENERATE_CALL),
    reply: { type: 'text', text: 'S_UNPRICED_EN_DONE: the draft is ready for your confirmation.' },
  })
  await sendCanvas(win, 'S_UNPRICED_EN: please generate one more image of the prism.')
  await recorded(enPlanner.received, 'english generation draft request')
  await recorded(enDraftResult.received, 'english generation draft result')
  enDraftResult.release({ type: 'tool', id: EN_GENERATE_CALL, name: 'generate', args: { operationId: enOperationId } })
  await recorded(enDone.received, 'english generation draft result')

  const enCard = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  await expect(enCard.locator(PRICE_UNAVAILABLE), 'EN：Price unavailable right now')
    .toHaveText('Price unavailable right now')
  const enPriceProbe = await proveProbe(enCard.locator(PRICE_UNAVAILABLE), 'EN：the card renders a data-v4-price slot at all')
  await expectAbsent(enCard.locator(PRICE_TOTAL), { provenBy: enPriceProbe, message: 'EN：算不出价时没有 Total 那一格' })
  await expect(enCard.locator(INTERVENTION_CONFIRM), 'EN：Generate anyway').toHaveText('Generate anyway')
  await expect(enCard, 'EN：the honest sentence is there too').toContainText('only learn the cost afterwards')
  const enCardText = (await enCard.innerText()).replace(/\s+/g, ' ')
  expect(enCardText, `EN 卡上同样不许出现 ¥0（实际文本：${enCardText}）`).not.toMatch(/[¥￥$]\s?0(?!\d)/)
  expect(enCardText, 'EN 也不许是 0.00 那种写法').not.toContain('0.00')
  await walk.snap('unknown-price-card-en')

  walk.report.verified = ['card-says-unavailable-not-zero', 'confirm-label-is-generate-anyway',
    'no-zero-anywhere-on-the-card-zh-and-en', 'price-is-no-longer-the-reason-the-host-stops']
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
