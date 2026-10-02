#!/usr/bin/env node
// 真实用户任务（R13）：付费卡逐镜——「点了的生成，去掉的不生成」（用户 2026-09-29 拍板），测试表第 1–6、9–13 行。
//
// 我让 Agent 画几张图，卡一页一张：「生成这张」只生成这一页这一镜，「去掉这张」这一镜不生成，× 剩下的都不生成，
// 卡开着时打字也一样；Agent 收到的回执只说真的发生了的事。每一行中英各走一遍、各拍整窗与卡的近景。
//
//   node tests/ux/agent-spend-per-shot.walk.mjs
//   NOMI_PER_SHOT_PROFILE_FROM=<上一版某次走查的 report.json> node tests/ux/agent-spend-per-shot.walk.mjs   # 第 14 行：老资料上走一遍
//
// 只有远端供应商是 loopback 夹具（零额度）；SDK、IPC、ProductionRun、渲染层、落盘全是真的。
import fs from 'node:fs'

import { clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { FIXTURE_APIMART_MODEL, FIXTURE_APIMART_VENDOR, flattenRequestText } from './agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, COMPOSER_INPUT, COMPOSER_SEND, INTERVENTION_ALTERNATE, INTERVENTION_CONFIRM,
  closeSpendCard, createRuntimeWalk, openCanvas, recorded, sendCanvas,
} from './agent-runtime-walk-support.mjs'

process.env.NOMI_WALK_UNPRICED_MODEL = '1'

const TITLE = '[data-v4-block="slot-title"]'
const PAGER = '[data-v4-block="pager"]'
const IMAGE = { providerId: FIXTURE_APIMART_VENDOR, modelId: FIXTURE_APIMART_MODEL }
const VIDEO = { providerId: 'apimart', modelId: 'doubao-seedance-2.0' }
/** 今天没有价格：卡上不许出现这几句（第 1 行）。 */
const RETIRED = /仍要生成|价格未知|Generate anyway|price unknown/i

const COPY = {
  zh: {
    images: (count) => `生成这 ${count} 张图片`, video: (count) => `生成这 ${count} 段视频`,
    confirmImage: '生成这张', removeImage: '去掉这张', confirmVideo: '生成这段',
    removed: '已去掉，不生成', waiting: '等你确认',
    ask: (tag, count, kind) => `${tag}：${kind === 'video' ? `做 ${count} 段渔港清晨的视频` : `画 ${count} 张渔港清晨`}，起草好给我确认。`,
    interrupt: (tag) => `${tag}_TYPED 先停一下，我想改改第二张。`,
  },
  en: {
    images: (count) => (count === 1 ? 'Generate this image' : `Generate these ${count} images`),
    video: (count) => (count === 1 ? 'Generate this video shot' : `Generate these ${count} video shots`),
    confirmImage: 'Generate this one', removeImage: 'Remove', confirmVideo: 'Generate this one',
    removed: 'Removed', waiting: 'Waiting for you',
    ask: (tag, count, kind) => `${tag}: ${kind === 'video' ? `make ${count} harbour video shots` : `draw ${count} harbour mornings`} and let me confirm.`,
    interrupt: (tag) => `${tag}_TYPED hold on, I want to change the second one.`,
  },
}

const rows = {}
let round = 0

/** 记一行测试表：断言失败不抛，写成 ok:false 接着走（验收页要的是全部证据）。 */
async function row(id, title, check) {
  try {
    rows[id] = { title, ok: true, detail: (await check()) ?? '', shots: rows[id]?.shots ?? [] }
  } catch (error) {
    rows[id] = { title, ok: false, detail: String(error?.message ?? error).replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter(Boolean).slice(0, 4).join(' ').slice(0, 400), shots: rows[id]?.shots ?? [] }
    process.exitCode = 1
  }
  console.log(`[per-shot] ${rows[id].ok ? 'PASS' : 'FAIL'} ${id} ${title} ${rows[id].detail}`)
}

/** 整窗一张 + 卡的近景一张。拍之前把鼠标挪到标题上：刚点过的按钮还停在悬停态。 */
async function snap(walk, id, label, card) {
  try {
    if (card && await card.isVisible().catch(() => false)) await card.locator(TITLE).hover({ position: { x: 2, y: 2 } })
    const file = await walk.snap(`${id}-${label}`)
    const shots = [file]
    if (card && await card.isVisible().catch(() => false)) {
      const close = file.replace(/\.png$/, '-card.png')
      await card.screenshot({ path: close })
      shots.push(close)
    }
    ;(rows[id] ??= { title: '', ok: false, detail: '', shots: [] }).shots.push(...shots)
  } catch (error) {
    console.log(`[per-shot] snap failed ${id}-${label}: ${String(error?.message ?? error).split('\n')[0]}`)
  }
}

