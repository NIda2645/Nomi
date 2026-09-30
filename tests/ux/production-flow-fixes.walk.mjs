#!/usr/bin/env node
// 真实用户任务（零额度：loopback 夹具当供应商，不注入任何价格）：制作流程几处「停下来 / 继续」的验收走查。
// 真 App、真点击、真 IPC；每一步照测试表的行号记进 report.rows（ok / detail / 截图），红了照样往下走，最后按有没有红定退出码。
//
//   NOMI_PFF_SCENARIO=<一场> node tests/ux/production-flow-fixes.walk.mjs
//
// 场景（一次跑一场，每场一份独立资料）：
//   checkpoint          参考卡 + 两镜视频「全自动」放行 → 参考卡出图 → 任务卡上放行形象 → 两镜视频派出去并出片。
//   anchor-fail         参考卡生成失败 → 没开拍的视频镜说真实原因（不说「预算已用完 / 提额续拍」）；在参考卡上点「重试」→ 说人话。
//   pause-settle        三镜图片，第 1 镜在供应商那边时按急停 → 第 1 镜收尾后落到「已暂停」→ 第 3 镜「继续剩余」→ 剩下两镜出片。
//   pause-resume-early  急停后第 1 镜还没回来就点「继续剩余」→ 直接接着拍，不报错。
//   upgrade-open        「从上一版升级上来的资料」：NOMI_PFF_UPGRADE_FROM=<上一版跑 pause-settle / anchor-fail 留下的 report.json>，
//                        在同一份资料上换这一版打开那个项目，看旧 Run 被怎么接住。
//
// 中文走完主路径；要看文案的那几步同时切到英文再拍一张（英文界面里不许出现中文、不许出现主进程英文原话以外的拼接）。
import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_TIMEOUT_MS, clickOrFail, expect, waitForVisualQuiescence } from './_assert.mjs'
import { findCanvasBlankPoint, findNodeHitPoint } from './_canvasHit.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { FIXTURE_TEXT_MODEL_LABEL, flattenRequestText } from './agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, COMPOSER_PERMISSION, INTERVENTION_CONFIRM, PERMISSION_POPOVER, permissionTier,
  chooseAssistantModel, createRuntimeWalk, openCanvas, recorded, sendCanvas,
} from './agent-runtime-walk-support.mjs'

const SCENARIO = process.env.NOMI_PFF_SCENARIO || 'checkpoint'
const SCENARIOS = new Set(['checkpoint', 'anchor-fail', 'pause-settle', 'pause-resume-early', 'upgrade-open'])
if (!SCENARIOS.has(SCENARIO)) throw new Error(`NOMI_PFF_SCENARIO 只认 ${[...SCENARIOS].join(' / ')}`)

const IMAGE = { providerId: 'apimart', modelId: 'gpt-image-2' }
const VIDEO = { providerId: 'apimart', modelId: 'doubao-seedance-2.0' }
const TASK_TRIGGER = '[data-task-center-trigger="true"]'
const TASK_CARD = '[data-production-task-card]'
/** 今天没有价格：这几句在任何路径上都不该出现（有价格的那条路另说）。 */
const BUDGET_COPY = /预算已用完|提额续拍|Budget ran out|Raise budget/
/** 主进程的英文原话拼进了界面（「run status … · 操作没成功」那一类）。 */
const RAW_MAIN_TEXT = /run status|not resumable|Generation (?:rework|authorization)|previously authorized|· 操作没成功|· The action/i
const CJK = /[㐀-鿿]/

const readRun = (root, id) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.nomi', 'runs', id, 'run.json'), 'utf8')).run } catch { return null }
}
const jobsOf = (run) => (run?.jobs ?? []).map((job) => `${job.metadata?.shotId}:${job.status}${job.errorCode ? `(${job.errorCode})` : ''}`).join(' ')
const log = (...args) => console.log(`[pff:${SCENARIO}]`, ...args)

const upgradeFrom = process.env.NOMI_PFF_UPGRADE_FROM
const previous = SCENARIO === 'upgrade-open'
  ? (() => {
    if (!upgradeFrom) throw new Error('upgrade-open 要 NOMI_PFF_UPGRADE_FROM=<上一版那一场的 report.json>')
    return JSON.parse(fs.readFileSync(upgradeFrom, 'utf8'))
  })()
  : null

