#!/usr/bin/env node
// 剧本 PB10 · 「节点上显示什么」：版本角标、重拍入口、已保存回执、失败标题、草稿标题
//
// 用户拍板的显示规则（零花费，全部从真实 App 的真实节点上看）：
//   · 「N 版」角标只在 ≥2 版时出现；制作流程的镜头 1 版也不出角标，「重拍这镜」只住在选中节点时出现的浮条里；
//   · 「已保存到项目」存好后只显示 3 秒（系统开了「减少动态效果」不淡出，直接消失）；
//   · 失败标题只说原因，不附「未计费」；
//   · 视频草稿节点没有标题时说「镜头 N」，不回退成候选 id（cand-op-…）。
// 单版角标 / 回执窗口由监视器的铁律 9（9a / 9b）现场判；这里负责把画面留下来，并对每条规则各写一句断言。
import { DEFAULT_TIMEOUT_MS, clickOrFail, expect, waitForVisualQuiescence } from '../../_assert.mjs'
import { stationTimeout } from '../../_station-budget.mjs'
import { panCanvasUntilInside } from '../../_canvasHit.mjs'
import { FIXTURE_APIMART_VENDOR, FIXTURE_IMAGE_MODEL, FIXTURE_VENDOR } from '../../agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, COMPOSER, COMPOSER_PERMISSION, INTERVENTION_CONFIRM, PERMISSION_POPOVER,
  expandResidentPanel, permissionTier, sendCanvas,
} from '../../agent-runtime-walk-support.mjs'
import { clickBlank, clickNodeGenerate, fitCanvasView, selectNode } from '../actions.mjs'
import { operationIdOf, scriptTurn } from '../brain.mjs'
import { startPlaybook } from '../launch.mjs'

process.env.NOMI_WALK_UNPRICED_MODEL = '1'
const VIDEO_MODEL = 'kling-v3'
const base = { categoryId: 'shots', references: [], runs: [] }
const pb = await startPlaybook({
  id: 'pb10-node-display-rules',
  needs: ['loopbackProvider', 'fixtureTextModel', 'paidGenerationRoute'],
  seed: ({ imageResult, imageMeta }) => ({
    nodes: [
      // 制作流程的镜头，只有 1 版：不该有角标；选中后浮条里有「重拍这镜」。
      { ...base, id: 'shot-one', kind: 'image', title: 'Shot 1', prompt: '', position: { x: 60, y: 90 }, status: 'success',
        result: imageResult('one-r1', 2, 1), history: [imageResult('one-r1', 2, 1)],
        meta: { ...imageMeta(), productionRunId: 'run-display', productionShotId: 'shot-one' } },
      // 2 版：显示「2 版」。
      { ...base, id: 'shot-two', kind: 'image', title: 'Shot 2', prompt: '', position: { x: 520, y: 90 }, status: 'success',
        result: imageResult('two-r2', 3, 2), history: [imageResult('two-r1', 2, 1), imageResult('two-r2', 3, 2)],
        meta: { ...imageMeta(), productionRunId: 'run-display', productionShotId: 'shot-two' } },
      // 请求没出门的失败（出站策略拦下）：标题只说原因，没有「未计费」。
      { ...base, id: 'blocked', kind: 'image', title: 'Blocked', prompt: 'x', position: { x: 980, y: 90 }, status: 'error',
        error: 'NOMI_ERR::outbound-blocked-submit:: request was blocked before it left this machine', history: [],
        meta: { modelKey: FIXTURE_IMAGE_MODEL, modelVendor: FIXTURE_VENDOR, imageModel: FIXTURE_IMAGE_MODEL, imageModelVendor: FIXTURE_VENDOR } },
      // 点 ↑ 生成：存好那一刻出「已保存到项目」，3 秒后消失。
      { ...base, id: 'saver', kind: 'image', title: 'Saver', prompt: 'rainy corner', position: { x: 60, y: 520 }, status: 'idle', history: [],
        meta: { modelKey: FIXTURE_IMAGE_MODEL, modelVendor: FIXTURE_VENDOR, imageModel: FIXTURE_IMAGE_MODEL, imageModelVendor: FIXTURE_VENDOR } },
    ],
    groups: [],
    edges: [],
  }),
})
const { smoke, fixture, monitor } = pb
const EN = pb.locale === 'en'
const win = () => smoke.win
const nodes = async () => (await monitor.readProject())?.payload?.generationCanvas?.nodes ?? []
const pill = (id) => win().locator(`[data-node-id="${id}"] [data-card-stack-side]`)
const savedLabel = () => win().locator('[data-generation-status][data-phase="finalizing"]')
const reshootButton = () => win().locator('[data-node-floating-toolbar="true"]').getByRole('button', { name: EN ? 'Re-film shot' : '重拍这镜' })

