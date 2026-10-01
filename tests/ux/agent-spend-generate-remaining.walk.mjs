#!/usr/bin/env node
// 真实用户任务（R13）：付费卡上的「生成剩下 N 张」（2026-10-01 用户拍板）。
//
// 我让 Agent 画几张图，卡摆出来：动作行最左是「生成剩下 N 张」，右边是「去掉这张」和主按钮「生成这张」。
// 点一下「生成剩下」= 卡上还没决定的每一张各点一次「生成这张」：每张各记一笔授权，点完卡关掉，
// 画布上每个节点和逐张点完一模一样。只剩 1 张时它不出现；去掉的不算在 N 里。
//
// 这条走查同时是样张的机器对账（`docs/design/mockups/contracts/2026-10-01-paid-card-generate-remaining.intent.mjs`）：
//   · 翻页那一行只有翻页器和 `←→`（这一档报不出价，没有合计）；
//   · 「生成剩下 N 张」在动作行最左，右边那两颗是一组；
//   · 中文一行放得下；英文放不下时左边那颗整颗换到上一行、右边两颗保持一组靠右（不截断、不挤压）。
// 每一态中英各拍一张整窗图和一张卡的近景，交给验收页。
//
// 这台机器的目录里**没有价**（今天的常态：中转不给价）——报得出价的那一档在 `agent-spend-priced-card.walk.mjs`。
// 只有远端供应商是 loopback 夹具（零额度）；SDK、IPC、ProductionRun、渲染层、落盘全是真的。
import { clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { assertMockupContract } from './_contract.mjs'
import generateRemainingContract from '../../docs/design/mockups/contracts/2026-10-01-paid-card-generate-remaining.intent.mjs'
import { FIXTURE_APIMART_MODEL, FIXTURE_APIMART_VENDOR, flattenRequestText } from './agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, INTERVENTION_ALTERNATE, INTERVENTION_CONFIRM,
  closeSpendCard, createRuntimeWalk, openCanvas, readProject, recorded, sendCanvas,
} from './agent-runtime-walk-support.mjs'

process.env.NOMI_WALK_UNPRICED_MODEL = '1'

const BATCH = '[data-v4-control="batch"]'
const TITLE = '[data-v4-block="slot-title"]'
const candidate = { providerId: FIXTURE_APIMART_VENDOR, modelId: FIXTURE_APIMART_MODEL }

const COPY = {
  zh: {
    title: (count) => `生成这 ${count} 张图片`,
    batch: (count) => `生成剩下 ${count} 张`,
    ask: (tag, count) => `${tag}：画 ${count} 张渔港清晨，画完给我确认。`,
  },
  en: {
    title: (count) => (count === 1 ? 'Generate this image' : `Generate these ${count} images`),
    batch: (count) => `Generate remaining ${count}`,
    ask: (tag, count) => `${tag}: draw ${count} harbour mornings and let me confirm.`,
  },
}

let round = 0

/** Agent 起草 `count` 张图、再 `generate` 把它们摆上卡（`generate` 等用户答完卡才返回）。 */
async function present(walk, win, count, locale) {
  round += 1
  const tag = `S_REMAIN_${round}`
  const planCall = `s-remain-${round}`
  const generateCall = `${planCall}-generate`
  const planner = walk.fixture.expectText({
    label: `the agent drafts ${count} image shots (${tag})`,
    match: (body) => flattenRequestText(body).includes(tag),
    reply: { type: 'tool', id: planCall, name: 'draft_shots', args: {
      shots: Array.from({ length: count }, (_, index) => ({
        title: `${tag}-${index + 1}`, prompt: `${tag} 第 ${index + 1} 张：渔港清晨`, taskKind: 'text_to_image', candidate,
      })),
    } },
  })
  let operationId
  const drafted = walk.fixture.expectText({
    label: `the draft result carries the host-generated operationId (${tag})`,
    match: (body) => {
      const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === planCall)
      if (!result) return false
      operationId = /"operationId":"([^"]+)"/.exec(String(result.content))?.[1]
      return true
    },
    reply: { type: 'hold' },
  })
  const turnDone = walk.fixture.expectText({
    label: `generate returns once the card is answered (${tag})`,
    match: (body) => (body.messages ?? []).some((message) => message.role === 'tool' && message.tool_call_id === generateCall),
    reply: { type: 'text', text: `${tag}_DONE` },
  })
  await sendCanvas(win, COPY[locale].ask(tag, count))
  await recorded(planner.received, `${tag} draft request`)
  // 草稿要落 count 个节点：33 张在这台机器上超过默认的 60 秒安全网，按工作量给。
  await recorded(drafted.received, `${tag} draft result`, stationTimeout({ operations: Math.max(4, count) }))
  drafted.release({ type: 'tool', id: generateCall, name: 'generate', args: { operationId } })
  const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  await expect(card.locator(TITLE), `${tag}：卡上问的是这 ${count} 张`).toContainText(COPY[locale].title(count),
    { timeout: stationTimeout({ operations: Math.max(4, Math.ceil(count / 4)) }) })
  return { card, operationId, turnDone, tag }
}