/**
 * Agent 起草 `count` 镜、再 `generate` 把它们摆上卡（`generate` 一直等到卡关掉才返回）。
 * 返回卡、这次的标签、以及「generate 的结果回到了模型」那一刻收到的结果原文（Agent 收到的回执）。
 */
async function present(walk, win, count, locale, kind = 'image') {
  round += 1
  const tag = `PS_${round}`
  const planCall = `ps-plan-${round}`
  const generateCall = `ps-generate-${round}`
  const planner = walk.fixture.expectText({
    label: `the agent drafts ${count} ${kind} shots (${tag})`,
    match: (body) => flattenRequestText(body).includes(`${tag}：`) || flattenRequestText(body).includes(`${tag}:`),
    reply: { type: 'tool', id: planCall, name: 'draft_shots', args: {
      shots: [...Array(count).keys()].map((index) => ({
        title: `${tag}-${index + 1}`, prompt: `${tag} 第 ${index + 1} 镜：渔港清晨`,
        ...(kind === 'video' ? { taskKind: 'text_to_video', candidate: VIDEO, durationSec: 4, parameters: { resolution: '480p', generate_audio: false } } : { taskKind: 'text_to_image', candidate: IMAGE }),
      })),
    } },
  })
  let operationId
  const drafted = walk.fixture.expectText({
    label: `draft result (${tag})`,
    match: (body) => {
      const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === planCall)
      if (!result) return false
      operationId = /"operationId":"([^"]+)"/.exec(String(result.content))?.[1]
      return true
    },
    reply: { type: 'hold' },
  })
  const box = { receipt: null, request: '' }
  const readReceipt = (body) => {
    const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === generateCall)
    if (result) Object.assign(box, { receipt: String(result.content), request: flattenRequestText(body) })
    return Boolean(result)
  }
  const turnDone = walk.fixture.expectText({
    label: `generate returns once the card is answered (${tag})`,
    match: (body) => readReceipt(body),
    reply: { type: 'text', text: `${tag}_DONE` },
  })
  await sendCanvas(win, COPY[locale].ask(tag, count, kind))
  await recorded(planner.received, `${tag} draft request`)
  await recorded(drafted.received, `${tag} draft result`, stationTimeout({ operations: Math.max(4, count) }))
  drafted.release({ type: 'tool', id: generateCall, name: 'generate', args: { operationId } })
  const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  await expect(card.locator(TITLE), `${tag}：卡问的是这 ${count} 镜`).toContainText(kind === 'video' ? COPY[locale].video(count) : COPY[locale].images(count), { timeout: stationTimeout({ operations: 4 }) })
  return { card, tag, operationId, turnDone, receipt: () => box.receipt, request: () => box.request }
}

/** 供应商这一轮收到的是哪几镜（夹具记下的请求体里带着提示词，「第 N 镜」认得出是哪一镜）。 */
const sentShots = (records, from) => records.slice(from).map((record) => /第 (\d+) 镜/.exec(JSON.stringify(record.body ?? record))?.[1] ?? '?')

async function canvasPlaceholder(win, tag, index) {
  const node = win.locator('[data-node-id]').filter({ hasText: `${tag}-${index}` }).first()
  return (await node.locator('[data-shot-placeholder-state]').first().getAttribute('data-shot-placeholder-state').catch(() => null))
}