let harnessError = null
try {
  await monitor.step('打开项目（从项目库）', () => smoke.openProject(), { surfaces: ['*'], critical: true })
  await monitor.step('适应视图，看四个节点（没选中任何一个）', async () => {
    await fitCanvasView(win())
    await clickBlank(win())
    await monitor.screenshot('01-nodes-nothing-selected')
  }, { user: false, surfaces: ['canvasViewport'] })

  await monitor.step('规则：1 版没有角标，2 版有「2 版」', async () => {
    await expect(pill('shot-one'), '制作流程镜头只有 1 版：不出角标').toHaveCount(0)
    await expect(pill('shot-two'), '2 版：出角标').toHaveCount(1)
    await expect(pill('shot-two')).toContainText(EN ? '2 versions' : '2 版')
  }, { user: false, surfaces: [] })

  await monitor.step('选中 1 版的镜头：浮条里有「重拍这镜」，仍没有角标', async () => {
    await selectNode(win(), 'shot-one')
    await expect(reshootButton(), '浮条里的重拍').toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
    // 浮条比节点宽，节点靠边时会被舞台裁掉一截：像人一样把画布拖到浮条完整可见再拍。
    expect((await panCanvasUntilInside(win(), reshootButton().first())).ok, '重拍按钮被拖进舞台').toBe(true)
    await expect(pill('shot-one'), '选中也不出角标').toHaveCount(0)
    await monitor.screenshot('02-one-version-selected-toolbar')
  }, { surfaces: ['canvasGesture'] })

  await monitor.step('选中 2 版的镜头：角标「2 版」，浮条里同样有「重拍这镜」', async () => {
    await selectNode(win(), 'shot-two')
    await expect(reshootButton()).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
    expect((await panCanvasUntilInside(win(), reshootButton().first())).ok, '重拍按钮被拖进舞台').toBe(true)
    await monitor.screenshot('03-two-versions-selected-toolbar')
  }, { surfaces: ['canvasGesture'] })

  await monitor.step('失败节点：标题只说原因，没有「未计费」', async () => {
    await clickBlank(win())
    const text = (await win().locator('[data-node-id="blocked"]').innerText()).replace(/\s+/g, ' ')
    expect(text, '失败节点上不出现「未计费 / Not charged」').not.toMatch(/未计费|not charged/i)
    await monitor.screenshot('04-failed-node-no-not-charged')
  }, { user: false, surfaces: [] })

  await monitor.step('点「Saver」的 ↑ 生成；刚存好时「已保存到项目」在，3 秒后它消失', async () => {
    // 窗口只有 3 秒：步骤之间的收尾会吃掉它。所以点击与等回执在同一步里，且等待在点击之前就挂上（页面侧轮询，不绕读项目文件）。
    const appeared = savedLabel().first().waitFor({ state: 'visible', timeout: stationTimeout({ operations: 4 }) })
    appeared.catch(() => undefined)
    await monitor.consentNodeGenerate('saver', { label: 'Saver 的 ↑' })
    await clickNodeGenerate(win(), 'saver')
    await appeared
    await monitor.screenshot('05-saved-just-now')
    // 4 秒后（窗口 3 秒）再拍一张，证明它已经消失。
    await win().waitForTimeout(4000)
    await expect(savedLabel(), '4 秒后回执已经消失').toHaveCount(0)
    expect((await nodes()).find((node) => node.id === 'saver')?.status, 'Saver 落成 success').toBe('success')
    await monitor.screenshot('06-saved-gone-after-4s')
  }, { surfaces: ['modal', 'canvasGesture'] })

  // ── 视频草稿节点：没标题时说「镜头 N」（Agent 起草，全自动，供应商是回环夹具）──────────
  await monitor.step('展开生成页的 Agent 面板，权限档切到「全自动」', async () => {
    await expandResidentPanel(win())
    await expect(win().locator(`${CANVAS_PANEL} ${COMPOSER}`)).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
    await clickOrFail(win().locator(`${CANVAS_PANEL} ${COMPOSER_PERMISSION}`), 'permission selector')
    await expect(win().locator(`${CANVAS_PANEL} ${PERMISSION_POPOVER}`)).toBeVisible()
    await clickOrFail(win().locator(`${CANVAS_PANEL} ${permissionTier('project')}`), 'full auto')
    const switchCard = win().locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="approval-reversible"]`)
    await expect(switchCard).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
    monitor.consentFullAuto({ label: 'switch to full auto' })
    await clickOrFail(switchCard.locator(INTERVENTION_CONFIRM), 'confirm full auto')
    await expect(win().locator(`${CANVAS_PANEL} [data-v4-block="auto-mode"]`)).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
  }, { surfaces: ['agentPanel', 'rightPanel'] })

  const SHOTS = EN ? ['Morning harbour in the mist', 'A cat sunbathing on the pier'] : ['清晨的渔港，雾里的小船', '码头上晒太阳的猫']
  const draft = scriptTurn(fixture, {
    label: 'pb10-draft',
    marker: 'PB10-',
    steps: [
      // 刻意不给标题：节点标题只能走产品的回退规则。
      { name: 'draft_shots', args: { shots: SHOTS.map((prompt) => ({ prompt, taskKind: 'text_to_video', candidate: { providerId: FIXTURE_APIMART_VENDOR, modelId: VIDEO_MODEL } })) } },
      { name: 'generate', args: ({ previous }) => ({ operationId: operationIdOf(previous) }) },
      { text: EN ? 'Both shots are generating.' : '两镜都开始生成了。' },
    ],
  })
  await monitor.step('用户：把这两镜做成视频', () => sendCanvas(win(), EN ? `PB10-: make these two shots into videos: 1) ${SHOTS[0]}; 2) ${SHOTS[1]}.` : `PB10-：把这两镜做成视频：镜1 ${SHOTS[0]}；镜2 ${SHOTS[1]}。`), { surfaces: [] })
  await monitor.step('等 Agent 起草并开跑', async () => { await draft.done }, { user: false, surfaces: [] })
  await monitor.step('看画布上草稿节点的标题', async () => {
    await expect.poll(async () => (await nodes()).filter((node) => node.kind === 'video').length, { message: '两个视频草稿节点落到了画布上', timeout: stationTimeout({ turns: 1 }) }).toBeGreaterThanOrEqual(2)
    await fitCanvasView(win())
    const titles = (await nodes()).filter((node) => node.kind === 'video').map((node) => String(node.title))
    monitor.note({ kind: 'video-draft-titles', titles })
    for (const title of titles) expect(title, '草稿节点标题不是候选 id').not.toMatch(/cand-op-|op-[0-9a-f]{8}/)
    await monitor.screenshot('07-video-draft-titles')
    // 画布缩小后标题看不清：像人一样捏合放大到第一个草稿节点上，再拍一张。
    const cards = win().locator('[data-node-id][data-kind="video"]')
    const box = await cards.first().boundingBox()
    if (box) {
      await win().mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await win().keyboard.down('Control')
      for (let step = 0; step < 2; step += 1) await win().mouse.wheel(0, -240)
      await win().keyboard.up('Control')
      await waitForVisualQuiescence(win())
    }
    await monitor.screenshot('08-video-draft-titles-zoomed')
    const labelOf = EN ? /^Shot \d+$/ : /^镜头 \d+$/
    for (const title of titles) expect(title.trim(), '草稿节点标题是「镜头 N」').toMatch(labelOf)
  }, { surfaces: ['canvasViewport'] })
  await monitor.settle('收尾')
} catch (error) {
  harnessError = error
  console.error('[full-walk] pb10 故障：', error?.stack ?? error)
}
process.exit(await pb.finish(harnessError))