process.env.NOMI_WALK_UNPRICED_MODEL = '1'
const walk = await createRuntimeWalk(`pff-${SCENARIO}`, {
  generationProvider: 'apimart',
  ...(previous ? { profileDir: previous.tempRoot } : {}),
})
const rows = {}
walk.report.rows = rows
walk.report.scenario = SCENARIO

/** 记一行测试表的结果：断言失败不抛，写成 ok:false 接着走。 */
async function row(id, title, check) {
  try {
    const detail = await check()
    rows[id] = { title, ok: true, detail: detail ?? '', shots: rows[id]?.shots ?? [] }
  } catch (error) {
    // 断言库的报错第一行只有「toBe 失败」，真正有用的是后面的 Expected / Received：一起留下。
    const detail = String(error?.message ?? error).replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((line) => line.trim()).filter(Boolean).join(' ')
    rows[id] = { title, ok: false, detail: detail.slice(0, 400), shots: rows[id]?.shots ?? [] }
    process.exitCode = 1
  }
  log(rows[id].ok ? 'PASS' : 'FAIL', id, title, rows[id].detail)
}

async function shot(id, label) {
  const file = await walk.snap(`${id}-${label}`).catch((error) => { log('snap failed', error.message.split('\n')[0]); return null })
  if (file) (rows[id] ??= { title: '', ok: false, detail: '', shots: [] }).shots.push(file)
  return file
}

async function setLocale(win, locale) {
  await win.evaluate((value) => localStorage.setItem('nomi:locale:v1', value), locale)
  await win.reload({ waitUntil: 'domcontentloaded' })
  await expect(win.locator('.generation-canvas-v2__stage')).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
  await waitForVisualQuiescence(win)
}

async function fitView(win) {
  const blank = await findCanvasBlankPoint(win)
  if (blank) await win.mouse.click(blank.x, blank.y)
  const fit = win.getByRole('button', { name: /^(适应视图|Fit view)$/ }).first()
  if (await fit.isVisible().catch(() => false)) await fit.click()
  await waitForVisualQuiescence(win)
}

/** 放大到能看清这一张卡、并选中它。 */
async function focusNode(win, nodeId) {
  await fitView(win)
  const target = win.locator(`[data-node-id="${nodeId}"]`).first()
  for (let step = 0; step < 8; step += 1) {
    const box = await target.boundingBox()
    if (!box || box.width >= 260) break
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await win.keyboard.down('Control'); await win.mouse.wheel(0, -240); await win.keyboard.up('Control')
    await waitForVisualQuiescence(win)
  }
  const point = await findNodeHitPoint(win, { nodeSelector: `[data-node-id="${nodeId}"]` })
  await win.mouse.click(point.x, point.y)
}

/** 画布上每张制作卡此刻挂着什么（排队 / 已停小标、按钮、失败卡、节点底部那行反馈）。 */
function faces(win, nodeIds) {
  return win.evaluate((ids) => ids.map((id) => {
    const node = document.querySelector(`[data-node-id="${id}"]`)
    const placeholder = node?.querySelector('[data-shot-placeholder-state]')
    const feedback = [...(node?.querySelectorAll('p[role="status"]') ?? [])].map((element) => element.textContent?.trim()).filter(Boolean).join(' | ')
    return {
      id,
      exists: Boolean(node),
      status: node?.getAttribute('data-status') ?? null,
      placeholder: placeholder?.getAttribute('data-shot-placeholder-state') ?? null,
      placeholderText: placeholder?.textContent?.trim() ?? null,
      action: node?.querySelector('[data-production-shot-action]')?.getAttribute('data-production-shot-action') ?? null,
      failure: node?.querySelector('[role="alert"]')?.textContent?.trim().slice(0, 160) ?? null,
      feedback: feedback || null,
    }
  }), nodeIds)
}

async function pageText(win) {
  return win.evaluate(() => document.body.innerText)
}

