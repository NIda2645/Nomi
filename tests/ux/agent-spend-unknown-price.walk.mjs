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
// 2026-09-21（Pass 3b）：这条走查此前**只证到「按下去有回应」**——因为它跑在自造供应商
// `agent-runtime-loopback` 上，而 `generationProviderBootstrap.ts` 全仓只把 apimart 装成可提交
// 的生成供应商，于是确认键必然在供应商就绪那一步被拒。「有 toast 就算有反应」不是验收标准：
// 用户要的是**按下去真的出图**。现在这条走查跑在 `generationProvider: 'apimart'` 上——内置
// apimart 档案 + 内置 curated mapping + 只认 loopback 的 `NOMI_E2E_PRODUCTION_FIXTURE` 口子，
// 供应商换成本机这台夹具服务器（零额度）。于是「确认 → 封印 → 铸收据 → 决门 → 真的发出去 →
// 产物落回同一个节点」整条链在**真实界面上**被硬断言。
import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_TIMEOUT_MS, clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { FIXTURE_APIMART_MODEL, FIXTURE_APIMART_VENDOR, flattenRequestText } from './agent-runtime-fixture.mjs'
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
  return {
    state: run?.generationPlan?.state, envelope: run?.generationPlan?.authorizationEnvelope, budget: run?.budget,
    artifacts: Array.isArray(run?.artifacts) ? run.artifacts : [],
  }
}

