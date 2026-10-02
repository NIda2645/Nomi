#!/usr/bin/env node
// 真实用户任务（R13）：付费卡「生成剩下 N 张」跑到一半停下（2026-10-02 真 App 实测抓到的：「生成剩下 6 张」要走半分钟，
// 这半分钟里卡上那颗 × 点不进去，6 张全发；就算送到宿主，也被「报价对不上」挡回去）。
//
//   ① 正在发出：点「生成剩下 12 张」，卡上标题写「正在发出 k/12 张」、动作行只写怎么停，不摆「去掉这张 / 生成这张 /
//      生成剩下」——卡不能装成还在等人点。拍这一画面给验收页，让它跑完（十二张各发一次）。
//   ② 中途 ×：点「生成剩下 6 张」，宿主批下第 1 张时把鼠标落在 × 上点下去（人的点击走的就是这条路：先进主进程、再送进窗口）。
//      卡关掉时照实说「发出了 K 张，剩下 N−K 张没发」；宿主只批下了这 K 张，供应商只收到这 K 张；回执记「你关掉了卡」。
//
// 中英各开一个新项目：宿主批一张的时间随项目里的 Run 变多而变长（主进程那两段原有的慢路径，另开一条线修），
// 两种语言挤在一个项目里，英文那一半会被拖到超时。
// 只有远端供应商是 loopback 夹具（零额度）；SDK、IPC、ProductionRun、渲染层、落盘全是真的。
import path from 'node:path'

import { clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { BATCH, COPY, TITLE, createPresenter } from './_spendRemainingWalk.mjs'
import { CANVAS_PANEL, createRuntimeWalk, expandResidentPanel, openCanvas, recorded } from './agent-runtime-walk-support.mjs'

process.env.NOMI_WALK_UNPRICED_MODEL = '1'

const present = createPresenter('S_STOP')

/** 这一次生成在宿主那里批下了几镜（批下的才会派；派完之后供应商收到的就该正好是这么多）。 */
async function authorizedShots(win, projectId, operationId) {
  return win.evaluate(async ({ pid, oid }) => {
    const read = await window.nomiDesktop.productionRuns.read(pid, oid)
    const run = read?.run ?? read
    return new Set((run?.jobs ?? []).map((job) => job.metadata?.shotId).filter(Boolean)).size
  }, { pid: projectId, oid: operationId })
}

/**
 * 不等画面停稳、直接拍一张：这一叠在跑时画面一直在动（节点在落地），而且主进程占着界面线程，截图要等空档。
 * 拍不到不算失败（断言另有，图只是给人看的）；拍到没有记进报告。
 */
async function quickShot(walk, win, label) {
  const file = path.join(walk.report.outputDir, `${label}.png`)
  const ok = await win.screenshot({ path: file, timeout: stationTimeout({ operations: 4 }) }).then(() => true, () => false)
  walk.report.shots = { ...(walk.report.shots ?? {}), [label]: ok ? file : null }
  return file
}

/** ① 正在发出 k/12：拍那一画面，然后让它跑完。 */
async function sendingRound(walk, win, locale) {
  const imagesBefore = walk.fixture.images.length
  // 12 张：这一叠要走半分钟以上，截图等空档的那几秒落在它跑完之前。
  const { card, turnDone } = await present(walk, win, 12, locale)
  const cardProbe = await proveProbe(card, `${locale}：12 张的卡`)
  await clickOrFail(card.locator(BATCH), `${locale}：「生成剩下 12 张」`, { noWaitAfter: true })
  await expect(card.locator(TITLE), `${locale}：标题说正在发第几张`).toContainText(COPY[locale].sending(12), { timeout: stationTimeout({ operations: 4 }) })
  await quickShot(walk, win, `${locale}-sending`)
  await recorded(turnDone.received, `${locale}: generate returns once all twelve are decided`, stationTimeout({ operations: 24 }))
  await expectAbsent(card, { provenBy: cardProbe, message: `${locale}：十二张都定了，卡关掉` })
  await expect.poll(() => walk.fixture.images.length - imagesBefore,
    { message: `${locale}：十二张都真的发到供应商，各一次`, timeout: stationTimeout({ operations: 12 }) }).toBe(12)
  return 12
}

/** ② 中途 ×：宿主批下第 1 张时点 ×，供应商只收到批下的那几张。 */
async function stopRound(walk, win, projectId, locale) {
  const imagesBefore = walk.fixture.images.length
  const { card, operationId, turnDone, receipt } = await present(walk, win, 6, locale)
  // 批下的那几张先压在供应商那头（收下了、还没回）：停下之后主进程不忙着落图，那一句提示在的时候截得到图。
  // 压着不影响要量的事——供应商收到几笔请求，压着也照样记；放开之后它们照常出图。
  walk.fixture.holdSubmits(true)
  try {
    await clickOrFail(card.locator(BATCH), `${locale}：「生成剩下 6 张」`, { noWaitAfter: true })
    // 这一叠在跑时界面线程被主进程占着，走查每问一次页面都要等空档——点 × 之前只问必要的几次。
    await expect(card.locator(TITLE), `${locale}：标题说正在发第几张`).toContainText(COPY[locale].sending(6), { timeout: stationTimeout({ operations: 4 }) })
    const controls = await card.evaluate((element) => Object.fromEntries(['confirm', 'alternate', 'batch', 'slot-dismiss']
      .map((control) => [control, element.querySelectorAll(`[data-v4-control="${control}"]`).length])))
    expect(controls, `${locale}：正在发出时不摆「生成这张 / 去掉这张 / 生成剩下」，只留 ×（它就是停下）`)
      .toEqual({ confirm: 0, alternate: 0, batch: 0, 'slot-dismiss': 1 })
    // 停下之后那一句是一条会自己消失的提示：点之前先挂一个观察者，出现过就记下原话（读的时候它可能已经消失了）。
    await win.evaluate((source) => {
      const pattern = new RegExp(source)
      window.__spendBatchStopped = null
      new MutationObserver(() => {
        const text = document.body.innerText.match(pattern)?.[0]
        if (text && !window.__spendBatchStopped) window.__spendBatchStopped = text
      }).observe(document.body, { childList: true, subtree: true, characterData: true })
    }, COPY[locale].stopped.source)
    // 宿主批下第 1 张的那一刻，鼠标落在 × 此刻的位置上点下去——不走「定位 → 等可点 → 滚动 → 点」那几个来回：
    // 每个来回都要等主进程空出来，等完这一叠早跑完了。
    let dismissAt
    await expect.poll(async () => {
      const seen = await win.evaluate(async ({ pid, oid }) => {
        const read = await window.nomiDesktop.productionRuns.pendingSpend(pid)
        const left = (read?.rows ?? []).find((row) => row.operationId === oid)?.shots.length ?? 0
        const box = document.querySelector('[data-v4-block="intervention"][data-kind="spend"] [data-v4-control="slot-dismiss"]')?.getBoundingClientRect()
        return { left, at: box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null }
      }, { pid: projectId, oid: operationId })
      dismissAt = seen.at
      return seen.left
    }, { message: `${locale}：宿主批下第 1 张`, timeout: stationTimeout({ operations: 6 }), intervals: [100] }).toBeLessThan(6)
    expect(dismissAt, `${locale}：批下第 1 张时卡和 × 都还在`).toBeTruthy()
    await win.mouse.click(dismissAt.x, dismissAt.y)
    await expect.poll(() => win.evaluate(() => window.__spendBatchStopped),
      { message: `${locale}：卡关掉时说发了几张、剩几张没发`, timeout: stationTimeout({ operations: 6 }) }).toBeTruthy()
    await quickShot(walk, win, `${locale}-stopped`)
    walk.report.stoppedShotHasNotice = { ...(walk.report.stoppedShotHasNotice ?? {}), [locale]: await win.evaluate((source) => new RegExp(source).test(document.body.innerText), COPY[locale].stopped.source) }
  } finally {
    walk.fixture.holdSubmits(false)
  }
  const said = await win.evaluate(() => window.__spendBatchStopped)
  const [, sentText, notSentText] = COPY[locale].stopped.exec(said) ?? []
  const sent = Number(sentText)
  expect(sent + Number(notSentText), `${locale}：发了的 + 没发的 = 6（${said}）`).toBe(6)
  expect(sent, `${locale}：× 真的停下了（不是 6 张全发）`).toBeLessThan(6)
  await recorded(turnDone.received, `${locale}: generate returns once the card is closed by ×`)
  expect(receipt(), `${locale}：回执记成用户关掉了卡`).toMatch(/closed the card/)
  // 批下的正好是那一句说的张数；供应商收到的正好是批下的那几张（派完再数）。
  expect(await authorizedShots(win, projectId, operationId), `${locale}：宿主只批下了 ${sent} 张`).toBe(sent)
  await expect.poll(() => walk.fixture.images.length - imagesBefore,
    { message: `${locale}：供应商只收到批下的 ${sent} 张`, timeout: stationTimeout({ operations: 6 }) }).toBe(sent)
  walk.report.stopped = { ...(walk.report.stopped ?? {}), [locale]: { sent, notSent: Number(notSentText), said } }
  return sent
}

const walk = await createRuntimeWalk('spend-stop-midway', { generationProvider: 'apimart' })
let failure
try {
  const { win } = await walk.start({ first: true })
  const zhProject = await walk.newProject()
  await openCanvas(win)
  const sentZh = await sendingRound(walk, win, 'zh') + await stopRound(walk, win, zhProject.projectId, 'zh')

  // 英文：回项目库新开一个项目（新建按钮按中文认），再换成英文。
  await clickOrFail(win.getByRole('button', { name: '返回项目库' }), '返回项目库')
  const enProject = await walk.newProject()
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'en'))
  await win.reload()
  // 换语言只重载渲染层：落在这个项目的某个工作区，或落回项目库首页（项目没跟着重开）——等它落定再看是哪一种。
  const stage = win.locator('.generation-canvas-v2__stage')
  const projectCard = win.locator('[data-project-card="true"]').filter({ hasText: enProject.name }).first()
  const generateTab = win.getByRole('button', { name: 'Generate', exact: true })
  await expect.poll(async () => (await stage.isVisible()) || (await projectCard.isVisible()) || (await generateTab.isVisible()),
    { message: 'en：重载之后落定', timeout: stationTimeout({ operations: 4 }) }).toBe(true)
  if (!(await stage.isVisible())) {
    if (await projectCard.isVisible()) {
      await projectCard.hover()
      await clickOrFail(projectCard.getByRole('button', { name: /Continue/ }), 'en：从项目库打开新项目')
    }
    await clickOrFail(win.getByRole('button', { name: 'Generate', exact: true }), 'en：生成工作区')
    await expect(stage).toBeVisible({ timeout: stationTimeout({ operations: 4 }) })
  }
  await expandResidentPanel(win)
  await expect(win.locator(`${CANVAS_PANEL} [data-v4-control="input"]`), 'en：Agent 面板的输入框在').toBeVisible({ timeout: stationTimeout({ operations: 4 }) })
  const sentEn = await sendingRound(walk, win, 'en') + await stopRound(walk, win, enProject.projectId, 'en')

  expect(walk.fixture.images.length, '供应商一共收到的 = 两叠正在发出的各十二张 + 两次中途 × 之前批下的那几张').toBe(sentZh + sentEn)
  walk.report.verified = [
    'card-shows-progress-not-per-shot-actions-while-sending',
    'x-stops-generate-remaining-midway-only-approved-shots-sent',
    'stop-notice-says-sent-and-not-sent',
    'receipt-records-user-closed',
  ]
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