/** 动作行三颗按钮此刻在屏上的位置（中文要一行放下；英文放不下时左边那颗换到上一行）。 */
async function actionBoxes(card) {
  const box = async (selector) => {
    const found = await card.locator(selector).first().boundingBox()
    if (!found) throw new Error(`没量到 ${selector} 的位置`)
    return found
  }
  const cardBox = await card.boundingBox()
  if (!cardBox) throw new Error('没量到卡的位置')
  return { batch: await box(BATCH), alternate: await box(INTERVENTION_ALTERNATE), confirm: await box(INTERVENTION_CONFIRM), card: cardBox }
}

/**
 * 排布：整叠的在左、这一张的在右，最贵的那颗离主按钮最远；主按钮贴右缘、不被挤到下一行。
 * `wrapped`：英文一行放不下 → 左边那颗在上一行；中文必须一行放下。
 */
async function expectLayout(card, locale, { wrapped }) {
  const { batch, alternate, confirm, card: cardBox } = await actionBoxes(card)
  expect(alternate.x, `${locale}：「去掉这张」在主按钮左边`).toBeLessThan(confirm.x)
  expect(Math.abs(alternate.y - confirm.y), `${locale}：「去掉这张」和主按钮在同一行（一组）`).toBeLessThan(4)
  expect(cardBox.x + cardBox.width - (confirm.x + confirm.width), `${locale}：主按钮贴着卡的右缘`).toBeLessThan(24)
  expect(batch.x, `${locale}：「生成剩下」在最左`).toBeLessThan(alternate.x)
  if (wrapped) {
    expect(batch.y + batch.height, `${locale}：放不下一行时「生成剩下」整颗在上一行`).toBeLessThanOrEqual(confirm.y + 1)
  } else {
    expect(Math.abs(batch.y - confirm.y), `${locale}：一行放得下，三颗在同一行`).toBeLessThan(4)
  }
}

/** 整窗一张 + 卡的近景一张（整窗图里卡太小，字看不清）。 */
async function snapCard(walk, card, label) {
  const file = await walk.snap(label)
  await card.screenshot({ path: file.replace(/\.png$/, '-card.png') })
}

/** 这一份草稿落在画布上的那几个图片节点。 */
async function draftNodes(win, projectId, operationId) {
  return (await readProject(win, projectId)).payload.generationCanvas.nodes
    .filter((node) => node.meta?.productionRunId === operationId && node.kind === 'image')
}

async function batchRound(walk, win, projectId, locale, { wrapped, checkAwaiting = false }) {
  const imagesBefore = walk.fixture.images.length
  const { card, operationId, turnDone } = await present(walk, win, 2, locale)
  const cardProbe = await proveProbe(card, `${locale}：两张图的付费卡摆出来了`)
  await expect(card.locator(BATCH), `${locale}：从第 1 页起就在，写明张数`).toHaveText(COPY[locale].batch(2))
  await assertMockupContract(win, generateRemainingContract)
  await expectLayout(card, locale, { wrapped })
  expect(walk.fixture.images.length, `${locale}：按之前一张都没发`).toBe(imagesBefore)
  // 第 12 条（测试表第 22 行）：卡还没点时，画布上这两张写的是「等你确认」，不是「排队中」。
  // 只在新项目的第一轮量：那时画布上只有这两张、都在屏内（屏外的节点不渲染，后面几轮会被挤出视口）。
  if (checkAwaiting) {
    const waiting = await draftNodes(win, projectId, operationId)
    expect(waiting, `${locale}：草稿落成两个图片节点`).toHaveLength(2)
    for (const node of waiting) {
      await expect(win.locator(`[data-node-id="${node.id}"] [data-shot-placeholder-state]`).first(), `${locale}：卡还没点，节点 ${node.id} 写的是等你确认`)
        .toHaveAttribute('data-shot-placeholder-state', 'awaiting_confirmation', { timeout: stationTimeout({ operations: 2 }) })
    }
  }
  await snapCard(walk, card, `${locale}-two-shots`)

  await clickOrFail(card.locator(BATCH), `${locale}：「生成剩下 2 张」`, { noWaitAfter: true })
  await expect.poll(() => walk.fixture.images.length - imagesBefore,
    { message: `${locale}：两张都真的发到供应商，各一次`, timeout: stationTimeout({ operations: 6 }) }).toBe(2)
  await recorded(turnDone.received, `${locale}: generate returns once every shot on the card is decided`)
  await expectAbsent(card, { provenBy: cardProbe, message: `${locale}：每一张都定了，卡关掉` })
  // 和逐张点完一模一样：两个节点都出片（同一份逐镜结局驱动，不是另一条路）。读项目文档里的节点状态——
  // 屏外的节点不渲染，量 DOM 会把「视口在哪」误当成「出没出片」。
  await expect.poll(async () => (await draftNodes(win, projectId, operationId)).map((node) => node.status).sort().join(','),
    { message: `${locale}：两个节点都出片`, timeout: stationTimeout({ operations: 6 }) }).toBe('success,success')
  // 点完之后的整窗只在第一轮拍：后面几轮画布上已经有几十个节点，出片时整屏一直在重排，拍不出安定的图
  // （截图门会拒绝）；功能上的断言（各发一次、卡关掉、两个节点都出片）每一轮照样做。
  if (checkAwaiting) await walk.snap(`${locale}-two-shots-after-generate-remaining`)
}

