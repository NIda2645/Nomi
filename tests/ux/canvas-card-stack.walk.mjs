// 真实用户任务：多版本结果卡组 + 收起编组 + 重开持久化。
// 零模型额度；使用隔离项目与本地 SVG/MP4。先 pnpm build，再 node 本文件。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launchNomiApp } from './_launchApp.mjs'
import {
  applyColorSchemeForShot,
  clickOrFail,
  expect,
  expectAbsent,
  expectCount,
  expectHidden,
  expectVisible,
  proveProbe,
  screenshotSettled,
} from './_assert.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-card-stack-walk-'))
const settingsDir = path.join(root, 'settings')
const projectsDir = path.join(root, 'projects')
const projectId = 'canvas-card-stack-walk'
const projectRoot = path.join(projectsDir, projectId)
const outputDir = path.resolve('outputs/canvas-card-stack-20260827')
fs.mkdirSync(path.join(projectRoot, '.nomi'), { recursive: true })
fs.mkdirSync(path.join(projectRoot, 'assets', 'generated'), { recursive: true })
fs.mkdirSync(outputDir, { recursive: true })

const imageSvg = (label, start, end) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
  <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs>
  <rect width="800" height="800" rx="60" fill="url(#g)"/><circle cx="610" cy="190" r="96" fill="#fff" opacity=".22"/>
  <path d="M0 610L180 360l160 180 140-210 320 360v110H0z" fill="#141820" opacity=".72"/>
  <text x="54" y="96" fill="white" font-size="42" font-family="sans-serif" font-weight="700">${label}</text>
</svg>`

for (const [name, label, start, end] of [
  ['rain-1.svg', '雨夜 · 01', '#d69072', '#34465f'],
  ['rain-2.svg', '雨夜 · 02', '#9b7fd1', '#273752'],
  ['rain-3.svg', '雨夜 · 03', '#ef8a64', '#39405d'],
  ['character.svg', '角色参考', '#55a5a5', '#293b4d'],
  ['scene.svg', '场景参考', '#c89b63', '#4b3c42'],
  ['style.svg', '风格参考', '#7f77c9', '#323247'],
]) fs.writeFileSync(path.join(projectRoot, 'assets', 'generated', name), imageSvg(label, start, end))
fs.copyFileSync(path.resolve('marketing/assets/demo.mp4'), path.join(projectRoot, 'assets', 'generated', 'demo.mp4'))

const assetUrl = (name) => `nomi-local://asset/${encodeURIComponent(projectId)}/assets/generated/${name}`
const imageResult = (id, name, createdAt) => ({ id, type: 'image', url: assetUrl(name), thumbnailUrl: assetUrl(name), createdAt })
const videoResult = (id, createdAt, thumbnail) => ({ id, type: 'video', url: assetUrl('demo.mp4'), thumbnailUrl: assetUrl(thumbnail), createdAt })
const nodes = [
  {
    id: 'image-versions', kind: 'image', categoryId: 'shots', title: '雨夜入场', prompt: '人物走进雨夜咖啡馆',
    position: { x: 140, y: 120 }, size: { width: 260, height: 260 }, status: 'success',
    result: imageResult('image-v3', 'rain-3.svg', 3),
    history: [imageResult('image-v3', 'rain-3.svg', 3), imageResult('image-v2', 'rain-2.svg', 2), imageResult('image-v1', 'rain-1.svg', 1)],
  },
  {
    id: 'video-versions', kind: 'video', categoryId: 'shots', title: '推镜进入咖啡馆', prompt: '缓慢推进',
    position: { x: 760, y: 120 }, size: { width: 300, height: 260 }, status: 'success',
    result: videoResult('video-v2', 2, 'rain-2.svg'),
    history: [videoResult('video-v2', 2, 'rain-2.svg'), videoResult('video-v1', 1, 'rain-1.svg')],
  },
  {
    id: 'group-character', kind: 'image', categoryId: 'shots', title: '角色参考', groupId: 'reference-group',
    position: { x: 180, y: 480 }, size: { width: 220, height: 220 }, status: 'success', result: imageResult('character', 'character.svg', 1), history: [],
  },
  {
    id: 'group-scene', kind: 'image', categoryId: 'shots', title: '场景参考', groupId: 'reference-group',
    position: { x: 460, y: 480 }, size: { width: 220, height: 220 }, status: 'success', result: imageResult('scene', 'scene.svg', 1), history: [],
  },
  {
    id: 'group-style', kind: 'image', categoryId: 'shots', title: '风格参考', groupId: 'reference-group',
    position: { x: 740, y: 480 }, size: { width: 220, height: 220 }, status: 'success', result: imageResult('style', 'style.svg', 1), history: [],
  },
]
const edges = [
  { id: 'group-input-character', source: 'image-versions', target: 'group-character', mode: 'reference', order: 0, viaGroupId: 'reference-group' },
  { id: 'group-input-scene', source: 'image-versions', target: 'group-scene', mode: 'style_ref', order: 1, viaGroupId: 'reference-group' },
  { id: 'group-input-style', source: 'image-versions', target: 'group-style', mode: 'reference', order: 2, viaGroupId: 'reference-group' },
  { id: 'group-internal', source: 'group-character', target: 'group-scene', mode: 'reference', order: 0 },
]
const groups = [{
  id: 'reference-group', name: '雨夜参考组', categoryId: 'shots', nodeIds: ['group-character', 'group-scene', 'group-style'],
  color: '#746ce8', collapsed: false, inputLinks: [{ sourceNodeId: 'image-versions' }], createdAt: 1, updatedAt: 1,
}]
const generationCanvas = { nodes, edges, groups, selectedNodeIds: [], canvasZoom: 0.86, canvasPan: { x: 30, y: 10 } }
const payload = { workbenchDocument: null, timeline: null, generationCanvas, storyboardPlan: null, storyboardPlanCommitted: false }
const project = {
  id: projectId, name: '卡片堆叠体验验收', version: 2, createdAt: 1, updatedAt: 1, savedAt: 1, revision: 1,
  lastKnownRootPath: projectRoot, workbenchDocument: null, timeline: null, generationCanvas, payload,
}
for (const target of [path.join(projectRoot, 'project.json'), path.join(projectRoot, '.nomi', 'project.json')]) {
  fs.writeFileSync(target, JSON.stringify(project, null, 2))
}