/** Agent 起草 → 切「全自动」→ 说一句「全部生成」。返回 Run 与镜。 */
async function draftAndRelease(win, projectRoot, { tag, shots, beforeGenerate }) {
  const planner = walk.fixture.expectText({
    label: `${tag} draft`, match: (body) => flattenRequestText(body).includes(`${tag}_ASK`),
    reply: { type: 'tool', id: `${tag}-plan`, name: 'draft_shots', args: { shots } },
  })
  let operationId
  const drafted = walk.fixture.expectText({
    label: `${tag} draft result`, match: (body) => {
      const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === `${tag}-plan`)
      if (!result || flattenRequestText(body).includes(`${tag}_GO`)) return false
      operationId = /"operationId":"([^"]+)"/.exec(String(result.content))?.[1]
      return true
    },
    reply: { type: 'text', text: `${tag}_HOLD_DONE` },
  })
  await sendCanvas(win, `${tag}_ASK 起草这几镜，先别生成。`)
  await recorded(planner.received, 'draft request')
  await recorded(drafted.received, 'draft result')
  await expect.poll(() => (readRun(projectRoot, operationId)?.generationPlan?.shots ?? []).filter((shot) => shot.nodeId).length,
    { message: '草稿落到画布上', timeout: DEFAULT_TIMEOUT_MS }).toBe(shots.length)
  const planShots = readRun(projectRoot, operationId).generationPlan.shots
  await clickOrFail(win.locator(`${CANVAS_PANEL} ${COMPOSER_PERMISSION}`), '权限档选择器')
  await expect(win.locator(`${CANVAS_PANEL} ${PERMISSION_POPOVER}`)).toBeVisible()
  await clickOrFail(win.locator(`${CANVAS_PANEL} ${permissionTier('project')}`), '切到「全自动」')
  const switchCard = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="approval-reversible"]`)
  await expect(switchCard).toBeVisible()
  await clickOrFail(switchCard.locator(INTERVENTION_CONFIRM), '确认切到全自动')
  beforeGenerate?.()
  const goTurn = walk.fixture.expectText({ label: `${tag} go`, match: (body) => flattenRequestText(body).includes(`${tag}_GO`), reply: { type: 'tool', id: `${tag}-go`, name: 'generate', args: { operationId } } })
  const goDone = walk.fixture.expectText({ label: `${tag} go done`, match: (body) => (body.messages ?? []).some((message) => message.role === 'tool' && message.tool_call_id === `${tag}-go`), reply: { type: 'text', text: `${tag}_GO_DONE` } })
  await sendCanvas(win, `${tag}_GO 全部生成吧`)
  await recorded(goTurn.received, 'generate request')
  return { operationId, planShots, goDone }
}

async function openTaskCard(win) {
  if (!(await win.locator(TASK_CARD).first().isVisible().catch(() => false))) await clickOrFail(win.locator(TASK_TRIGGER), '打开任务面板')
  await expect(win.locator(TASK_CARD).first()).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
}

async function closeTaskPanel(win) {
  await win.keyboard.press('Escape').catch(() => {})
  await waitForVisualQuiescence(win)
}

/** 英文界面里这一块不许有中文。 */
function assertNoCjk(text, where) {
  const hit = CJK.exec(text ?? '')
  if (hit) throw new Error(`${where} 在英文界面里有中文：「${String(text).slice(Math.max(0, hit.index - 20), hit.index + 20)}」`)
}

let failure
try {
  const started = await walk.start({ first: SCENARIO !== 'upgrade-open' })
  let { win } = started

  if (SCENARIO === 'upgrade-open') {
    // ── 上一版留下的资料：换这一版打开同一个项目 ──
    const { projectId, projectRoot, operationId, scenario: previousScenario, projectName } = previous.seed
    log('upgrade from', previousScenario, 'run', operationId, 'status on disk', readRun(projectRoot, operationId)?.status, jobsOf(readRun(projectRoot, operationId)))
    const card = win.locator('[data-project-card="true"]').filter({ hasText: projectName }).first()
    await expect(card).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
    await card.hover()
    await clickOrFail(card.getByRole('button', { name: /继续创作|Continue/ }), '打开上一版留下的项目')
    await win.waitForFunction((id) => location.href.includes(`projectId=${encodeURIComponent(id)}`), projectId)
    await openCanvas(win)
    const nodeIds = readRun(projectRoot, operationId).generationPlan.shots.map((shot) => shot.nodeId).filter(Boolean)
    if (previousScenario === 'pause-settle') {
      await row('U1', '升级：上一版一直「暂停中」的制作，打开后落到「已暂停」', async () => {
        await expect.poll(() => readRun(projectRoot, operationId)?.status, { timeout: stationTimeout({ operations: 4 }), intervals: [500] }).toBe('paused')
        return jobsOf(readRun(projectRoot, operationId))
      })
      await openTaskCard(win)
      await shot('U1', 'zh-task-card')
      await closeTaskPanel(win)
      await row('U2', '升级：没开拍的镜头上「继续剩余」能用，剩下的镜头出片', async () => {
        const run = readRun(projectRoot, operationId)
        const pending = run.generationPlan.shots.filter((planShot) => run.jobs.find((job) => job.metadata?.shotId === planShot.shotId)?.status === 'authorized')
        if (pending.length === 0) throw new Error(`没有待继续的镜头：${jobsOf(run)}`)
        const last = pending.at(-1)
        await focusNode(win, last.nodeId)
        await shot('U2', 'zh-stopped-shot')
        await clickOrFail(win.locator(`[data-node-id="${last.nodeId}"] [data-production-shot-action]`).first(), '第 3 镜「继续剩余」', { noWaitAfter: true })
        const before = walk.fixture.images.length
        await expect.poll(() => walk.fixture.images.length, { timeout: stationTimeout({ operations: 4 }) }).toBe(before + pending.length)
        await expect.poll(() => readRun(projectRoot, operationId).jobs.filter((job) => job.status === 'ready' || job.status === 'adopted').length,
          { timeout: stationTimeout({ operations: 4 }) }).toBe(run.generationPlan.shots.length)
        return jobsOf(readRun(projectRoot, operationId))
      })
      await fitView(win)
      await shot('U2', 'zh-after-resume')
      await setLocale(win, 'en')
      await fitView(win)
      await shot('U2', 'en-after-resume')
    } else {
      await fitView(win)
      await row('U3', '升级：上一版停在「需要处理」的制作（没记停下原因），打开后不再说「预算已用完 / 提额续拍」', async () => {
        await expect.poll(async () => (await faces(win, nodeIds)).some((face) => face.placeholder === 'stopped'), { timeout: DEFAULT_TIMEOUT_MS }).toBe(true)
        const text = await pageText(win)
        if (BUDGET_COPY.test(text)) throw new Error(`页面上还有预算文案：${JSON.stringify(await faces(win, nodeIds))}`)
        return JSON.stringify((await faces(win, nodeIds)).map((face) => face.placeholderText ?? face.failure))
      })
      await shot('U3', 'zh-legacy-stopped')
      await setLocale(win, 'en')
      await fitView(win)
      await row('U4', '升级（英文）：同一个旧制作，英文界面也不说预算、没有中文', async () => {
        const text = await pageText(win)
        if (BUDGET_COPY.test(text)) throw new Error('英文界面还有预算文案')
        for (const face of await faces(win, nodeIds)) if (face.placeholderText) assertNoCjk(face.placeholderText, `卡 ${face.id}`)
        return JSON.stringify((await faces(win, nodeIds)).map((face) => face.placeholderText))
      })
      await shot('U4', 'en-legacy-stopped')
    }
  } else {
    const { projectId, projectRoot, name: projectName } = await walk.newProject()
    walk.report.seed = { scenario: SCENARIO, projectId, projectRoot, projectName }
    await openCanvas(win)
    await chooseAssistantModel(win, FIXTURE_TEXT_MODEL_LABEL, CANVAS_PANEL)
    const consent = win.getByRole('button', { name: '不分享', exact: true }).first()
    if (await consent.isVisible().catch(() => false)) await consent.click()

    if (SCENARIO === 'checkpoint' || SCENARIO === 'anchor-fail') {
      const videoShot = (n, prompt) => ({ title: `镜${n}`, prompt, taskKind: 'text_to_video', candidate: VIDEO, durationSec: 4, parameters: { resolution: '480p', generate_audio: false } })
      const shots = [
        { title: '渔港参考', role: 'anchor', storyboard: { kind: 'scene', carrier: 'visual' }, prompt: '清晨的渔港全景，薄雾', taskKind: 'text_to_image', candidate: IMAGE },
        videoShot(1, '清晨渔港，小船轻晃'), videoShot(2, '码头上一只猫晒太阳'),
      ]
      const { operationId, planShots, goDone } = await draftAndRelease(win, projectRoot, {
        tag: SCENARIO === 'checkpoint' ? 'PFC' : 'PFA', shots,
        // 参考卡交给供应商之后，供应商判它失败（夹具的逐笔失败注入：受理成功、轮询回 failed）。
        beforeGenerate: () => { if (SCENARIO === 'anchor-fail') walk.fixture.setMediaBehavior(({ kind }) => (kind === 'image' ? { fail: { message: 'fixture: image generation failed' } } : undefined)) },
      })
      walk.report.seed.operationId = operationId
      await recorded(goDone.received, 'generate returns')
      const [anchor, video1, video2] = planShots
      const nodeIds = planShots.map((planShot) => planShot.nodeId)

      if (SCENARIO === 'checkpoint') {
        await row('T1', '参考卡出图后，任务面板里出现「形象确认」', async () => {
          await expect.poll(() => readRun(projectRoot, operationId)?.gates?.find((gate) => gate.scope === 'anchor_checkpoint')?.status ?? null,
            { timeout: stationTimeout({ operations: 8 }) }).toBe('waiting')
          const run = readRun(projectRoot, operationId)
          return `参考卡 ${jobsOf(run)}；封信封时项目版本 ${run.generationPlan?.authorizationEnvelope?.projectRevision}`
        })
        await openTaskCard(win)
        await shot('T1', 'zh-checkpoint-card')
        await clickOrFail(win.locator(`${TASK_CARD} [data-production-primary-action]`).first(), '制作卡主按钮（过目后开拍）')
        await clickOrFail(win.locator('[data-anchor-checkpoint-primary][data-anchor-checkpoint-mode="approve"]'), '形象确认卡「开拍」')
        await closeTaskPanel(win)
        await row('T2', '放行形象后，两镜视频真的派出去（不卡在「排队中」）', async () => {
          await expect.poll(() => walk.fixture.videos.length, { timeout: stationTimeout({ operations: 4 }) }).toBe(2)
          return jobsOf(readRun(projectRoot, operationId))
        })
        await fitView(win)
        await shot('T2', 'zh-videos-generating')
        walk.fixture.releaseVideos()
        await row('T3', '两镜视频出片、落回各自的卡；整批收尾，Run 不再一直「进行中」', async () => {
          for (const planShot of [video1, video2]) {
            await expect(win.locator(`[data-node-id="${planShot.nodeId}"][data-status="success"]`)).toBeVisible({ timeout: stationTimeout({ operations: 6 }) })
          }
          await expect.poll(() => readRun(projectRoot, operationId)?.status, { timeout: stationTimeout({ operations: 4 }) }).not.toBe('running')
          return `${readRun(projectRoot, operationId).status} · ${jobsOf(readRun(projectRoot, operationId))}`
        })
        await fitView(win)
        await shot('T3', 'zh-landed')
        await row('T4', '全程没有「预算已用完 / 提额续拍」', async () => {
          if (BUDGET_COPY.test(await pageText(win))) throw new Error('页面上出现了预算文案')
          return 'ok'
        })
        await openTaskCard(win)
        await shot('T3', 'zh-task-card-settled')
        await closeTaskPanel(win)
        await setLocale(win, 'en')
        await fitView(win)
        await shot('T3', 'en-landed')
        void anchor
      } else {
        await row('T5', '参考卡生成失败后，Run 停下来（不会一直转）', async () => {
          await expect.poll(() => readRun(projectRoot, operationId)?.status, { timeout: stationTimeout({ operations: 6 }), intervals: [500] }).toBe('needs_attention')
          return jobsOf(readRun(projectRoot, operationId))
        })
        await fitView(win)
        await row('T6', '没开拍的视频镜说真实原因：不出现「预算已用完 / 提额续拍」', async () => {
          await expect.poll(async () => (await faces(win, [video1.nodeId, video2.nodeId])).every((face) => face.placeholder === 'stopped'),
            { timeout: DEFAULT_TIMEOUT_MS }).toBe(true)
          const all = await faces(win, [video1.nodeId, video2.nodeId])
          if (all.some((face) => BUDGET_COPY.test(face.placeholderText ?? '') || face.action === 'resume-budget')) {
            throw new Error(`视频镜上挂着预算文案：${JSON.stringify(all.map((face) => [face.placeholderText, face.action]))}`)
          }
          return JSON.stringify(all.map((face) => [face.placeholderText, face.action]))
        })
        await shot('T6', 'zh-shots-after-anchor-failed')
        await row('T7', '在失败的参考卡上点「重试」：说人话，不拼主进程英文原话', async () => {
          await focusNode(win, anchor.nodeId)
          const retry = win.locator(`[data-node-id="${anchor.nodeId}"] [role="alert"] button`).filter({ hasText: /^(重试|仍要重试|Retry|Retry anyway)$/ }).first()
          await expect(retry).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
          await retry.click()
          let feedback = null
          await expect.poll(async () => { feedback = (await faces(win, [anchor.nodeId]))[0].feedback; return Boolean(feedback) }, { timeout: DEFAULT_TIMEOUT_MS }).toBe(true)
          if (RAW_MAIN_TEXT.test(feedback)) throw new Error(`反馈里拼着主进程原话：「${feedback}」`)
          if (/^操作没成功，请稍后再试$/.test(feedback)) throw new Error('反馈只有一句「操作没成功，请稍后再试」，没说原因和能做什么')
          return feedback
        })
        await shot('T7', 'zh-anchor-retry-feedback')
        await setLocale(win, 'en')
        await fitView(win)
        await row('T8', '英文界面：视频镜不说预算、没有中文', async () => {
          const all = await faces(win, [video1.nodeId, video2.nodeId])
          if (all.some((face) => BUDGET_COPY.test(face.placeholderText ?? ''))) throw new Error(`英文界面有预算文案：${JSON.stringify(all.map((face) => face.placeholderText))}`)
          for (const face of all) if (face.placeholderText) assertNoCjk(face.placeholderText, `卡 ${face.id}`)
          return JSON.stringify(all.map((face) => face.placeholderText))
        })
        await shot('T8', 'en-shots-after-anchor-failed')
        await row('T9', '英文界面：参考卡「重试」的反馈是英文人话', async () => {
          await focusNode(win, anchor.nodeId)
          const retry = win.locator(`[data-node-id="${anchor.nodeId}"] [role="alert"] button`).filter({ hasText: /^(Retry|Retry anyway)$/ }).first()
          await expect(retry).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
          await retry.click()
          let feedback = null
          await expect.poll(async () => { feedback = (await faces(win, [anchor.nodeId]))[0].feedback; return Boolean(feedback) }, { timeout: DEFAULT_TIMEOUT_MS }).toBe(true)
          assertNoCjk(feedback, '参考卡反馈')
          if (RAW_MAIN_TEXT.test(feedback)) throw new Error(`反馈里拼着主进程原话：「${feedback}」`)
          return feedback
        })
        await shot('T9', 'en-anchor-retry-feedback')
        walk.report.seed.nodeIds = nodeIds
      }
    } else {
      // ── 三镜图片：第 1 镜的提交压在夹具里时按急停 ──
      const imageShot = (n, prompt) => ({ title: `镜${n}`, prompt, taskKind: 'text_to_image', candidate: IMAGE })
      const shots = [imageShot(1, '清晨渔港'), imageShot(2, '码头的猫'), imageShot(3, '海鸥')]
      const { operationId, planShots, goDone } = await draftAndRelease(win, projectRoot, {
        tag: SCENARIO === 'pause-settle' ? 'PFP' : 'PFE', shots,
        beforeGenerate: () => walk.fixture.holdSubmits(true),
      })
      walk.report.seed.operationId = operationId
      const [, , shot3] = planShots
      const nodeIds = planShots.map((planShot) => planShot.nodeId)
      await expect.poll(() => walk.fixture.images.length, { message: '第 1 镜的提交到了夹具（压着）', timeout: stationTimeout({ operations: 4 }) }).toBe(1)
      await openTaskCard(win)
      await clickOrFail(win.locator(`${TASK_CARD} [data-production-control="pause"]`).first(), '任务卡「暂停」（急停）')
      await expect.poll(() => readRun(projectRoot, operationId)?.status, { timeout: DEFAULT_TIMEOUT_MS }).toMatch(/^paus/)
      await closeTaskPanel(win)

      if (SCENARIO === 'pause-resume-early') {
        await row('T13', '急停后第 1 镜还没回来就点「继续剩余」：直接接着拍，不报错', async () => {
          await focusNode(win, shot3.nodeId)
          await expect(win.locator(`[data-node-id="${shot3.nodeId}"] [data-production-shot-action]`).first()).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
          await shot('T13', 'zh-pausing-before-resume')
          await clickOrFail(win.locator(`[data-node-id="${shot3.nodeId}"] [data-production-shot-action]`).first(), '第 3 镜「继续剩余」', { noWaitAfter: true })
          await expect.poll(() => readRun(projectRoot, operationId)?.status, { timeout: DEFAULT_TIMEOUT_MS }).toBe('running')
          const feedback = (await faces(win, [shot3.nodeId]))[0].feedback
          if (feedback && (RAW_MAIN_TEXT.test(feedback) || /没成功|failed/i.test(feedback))) throw new Error(`点了继续报错：「${feedback}」`)
          return feedback ?? '没有报错'
        })
        walk.fixture.holdSubmits(false)
        await recorded(goDone.received, 'generate returns')
        await row('T14', '接着拍：三镜都出片', async () => {
          await expect.poll(() => walk.fixture.images.length, { timeout: stationTimeout({ operations: 4 }) }).toBe(3)
          await expect.poll(() => readRun(projectRoot, operationId).jobs.filter((job) => job.status === 'ready' || job.status === 'adopted').length,
            { timeout: stationTimeout({ operations: 4 }) }).toBe(3)
          return jobsOf(readRun(projectRoot, operationId))
        })
        await fitView(win)
        await shot('T14', 'zh-all-landed')
      } else {
        walk.fixture.holdSubmits(false)
        await recorded(goDone.received, 'generate returns')
        await row('T10', '急停后在跑的那一镜收尾，Run 落到「已暂停」（不再一直转）', async () => {
          await expect.poll(() => readRun(projectRoot, operationId)?.status, { timeout: stationTimeout({ operations: 4 }), intervals: [500] }).toBe('paused')
          return jobsOf(readRun(projectRoot, operationId))
        })
        await openTaskCard(win)
        await shot('T10', 'zh-task-card-after-pause')
        await closeTaskPanel(win)
        await row('T11', '「继续剩余」能用：剩下两镜派出去并出片', async () => {
          await focusNode(win, shot3.nodeId)
          await shot('T11', 'zh-stopped-shot3')
          await clickOrFail(win.locator(`[data-node-id="${shot3.nodeId}"] [data-production-shot-action]`).first(), '第 3 镜「继续剩余」', { noWaitAfter: true })
          let feedback = null
          await expect.poll(async () => {
            feedback = (await faces(win, [shot3.nodeId]))[0].feedback
            return walk.fixture.images.length >= 3 || Boolean(feedback)
          }, { timeout: stationTimeout({ operations: 4 }) }).toBe(true)
          if (walk.fixture.images.length < 3) throw new Error(`没有继续，节点反馈：「${feedback}」`)
          await expect.poll(() => readRun(projectRoot, operationId).jobs.filter((job) => job.status === 'ready' || job.status === 'adopted').length,
            { timeout: stationTimeout({ operations: 4 }) }).toBe(3)
          return jobsOf(readRun(projectRoot, operationId))
        })
        await fitView(win)
        await shot('T11', 'zh-after-resume')
        await row('T12', '「继续剩余」出错时说人话（不拼主进程英文原话）', async () => {
          const all = await faces(win, nodeIds)
          const bad = all.find((face) => face.feedback && RAW_MAIN_TEXT.test(face.feedback))
          if (bad) throw new Error(`卡 ${bad.id} 的反馈拼着主进程原话：「${bad.feedback}」`)
          return JSON.stringify(all.map((face) => face.feedback).filter(Boolean))
        })
        await setLocale(win, 'en')
        await fitView(win)
        await shot('T11', 'en-after-resume')
      }
    }
    walk.report.seed.nodeIds ??= undefined
  }
  const summary = Object.entries(rows).map(([id, entry]) => `${id} ${entry.ok ? 'PASS' : 'FAIL'}`).join(' · ')
  log('rows', summary)
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  walk.fixture?.holdSubmits(false)
  await walk.finish(failure, { unscriptedFixture: true })
}