async function oneLeftRound(walk, win, locale) {
  const { card, turnDone } = await present(walk, win, 2, locale)
  const batchProbe = await proveProbe(card.locator(BATCH), `${locale}：两张时「生成剩下」在`)
  await clickOrFail(card.locator(INTERVENTION_CONFIRM), `${locale}：第 1 页「生成这张」`, { noWaitAfter: true })
  await expect(card.locator(TITLE), `${locale}：卡还在，只剩 1 张`).toContainText(COPY[locale].title(1), { timeout: stationTimeout({ operations: 4 }) })
  await expectAbsent(card.locator(BATCH), { provenBy: batchProbe, message: `${locale}：只剩 1 张时不画「生成剩下」（它和「生成这张」是同一件事）` })
  await snapCard(walk, card, `${locale}-one-left`)
  await closeSpendCard(card, `${locale}：看完关掉`)
  await recorded(turnDone.received, `${locale}: generate returns once the one-left card is closed`)
}

async function manyShotsRound(walk, win, locale, { wrapped }) {
  const { card, turnDone } = await present(walk, win, 33, locale)
  await expect(card.locator(BATCH), `${locale}：33 张`).toHaveText(COPY[locale].batch(33))
  await expectLayout(card, locale, { wrapped })
  await snapCard(walk, card, `${locale}-33-shots`)
  // 去掉的不算：去掉两张之后标题、页码、按钮一起变成 31。
  for (const left of [32, 31]) {
    await clickOrFail(card.locator(INTERVENTION_ALTERNATE), `${locale}：「去掉这张」（剩 ${left}）`, { noWaitAfter: true })
    await expect(card.locator(TITLE), `${locale}：标题只数还没决定的`).toContainText(COPY[locale].title(left), { timeout: stationTimeout({ operations: 4 }) })
  }
  await expect(card.locator(BATCH), `${locale}：去掉的不算在 N 里`).toHaveText(COPY[locale].batch(31))
  await expect(card.locator('[data-v4-block="pager"]'), `${locale}：页码也是 31`).toContainText('/31')
  await snapCard(walk, card, `${locale}-33-shots-after-removing-2`)
  await closeSpendCard(card, `${locale}：看完关掉`)
  await recorded(turnDone.received, `${locale}: generate returns once the 33-shot card is closed`)
}

const walk = await createRuntimeWalk('spend-generate-remaining', { generationProvider: 'apimart' })
let failure
try {
  const { win } = await walk.start({ first: true })
  const { projectId } = await walk.newProject()
  await openCanvas(win)

  await batchRound(walk, win, projectId, 'zh', { wrapped: false, checkAwaiting: true })
  await oneLeftRound(walk, win, 'zh')
  await manyShotsRound(walk, win, 'zh', { wrapped: false })

  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'en'))
  await win.reload()
  await batchRound(walk, win, projectId, 'en', { wrapped: true })
  await oneLeftRound(walk, win, 'en')
  await manyShotsRound(walk, win, 'en', { wrapped: true })

  expect(walk.fixture.images.length, '整个过程只发了两次「生成剩下 2 张」里的四张，加上两次「生成这张」').toBe(6)
  walk.report.verified = [
    'generate-remaining-sends-each-undecided-shot-once',
    'card-closes-and-nodes-land-like-per-shot',
    'hidden-when-one-left',
    'removed-shots-are-not-counted',
    'layout-batch-left-pair-right-zh-one-line-en-wraps',
  ]
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