const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail })
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`)
}

const launched = await launchNomiApp({ name: 'canvas-card-stack', settingsDir, projectsDir, settleMs: 1000 })
const { win } = launched

async function dismissOnboarding() {
  await win.evaluate(() => {
    for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) localStorage.setItem(key, 'seen')
  })
  await win.keyboard.press('Escape').catch(() => undefined)
}

async function openCanvas() {
  await dismissOnboarding()
  await win.reload()
  await win.waitForTimeout(800)
  const projectCard = win.locator('[data-project-card]', { hasText: '卡片堆叠体验验收' }).first()
  if (await projectCard.isVisible().catch(() => false)) {
    await projectCard.hover()
    const continueButton = projectCard.getByText('继续创作', { exact: false }).first()
    if (await continueButton.count()) await continueButton.click()
    else await projectCard.dblclick()
    await win.waitForTimeout(1200)
  }
  const generationButton = win.getByRole('button', { name: '生成', exact: true }).first()
  if (await generationButton.isVisible().catch(() => false)) await generationButton.click()
  await win.locator('[data-node-id="image-versions"]').waitFor({ state: 'visible', timeout: 10_000 })
}

try {
  await openCanvas()
  const imageNode = win.locator('[data-node-id="image-versions"]')
  const videoNode = win.locator('[data-node-id="video-versions"]')
  const groupMembers = win.locator('[data-node-id="group-character"], [data-node-id="group-scene"], [data-node-id="group-style"]')
  await imageNode.locator('[data-node-media-state="ready"]').waitFor({ state: 'attached', timeout: 10_000 })
  await expectCount(groupMembers, 3, '展开的雨夜参考组应显示三个成员节点')
  const groupMembersProof = await proveProbe(groupMembers, '展开编组里的成员节点可被同一 data-node-id 探针找到')
  check('图片版本卡角可见', await imageNode.getByRole('button', { name: '3 版' }).isVisible())
  check('视频版本卡角可见', await videoNode.getByRole('button', { name: '2 版' }).isVisible())
  check('图片卡角最多两层', await imageNode.locator('[data-card-stack-rear]').count() === 2)
  check('视频两版只有一层后卡', await videoNode.locator('[data-card-stack-rear]').count() === 1)
  await screenshotSettled(win, { path: path.join(outputDir, '01-real-version-stacks-light.png') })

  await imageNode.getByRole('button', { name: '3 版' }).click()
  const tray = imageNode.locator('[data-node-result-stack="image-versions"]')
  await tray.waitFor({ state: 'visible' })
  const beforeOrder = await tray.locator('[data-result-stack-item]').evaluateAll((items) => items.map((item) => item.getAttribute('data-result-stack-item')))
  check('托盘列出三版', beforeOrder.join(',') === 'image-v3,image-v2,image-v1', beforeOrder.join(','))
  await screenshotSettled(win, { path: path.join(outputDir, '02-real-version-tray-light.png') })
  await tray.locator('[data-result-stack-item="image-v1"] button').first().click()
  const afterOrder = await tray.locator('[data-result-stack-item]').evaluateAll((items) => items.map((item) => item.getAttribute('data-result-stack-item')))
  check('切换当前版不重排历史', afterOrder.join(',') === beforeOrder.join(','), afterOrder.join(','))
  check('第一版成为当前', await tray.locator('[data-result-stack-item="image-v1"]').getAttribute('data-current') === 'true')

  await clickOrFail(imageNode.getByRole('button', { name: '3 版' }), '关闭结果版本托盘')
  await expectHidden(tray, '结果版本托盘应完成退场')
  const nodeCountBeforeDuplicate = await win.locator('[data-node-id]').count()
  await imageNode.click({ position: { x: 120, y: 120 } })
  await clickOrFail(imageNode.getByRole('button', { name: '复制为变体' }), '复制当前节点为无结果的新变体')
  await expect.poll(() => win.locator('[data-node-id]').count(), { message: '复制变体应新增一个节点' }).toBe(nodeCountBeforeDuplicate + 1)
  check('复制变体新增一个节点', true)
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect.poll(() => win.locator('[data-node-id]').count(), { message: '撤销应同时移除复制节点和继承连线' }).toBe(nodeCountBeforeDuplicate)
  check('复制变体可一次撤销', true)

  await videoNode.getByRole('button', { name: '2 版' }).click()
  const videoTray = videoNode.locator('[data-node-result-stack="video-versions"]')
  const videoHistoryRow = videoTray.locator('[data-result-stack-item="video-v1"]')
  await videoHistoryRow.hover()
  const videoProgress = videoHistoryRow.getByRole('slider', { name: '视频进度' })
  await expect.poll(async () => Number(await videoProgress.getAttribute('aria-valuemax')), { message: '历史视频应加载可拖动时长' }).toBeGreaterThan(0)
  const progressBox = await videoProgress.boundingBox()
  check('历史视频进度条可见', Boolean(progressBox))
  if (!progressBox) throw new Error('历史视频进度条没有可交互边界')
  await win.mouse.move(progressBox.x + progressBox.width * 0.2, progressBox.y + progressBox.height / 2)
  await win.mouse.down()
  await win.mouse.move(progressBox.x + progressBox.width * 0.75, progressBox.y + progressBox.height / 2, { steps: 5 })
  await win.mouse.up()
  const draggedTime = Number(await videoProgress.getAttribute('aria-valuenow'))
  check('拖动进度条连续跳转', draggedTime > 0, String(draggedTime))
  await videoProgress.press('ArrowLeft')
  const nudgedTime = Number(await videoProgress.getAttribute('aria-valuenow'))
  check('键盘左键精确回退一秒', Math.abs(nudgedTime - Math.max(0, draggedTime - 1)) < 0.2, `${draggedTime} -> ${nudgedTime}`)
  await screenshotSettled(win, { path: path.join(outputDir, '03-real-video-history-scrub-light.png') })
  await videoNode.getByRole('button', { name: '2 版' }).click()
  await expectHidden(videoTray, '视频版本托盘应完成退场')

  const collapse = win.getByRole('button', { name: '收起分组「雨夜参考组」' })
  await collapse.scrollIntoViewIfNeeded()
  await clickOrFail(collapse, '把雨夜参考组收成节点卡组')
  const collapsed = win.locator('[data-collapsed-group-id="reference-group"]')
  await expectVisible(collapsed, '收起后应显示一张编组卡')
  await expectCount(collapsed, 1, '收起后只保留一张编组卡')
  check('收起后只剩一个组卡', true)
  await expectAbsent(groupMembers, { provenBy: groupMembersProof, message: '收起后组内三个成员节点不再各自占画布' })
  check('三位成员已从画布投影隐藏', true)
  check('编组显示节点语义', await collapsed.getByRole('button', { name: '3 节点' }).isVisible())
  check('三条成员输入聚合为一条编组线', await win.locator('g[data-aggregate-group="reference-group"]').count() === 1)
  const aggregateHit = win.locator('g[data-aggregate-group="reference-group"] path[role="button"]')
  await clickOrFail(aggregateHit, '选中聚合后的编组输入线')
  await expectVisible(win.getByText('编组输入', { exact: true }), '聚合线应显示编组关系而不是伪造成员模式')
  await screenshotSettled(win, { path: path.join(outputDir, '04-real-collapsed-group-link-light.png') })

  await clickOrFail(collapsed.getByRole('button', { name: '3 节点' }), '展开雨夜参考组')
  await expectVisible(win.locator('[data-node-id="group-character"]'), '点击卡角后应恢复组内节点')
  check('点击卡角恢复组内节点', await win.locator('[data-node-id="group-character"]').isVisible())
  check('展开后恢复三条真实成员输入线', await win.locator('g[data-edge-id^="group-input-"]').count() === 3)

  await clickOrFail(collapse, '再次收起雨夜参考组')
  await expectVisible(collapsed, '再次收起后应恢复编组卡')
  await applyColorSchemeForShot(win, 'dark')
  await screenshotSettled(win, { path: path.join(outputDir, '05-real-collapsed-group-dark.png') })

  await clickOrFail(win.locator('g[data-aggregate-group="reference-group"] path[role="button"]'), '重新选中编组输入线')
  await clickOrFail(win.getByRole('button', { name: '断开整条编组连接' }), '一次断开完整编组关系')
  await expectAbsent(win.locator('g[data-aggregate-group="reference-group"]'), {
    provenBy: await proveProbe(collapsed, '断开后编组卡仍存在'),
    message: '断开聚合线后不应残留成员关系线',
  })
  check('聚合线一次断开整组关系', true)

  await expect.poll(() => {
    const current = JSON.parse(fs.readFileSync(path.join(projectRoot, '.nomi', 'project.json'), 'utf8'))
    return current.payload.generationCanvas.groups.find((entry) => entry.id === 'reference-group')?.collapsed
  }, { message: '收起状态应持久化到项目文件' }).toBe(true)
  const persisted = JSON.parse(fs.readFileSync(path.join(projectRoot, '.nomi', 'project.json'), 'utf8'))
  const persistedGroup = persisted.payload.generationCanvas.groups.find((entry) => entry.id === 'reference-group')
  check('收起状态写入项目', persistedGroup?.collapsed === true)
  check('断开的编组声明不再持久化', !persistedGroup?.inputLinks?.length)
  fs.writeFileSync(path.join(outputDir, 'walk-report.json'), JSON.stringify({ checks, projectRoot }, null, 2))
  console.log(JSON.stringify({ ok: true, checks }, null, 2))
} finally {
  await launched.close().catch(() => undefined)
}