async function runLocale(walk, win, locale) {
  const L = COPY[locale]
  const R = (n) => `${n}-${locale}`

  // ── 第 1–3 行：2 张图，逐页生成 ──
  {
    const before = walk.fixture.images.length
    const { card, tag, turnDone, receipt } = await present(walk, win, 2, locale)
    await row(R(1), '2 张图的卡：问话标题、1/2、「生成这张」+「去掉这张」，没有「仍要生成」和价格未知', async () => {
      await expect(card.locator(PAGER)).toContainText('1/2')
      await expect(card.locator(INTERVENTION_CONFIRM)).toContainText(L.confirmImage)
      await expect(card.locator(INTERVENTION_ALTERNATE)).toContainText(L.removeImage)
      const text = await card.innerText()
      if (RETIRED.test(text)) throw new Error(`卡上还有退役的话：${text.replace(/\s+/g, ' ').slice(0, 160)}`)
      return text.replace(/\s+/g, ' ').slice(0, 120)
    })
    await snap(walk, R(1), 'card', card)
    await clickOrFail(card.locator(INTERVENTION_CONFIRM), `${locale}：第 1 页「生成这张」`, { noWaitAfter: true })
    await row(R(2), '第 1 页「生成这张」：供应商只收到第 1 张；卡还在、只剩第 2 张；第 2 张的占位没动', async () => {
      await expect(card.locator(TITLE)).toContainText(L.images(1), { timeout: stationTimeout({ operations: 4 }) })
      await expect.poll(() => walk.fixture.images.length - before, { timeout: stationTimeout({ operations: 4 }) }).toBe(1)
      const sent = sentShots(walk.fixture.images, before)
      if (sent.join() !== '1') throw new Error(`供应商收到：${sent.join()}`)
      return `供应商收到第 ${sent.join()} 张；第 2 张占位：${await canvasPlaceholder(win, tag, 2)}`
    })
    await snap(walk, R(2), 'one-left', card)
    const cardProbe = await proveProbe(card, `${locale}：卡还在`)
    await clickOrFail(card.locator(INTERVENTION_CONFIRM), `${locale}：第 2 张「生成这张」`, { noWaitAfter: true })
    await row(R(3), '接着点第 2 张：供应商收到第 2 张；卡关掉；Agent 收到的回执说两张都在生成', async () => {
      await expectAbsent(card, { provenBy: cardProbe, message: '卡关掉' }, stationTimeout({ operations: 4 }))
      await recorded(turnDone.received, `${tag}: generate returns`)
      const sent = sentShots(walk.fixture.images, before)
      if (sent.join() !== '1,2') throw new Error(`供应商收到：${sent.join()}`)
      if (!/All 2 shot\(s\)/.test(receipt() ?? '')) throw new Error(`回执：${(receipt() ?? '').slice(0, 200)}`)
      return `回执：${(receipt() ?? '').slice(0, 160)}`
    })
    await snap(walk, R(3), 'after-both')
  }

  // ── 第 4 行：去掉第 1 张、生成第 2 张 ──
  {
    const before = walk.fixture.images.length
    const { card, tag, turnDone, receipt } = await present(walk, win, 2, locale)
    await clickOrFail(card.locator(INTERVENTION_ALTERNATE), `${locale}：第 1 页「去掉这张」`, { noWaitAfter: true })
    await expect(card.locator(TITLE)).toContainText(L.images(1), { timeout: stationTimeout({ operations: 4 }) })
    await snap(walk, R(4), 'after-remove', card)
    await clickOrFail(card.locator(INTERVENTION_CONFIRM), `${locale}：第 2 张「生成这张」`, { noWaitAfter: true })
    await row(R(4), '去掉第 1 张、生成第 2 张：只发了第 2 张；第 1 张占位写「已去掉，不生成」；回执说第 1 张是用户去掉的', async () => {
      await recorded(turnDone.received, `${tag}: generate returns`)
      const sent = sentShots(walk.fixture.images, before)
      if (sent.join() !== '2') throw new Error(`供应商收到：${sent.join()}`)
      if (!/removed/.test(receipt() ?? '')) throw new Error(`回执：${(receipt() ?? '').slice(0, 200)}`)
      return `第 1 张占位：${await canvasPlaceholder(win, tag, 1)} · 回执：${(receipt() ?? '').slice(0, 140)}`
    })
    await snap(walk, R(4), 'canvas')
  }

  // ── 第 5 行：生成第 1 张后点 × ──
  {
    const before = walk.fixture.images.length
    const { card, tag, turnDone, receipt } = await present(walk, win, 2, locale)
    await clickOrFail(card.locator(INTERVENTION_CONFIRM), `${locale}：第 1 页「生成这张」`, { noWaitAfter: true })
    await expect(card.locator(TITLE)).toContainText(L.images(1), { timeout: stationTimeout({ operations: 4 }) })
    await closeSpendCard(card, `${locale}：× 关掉卡`)
    await row(R(5), '生成第 1 张后点 ×：第 2 张没发；回执说第 2 张没确认、没生成；占位都在', async () => {
      await recorded(turnDone.received, `${tag}: generate returns`)
      const sent = sentShots(walk.fixture.images, before)
      if (sent.join() !== '1') throw new Error(`供应商收到：${sent.join()}`)
      if (!/closed the card/.test(receipt() ?? '')) throw new Error(`回执：${(receipt() ?? '').slice(0, 200)}`)
      return `第 2 张占位：${await canvasPlaceholder(win, tag, 2)} · 回执：${(receipt() ?? '').slice(0, 140)}`
    })
    await snap(walk, R(5), 'canvas')
  }

  // ── 第 6 行：生成第 1 张后直接打字 ──
  {
    const before = walk.fixture.images.length
    const { card, tag, receipt, request, turnDone } = await present(walk, win, 2, locale)
    await clickOrFail(card.locator(INTERVENTION_CONFIRM), `${locale}：第 1 页「生成这张」`, { noWaitAfter: true })
    await expect(card.locator(TITLE)).toContainText(L.images(1), { timeout: stationTimeout({ operations: 4 }) })
    await win.locator(`${CANVAS_PANEL} ${COMPOSER_INPUT}`).fill(L.interrupt(tag))
    await clickOrFail(win.locator(`${CANVAS_PANEL} ${COMPOSER_SEND}`), `${locale}：卡开着时打字发出去`)
    await row(R(6), '生成第 1 张后直接打字：第 2 张没发；Agent 按打的字办，回执里知道第 2 张没生成', async () => {
      // 打的字跟着 generate 的结果一起回到模型（同一个请求）：Agent 先看到第 2 张怎么了，再按打的字办。
      await recorded(turnDone.received, `${tag}: generate returns with the typed message`)
      if (!request().includes(`${tag}_TYPED`)) throw new Error('打的字没跟着回到模型')
      const sent = sentShots(walk.fixture.images, before)
      if (sent.join() !== '1') throw new Error(`供应商收到：${sent.join()}`)
      if (!/wrote a message/.test(receipt() ?? '')) throw new Error(`回执：${(receipt() ?? '').slice(0, 200)}`)
      return `回执：${(receipt() ?? '').slice(0, 160)}`
    })
    await snap(walk, R(6), 'after-typing')
  }

  // ── 第 9 行：5 张，生成 1、去掉 2、生成 3，然后 × ──
  {
    const before = walk.fixture.images.length
    const { card, tag, turnDone, receipt } = await present(walk, win, 5, locale)
    await clickOrFail(card.locator(INTERVENTION_CONFIRM), `${locale}：第 1 张「生成这张」`, { noWaitAfter: true })
    await expect(card.locator(TITLE)).toContainText(L.images(4), { timeout: stationTimeout({ operations: 4 }) })
    await clickOrFail(card.locator(INTERVENTION_ALTERNATE), `${locale}：第 2 张「去掉这张」`, { noWaitAfter: true })
    await expect(card.locator(TITLE)).toContainText(L.images(3), { timeout: stationTimeout({ operations: 4 }) })
    await clickOrFail(card.locator(INTERVENTION_CONFIRM), `${locale}：第 3 张「生成这张」`, { noWaitAfter: true })
    await expect(card.locator(TITLE)).toContainText(L.images(2), { timeout: stationTimeout({ operations: 4 }) })
    await snap(walk, R(9), 'two-left', card)
    await closeSpendCard(card, `${locale}：× 关掉卡`)
    await row(R(9), '5 张：生成 1、3，去掉 2，然后 ×：只发了 1、3；回执逐张说对', async () => {
      await recorded(turnDone.received, `${tag}: generate returns`)
      const sent = sentShots(walk.fixture.images, before).sort()
      if (sent.join() !== '1,3') throw new Error(`供应商收到：${sent.join()}`)
      const text = receipt() ?? ''
      if (!/removed/.test(text) || !/closed the card/.test(text)) throw new Error(`回执：${text.slice(0, 240)}`)
      return `回执：${text.slice(0, 200)}`
    })
    await snap(walk, R(9), 'canvas')
  }

  // ── 第 10 行：只有 1 张 ──
  {
    const before = walk.fixture.images.length
    const { card, turnDone, tag } = await present(walk, win, 1, locale)
    await row(R(10), '只有 1 张：没有翻页、没有「生成剩下」；一点就发，卡消失', async () => {
      await expect(card.locator(PAGER)).toHaveCount(0)
      await expect(card.locator('[data-v4-control="batch"]')).toHaveCount(0)
      return 'ok'
    })
    await snap(walk, R(10), 'card', card)
    const probe = await proveProbe(card, `${locale}：一张的卡`)
    await clickOrFail(card.locator(INTERVENTION_CONFIRM), `${locale}：「生成这张」`, { noWaitAfter: true })
    await expectAbsent(card, { provenBy: probe, message: '卡消失' }, stationTimeout({ operations: 4 }))
    await recorded(turnDone.received, `${tag}: generate returns`)
    if (walk.fixture.images.length - before !== 1) rows[R(10)] = { ...rows[R(10)], ok: false, detail: `供应商收到 ${walk.fixture.images.length - before} 张` }
  }

  // ── 第 11 行：「生成这张」连点两下 ──
  {
    const before = walk.fixture.images.length
    const { card, tag } = await present(walk, win, 2, locale)
    await card.locator(INTERVENTION_CONFIRM).dblclick()
    await row(R(11), '「生成这张」连点两下：这一张只发一次，第 2 张不会被顺手批掉', async () => {
      await expect(card.locator(TITLE)).toContainText(L.images(1), { timeout: stationTimeout({ operations: 4 }) })
      await expect.poll(() => walk.fixture.images.length - before, { timeout: stationTimeout({ operations: 2 }) }).toBe(1)
      const sent = sentShots(walk.fixture.images, before)
      if (sent.join() !== '1') throw new Error(`供应商收到：${sent.join()}`)
      return `供应商收到第 ${sent.join()} 张；卡上还剩 1 张`
    })
    await snap(walk, R(11), 'after-double-click', card)
    await closeSpendCard(card, `${locale}：看完关掉（${tag}）`)
  }

  // ── 第 12 行：视频的卡 ──
  {
    const before = walk.fixture.videos.length
    const { card, turnDone, tag } = await present(walk, win, 1, locale, 'video')
    await row(R(12), '视频的卡：按钮「生成这段」；点了就发这一段', async () => {
      await expect(card.locator(INTERVENTION_CONFIRM)).toContainText(L.confirmVideo)
      return (await card.innerText()).replace(/\s+/g, ' ').slice(0, 120)
    })
    await snap(walk, R(12), 'card', card)
    await clickOrFail(card.locator(INTERVENTION_CONFIRM), `${locale}：「生成这段」`, { noWaitAfter: true })
    await recorded(turnDone.received, `${tag}: generate returns`)
    await expect.poll(() => walk.fixture.videos.length - before, { timeout: stationTimeout({ operations: 4 }) }).toBe(1)
  }
}