const walk = await createRuntimeWalk('spend-unknown-price', { generationProvider: 'apimart' })
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
      shots: [{ prompt: '一个悬浮的六棱柱，柔和的演播室灯光', taskKind: 'text_to_image', candidate: { providerId: FIXTURE_APIMART_VENDOR, modelId: FIXTURE_APIMART_MODEL }, parameters: {} }],
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
  const cardProbe = await proveProbe(card, 'The unpriced paid confirmation still reaches the intervention slot')
  const priceProbe = await proveProbe(card.locator(PRICE_UNAVAILABLE),
    'the card renders a data-v4-price slot at all（同一个属性、同一处 DOM）')
  // 2026-09-22 换壳：这句话从卡体的价格行搬到了**页脚左下**（离按钮两厘米），
  // 措辞也按用户拍板改成「价格未知 · 以供应商账单为准」——它比「暂时算不出」
  // 多说了一件用户真正要知道的事：钱还是会扣，只是由供应商算。锚点没变。
  await expect(card.locator(PRICE_UNAVAILABLE), '页脚左下印的是「价格未知 · 以供应商账单为准」（warning 色）')
    .toHaveText('价格未知 · 以供应商账单为准')
  // 「合计」那一格不在。基线由上面那条证过：同一个 `data-v4-price` 属性**测得到东西**，
  // 所以这里的「没看到」不是探针失灵——而是这张卡确实在「算不出」那一档，根本没有合计可印。
  await expectAbsent(card.locator(PRICE_TOTAL), { provenBy: priceProbe, message: '算不出价时根本没有「合计」那一格' })
  // 主按钮只说动作（金额在页脚左下）。`toHaveText` 换成两条更准的：
  // 文案对 + **一个金额符号都不许有**——原来那条断的其实就是后半句。
  await expect(card.locator(INTERVENTION_CONFIRM), '主按钮退成「仍要生成」').toContainText('仍要生成')
  await expect(card.locator(INTERVENTION_CONFIRM), '主按钮上不印金额').not.toContainText('¥')
  // 算不出价**绝不拦**生成（用户 2026-09-21 硬性拍板）：按钮必须是可点的。
  await expect(card.locator(INTERVENTION_CONFIRM), '算不出价时主按钮照样可点').toBeEnabled()
  // 那句交代**只说一遍**（2026-09-22）：页脚左下已经是「价格未知 · 以供应商账单为准」，
  // 正文下原来那句「…花多少事后才知道」是同一件事的第二遍，已删。这里改钉「没有第二遍」。
  await expect(card, '同一件事不说两遍').not.toContainText('花多少事后才知道')
  // **整张卡上不许有 ¥0 / 0.00**：三种可能（免费 / 算不出 / 真的零元）里，只有印 0 会被读成「这次免费」。
  const zhCardText = (await card.innerText()).replace(/\s+/g, ' ')
  expect(zhCardText, `卡上不许出现任何代表未知的 0（实际文本：${zhCardText}）`).not.toMatch(/[¥￥$]\s?0(?!\d)/)
  expect(zhCardText, '也不许是 0.00 那种写法').not.toContain('0.00')
  expect(walk.fixture.images, '卡还没按之前，一次供应商生成都没发生').toHaveLength(0)
  await walk.snap('unknown-price-card-zh')

  // ── ② 按下去：**真的发起生成、真的出图** ──
  //
  // 这一段就是这条走查的验收门。判据不是「屏上冒出一句话」——那只证明代码跑到了某个 catch；
  // 判据是这四件事同时成立：供应商真的收到一次生成请求、送出去的就是卡上那一镜、盘上那张
  // 授权信封的金额位是 `null`（不是 0）、产物真的落回**草稿那一刻建的那个节点**且屏上变成 success。
  // 阳性对照在上面：按之前 `walk.fixture.images` 刚断过是 0，所以下面的「收到了」不是本来就有。
  const hostRefusals = []
  win.on('console', (message) => {
    const text = message.text()
    if (text.includes('[spend-confirm] host refused')) hostRefusals.push(text)
  })
  const nodeId = (await readProject(win, projectId)).payload.generationCanvas.nodes[0].id
  await clickOrFail(card.locator(INTERVENTION_CONFIRM), '卡上的主按钮「仍要生成」', { noWaitAfter: true })

  // ②-a 供应商真的收到了请求（这台夹具的 `/v1/images/generations` 就是 apimart 的 create）
  await expect.poll(() => walk.fixture.images.length,
    { message: '按下「仍要生成」之后，供应商必须真的收到一次生成请求', timeout: DEFAULT_TIMEOUT_MS }).toBeGreaterThan(0)
  expect(hostRefusals, `宿主不许再拒（实际：${hostRefusals.join(' ')}）`).toHaveLength(0)

  // ②-b 送出去的就是卡上那一镜、那个算不出价的模型——不是顺手发了别的东西
  const submitted = JSON.stringify(walk.fixture.images[0].body)
  expect(submitted, '发给供应商的就是卡上那一镜的提示词').toContain('六棱柱')
  expect(submitted, '发给供应商的就是那个算不出价的模型').toContain(FIXTURE_APIMART_MODEL)

  // ②-c 盘上那份 Run：为一个算不出价的镜头铸出的授权，金额位是 null（不是 0）
  await expect.poll(() => readRunEnvelope(projectRoot, operationId)?.envelope?.jobs?.length ?? 0,
    { message: 'Run 里必须真的有一张授权信封', timeout: DEFAULT_TIMEOUT_MS }).toBeGreaterThan(0)
  const run = readRunEnvelope(projectRoot, operationId)
  expect(run.envelope.jobs[0].price.maximum, '未知价那一镜的授权金额位是 null，绝不是 0').toBeNull()
  expect(run.envelope.budget.unknownJobCount, '账本如实记下这一镜价格未知').toBe(1)

  // ②-d **节点真的拿到产物**：盘上有一份 ready 的产物，屏上那个节点变成 success（不是还挂着「排队中」）
  await expect.poll(() => (readRunEnvelope(projectRoot, operationId)?.artifacts ?? []).filter((item) => item.status === 'ready').length,
    { message: '产物必须真的落盘 —— 这就是用户说的「出图」', timeout: 90_000 }).toBeGreaterThan(0)
  await expect(win.locator(`[data-node-id="${nodeId}"][data-status="success"]`),
    '草稿那一刻建的那个节点在屏上变成 success').toBeVisible({ timeout: 90_000 })
  await expectAbsent(card, { provenBy: cardProbe, message: '答完的卡要收起来（问题答完了就不该还在等人答）' })
  await walk.snap('unknown-price-after-confirm-zh')

  // ── ③ 英文：同一条路再走一遍（EN 串长 1.5-2 倍，截断只有眼睛看得出）──
  //
  // 为什么是**第二份草稿**而不是把上面那张卡切成英文：上面那张已经被按过、已经收起来了，
  // 要看的是「未知价待确认」那一档的英文长相，只能再摆一张新的。
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'en'))
  await win.reload()
  const enPlanner = walk.fixture.expectText({
    label: 'a second unpriced draft, this time with the UI in English',
    match: (body) => flattenRequestText(body).includes('S_UNPRICED_EN'),
    reply: { type: 'tool', id: EN_PLAN_CALL, name: 'draft_shots', args: {
      shots: [{ prompt: 'A floating hexagonal prism, soft studio lighting', taskKind: 'text_to_image', candidate: { providerId: FIXTURE_APIMART_VENDOR, modelId: FIXTURE_APIMART_MODEL }, parameters: {} }],
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
  // 同上：换壳后这一格在页脚左下，措辞是新的那一句（zh/en 一起改的）。
  await expect(enCard.locator(PRICE_UNAVAILABLE), 'EN：Price unknown · billed by provider')
    .toHaveText('Price unknown · billed by provider')
  const enPriceProbe = await proveProbe(enCard.locator(PRICE_UNAVAILABLE), 'EN：the card renders a data-v4-price slot at all')
  await expectAbsent(enCard.locator(PRICE_TOTAL), { provenBy: enPriceProbe, message: 'EN：算不出价时没有 Total 那一格' })
  // 按钮上多了一个 ⏎ 字形（换壳后主按钮的固定后缀），所以 `toHaveText` 换成
  // 「含这句文案」+「一个货币符号都没有」——后半句才是这条断言原本要守的东西。
  await expect(enCard.locator(INTERVENTION_CONFIRM), 'EN：Generate anyway').toContainText('Generate anyway')
  await expect(enCard.locator(INTERVENTION_CONFIRM), 'EN：主按钮上不印金额').not.toContainText('¥')
  await expect(enCard.locator(INTERVENTION_CONFIRM), 'EN：算不出价时主按钮照样可点').toBeEnabled()
  await expect(enCard, 'EN：said once, in the footer').not.toContainText('only learn the cost afterwards')
  const enCardText = (await enCard.innerText()).replace(/\s+/g, ' ')
  expect(enCardText, `EN 卡上同样不许出现 ¥0（实际文本：${enCardText}）`).not.toMatch(/[¥￥$]\s?0(?!\d)/)
  expect(enCardText, 'EN 也不许是 0.00 那种写法').not.toContain('0.00')
  await walk.snap('unknown-price-card-en')

  walk.report.verified = ['card-says-unavailable-not-zero', 'confirm-label-is-generate-anyway',
    'no-zero-anywhere-on-the-card-zh-and-en',
    'confirm-really-reaches-the-vendor-and-the-node-gets-its-artifact',
    'unknown-price-authorization-carries-null-not-zero']
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
