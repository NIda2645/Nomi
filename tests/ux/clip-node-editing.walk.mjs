// 真实用户任务：在画布内把已有图片/视频做成可编辑片段，再生成回画布。
// 零额度：使用隔离项目和本地图片/视频，不调用模型。
// 用法：pnpm run build && node tests/ux/clip-node-editing.walk.mjs
import { launchNomiApp } from './_launchApp.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-clip-node-walk-'))
const settingsDir = path.join(root, 'settings')
const projectsDir = path.join(root, 'projects')
const projectId = 'clip-node-editing-walk'
const projectRoot = path.join(projectsDir, `clip-node-editing-${projectId}`)
const generatedAssetsDir = path.join(projectRoot, 'assets', 'generated')
fs.mkdirSync(path.join(projectRoot, '.nomi'), { recursive: true })
fs.mkdirSync(generatedAssetsDir, { recursive: true })
fs.copyFileSync(path.join(repoRoot, 'tests/ux/fixtures/test-upload.png'), path.join(generatedAssetsDir, 'fixture.png'))
fs.copyFileSync(path.join(repoRoot, 'marketing/assets/video/hero-loop.mp4'), path.join(generatedAssetsDir, 'fixture.mp4'))

const imageUrl = `nomi-local://asset/${encodeURIComponent(projectId)}/assets/generated/fixture.png`
const videoUrl = `nomi-local://asset/${encodeURIComponent(projectId)}/assets/generated/fixture.mp4`
const imageNode = {
  id: 'canvas-image-source', kind: 'image', categoryId: 'shots', title: '画布图片',
  position: { x: 120, y: 160 }, exactPosition: true, size: { width: 320, height: 240 }, status: 'success',
  result: { id: 'canvas-image-source-result', type: 'image', url: imageUrl, createdAt: 1 },
}
const videoNode = {
  id: 'canvas-video-source', kind: 'video', categoryId: 'shots', title: '画布视频',
  position: { x: 120, y: 480 }, exactPosition: true, size: { width: 320, height: 240 }, status: 'success',
  result: { id: 'canvas-video-source-result', type: 'video', url: videoUrl, durationSeconds: 12, createdAt: 1 },
}
const clipNode = {
  id: 'canvas-clip-editor', kind: 'clip', categoryId: 'shots', title: '画布剪辑',
  position: { x: 620, y: 220 }, exactPosition: true, size: { width: 560, height: 520 }, status: 'idle',
  meta: { clip: { nodeRole: 'clip', sourceNodeIds: [], clips: [] } },
}
const generationCanvas = {
  nodes: [imageNode, videoNode, clipNode],
  edges: [
    { id: 'edge-image-clip', source: imageNode.id, target: clipNode.id },
    { id: 'edge-video-clip', source: videoNode.id, target: clipNode.id },
  ],
  selectedNodeIds: [], groups: [], canvasZoom: 1, canvasPan: { x: 0, y: 0 },
}
const payload = { workbenchDocument: null, timeline: null, generationCanvas, storyboardPlan: null, storyboardPlanCommitted: false }
const project = {
  id: projectId, name: '画布剪辑节点走查', version: 2, createdAt: 1, updatedAt: 1, savedAt: 1, revision: 1,
  lastKnownRootPath: projectRoot, ...payload, payload,
}
fs.writeFileSync(path.join(projectRoot, 'project.json'), JSON.stringify(project, null, 2))
fs.writeFileSync(path.join(projectRoot, '.nomi', 'project.json'), JSON.stringify(project, null, 2))

const launched = await launchNomiApp({ name: 'clip-node-editing', userDataDir: settingsDir, settingsDir, projectsDir, settleMs: 1200 })
const { app, win } = launched

async function dismissOnboarding() {
  await win.evaluate(() => {
    for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) localStorage.setItem(key, 'seen')
  })
  await win.keyboard.press('Escape').catch(() => {})
  for (let index = 0; index < 4; index += 1) {
    const skip = win.locator('button,[role="button"],a', { hasText: /跳过|完成|知道了|开始创作/ }).first()
    if ((await skip.count()) > 0) await skip.click({ timeout: 800 }).catch(() => {})
  }
}

async function openCanvas() {
  await dismissOnboarding()
  await win.reload()
  await win.waitForTimeout(1000)
  const projectCard = win.locator('[data-project-card]', { hasText: '画布剪辑节点走查' }).first()
  if (await projectCard.isVisible().catch(() => false)) {
    await projectCard.hover()
    const continueButton = projectCard.getByText('继续创作', { exact: false }).first()
    if ((await continueButton.count()) > 0) await continueButton.click()
    else await projectCard.dblclick()
  }
  await win.getByRole('button', { name: '生成', exact: true }).first().click().catch(() => {})
  const node = win.locator('[data-clip-node="true"]')
  await node.waitFor({ state: 'visible', timeout: 8000 })
  return node
}

async function closeApp() {
  await Promise.race([app.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 8000))])
  fs.rmSync(root, { recursive: true, force: true })
}

try {
  const clip = await openCanvas()
  const clips = clip.getByTestId('clip-node-clip')
  await win.waitForTimeout(900)
  const importedTwoMedia = (await clips.count()) === 2
  const countLabel = await clip.innerText()
  const countIsClear = countLabel.includes('共 2 个片段')
  const compactAxis = await clip.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return rect.height <= 180 && element.getAttribute('data-clip-mode') === 'compact'
  })

  await clips.first().click()
  const duplicate = clip.getByRole('button', { name: '复制片段', exact: true })
  const remove = clip.getByRole('button', { name: '移除片段', exact: true })
  const trimHandleVisible = await clip.getByRole('button', { name: '调整片段出点', exact: true }).isVisible()
  const selectionEnablesEditing = await duplicate.isEnabled() && await remove.isEnabled() && trimHandleVisible

  await clip.getByRole('button', { name: '分割片段', exact: true }).click()
  const firstBox = await clips.first().boundingBox()
  if (!firstBox) throw new Error('找不到第一段片段的可交互区域')
  await win.mouse.click(firstBox.x + firstBox.width * 0.6, firstBox.y + firstBox.height / 2)
  await win.waitForTimeout(300)
  const splitCreatedNewSegment = (await clips.count()) === 3

  await clips.last().click()
  if (!(await remove.isEnabled())) throw new Error('分割后选中片段没有启用移除操作')
  await remove.click()
  await win.waitForTimeout(1000)
  const removeCompactedTimeline = (await clips.count()) === 2

  await clips.first().click()
  const exportButton = clip.getByRole('button', { name: '导出', exact: true })
  await exportButton.click()
  const createVideo = win.getByRole('button', { name: /^生成视频节点/ })
  const outputActionVisible = (await createVideo.count()) > 0
  await win.screenshot({ path: path.join(os.tmpdir(), 'nomi-clip-node-editing.png') })

  const result = { importedTwoMedia, countIsClear, compactAxis, selectionEnablesEditing, splitCreatedNewSegment, removeCompactedTimeline, outputActionVisible }
  console.log(JSON.stringify(result))
  await closeApp()
  process.exit(Object.values(result).every(Boolean) ? 0 : 1)
} catch (error) {
  console.error(error)
  await closeApp()
  process.exit(1)
}