const upgradeFrom = process.env.NOMI_PER_SHOT_PROFILE_FROM
const previous = upgradeFrom ? JSON.parse(fs.readFileSync(upgradeFrom, 'utf8')) : null
const walk = await createRuntimeWalk(previous ? 'spend-per-shot-old-profile' : 'spend-per-shot', {
  generationProvider: 'apimart',
  ...(previous ? { profileDir: previous.tempRoot } : {}),
})
walk.report.rows = rows
walk.report.profile = previous ? `old profile from ${upgradeFrom}` : 'fresh install'
let failure
try {
  const { win } = await walk.start({ first: !previous })
  if (previous) {
    // 老资料上一次可能停在英文界面：先切回中文再建项目（项目库的入口按钮按中文认）。
    await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'zh-CN'))
    await win.reload()
  }
  await walk.newProject()
  await openCanvas(win)
  const noShare = win.getByRole('button', { name: '不分享', exact: true }).first()
  if (await noShare.isVisible().catch(() => false)) await noShare.click()
  // 只跑一种语言：NOMI_PER_SHOT_LOCALES=en（重拍某一种时用）；缺省中英都走。
  const locales = (process.env.NOMI_PER_SHOT_LOCALES || 'zh,en').split(',').map((value) => value.trim()).filter(Boolean)
  for (const locale of locales) {
    // 换语言只重载渲染层：画布还停在生成工作区（工作区的入口按钮叫什么随语言变，不再去点它）。
    await win.evaluate((value) => localStorage.setItem('nomi:locale:v1', value), locale === 'zh' ? 'zh-CN' : 'en')
    await win.reload()
    await runLocale(walk, win, locale)
  }
  console.log(`[per-shot] rows ${Object.entries(rows).map(([id, entry]) => `${id} ${entry.ok ? 'PASS' : 'FAIL'}`).join(' · ')}`)
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
