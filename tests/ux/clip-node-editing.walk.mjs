// 真实用户任务：在画布剪辑节点内预览、剪辑、导入，并走完四条导出路径。
// 零模型额度：使用隔离项目和本地媒体；导出走真实 Electron/ffmpeg 链路。
// 用法：pnpm run build && node tests/ux/clip-node-editing.walk.mjs
import { launchNomiApp } from './_launchApp.mjs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(import.meta.url)
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const ffprobePath = require('@ffprobe-installer/ffprobe').path
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-clip-node-walk-'))
const settingsDir = path.join(root, 'settings')
const projectsDir = path.join(root, 'projects')
const projectId = 'clip-node-editing-walk'
const projectRoot = path.join(projectsDir, `clip-node-editing-${projectId}`)
const generatedAssetsDir = path.join(projectRoot, 'assets', 'generated')
const screenshots = {
  compact: path.join(os.tmpdir(), 'nomi-clip-node-compact.png'),
  preview: path.join(os.tmpdir(), 'nomi-clip-node-preview.png'),
  exportMenu: path.join(os.tmpdir(), 'nomi-clip-node-export-menu.png'),
  outputs: path.join(os.tmpdir(), 'nomi-clip-node-outputs.png'),
  imported: path.join(os.tmpdir(), 'nomi-clip-node-imported-video.png'),
}
fs.mkdirSync(path.join(projectRoot, '.nomi'), { recursive: true })
fs.mkdirSync(generatedAssetsDir, { recursive: true })
fs.copyFileSync(path.join(repoRoot, 'tests/ux/fixtures/test-upload.png'), path.join(generatedAssetsDir, 'fixture.png'))
const fixtureVideoPath = path.join(generatedAssetsDir, 'fixture.mp4')
const importedVideoPath = path.join(root, 'twelve-seconds-with-audio.mp4')
const encodeFixture = (output, duration) => execFileSync(ffmpegPath, [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=24:duration=${duration}`,
  '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${duration}`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart',
  output,
])
encodeFixture(fixtureVideoPath, 2)
encodeFixture(importedVideoPath, 12)

const imageUrl = `nomi-local://asset/${encodeURIComponent(projectId)}/assets/generated/fixture.png`
const videoUrl = `nomi-local://asset/${encodeURIComponent(projectId)}/assets/generated/fixture.mp4`
const imageNode = {
  id: 'canvas-image-source', kind: 'image', categoryId: 'shots', title: '画布图片',
  position: { x: 80, y: 100 }, exactPosition: true, size: { width: 260, height: 200 }, status: 'success',
  result: { id: 'canvas-image-source-result', type: 'image', url: imageUrl, createdAt: 1 },
}
const videoNode = {
  id: 'canvas-video-source', kind: 'video', categoryId: 'shots', title: '画布视频',
  position: { x: 80, y: 380 }, exactPosition: true, size: { width: 260, height: 200 }, status: 'success',
  result: { id: 'canvas-video-source-result', type: 'video', url: videoUrl, durationSeconds: 2, createdAt: 1 },
}
const seedClips = [
  { id: 'image-a', sourceNodeId: imageNode.id, type: 'image', label: '开场', url: imageUrl, durationSeconds: 2, trimStart: 0, trimEnd: 2 },
  { id: 'video-b', sourceNodeId: videoNode.id, type: 'video', label: '推进', url: videoUrl, durationSeconds: 2, trimStart: 0, trimEnd: 2 },
  { id: 'image-c', sourceNodeId: imageNode.id, type: 'image', label: '转场', url: imageUrl, durationSeconds: 2, trimStart: 0, trimEnd: 2 },
  { id: 'video-d', sourceNodeId: videoNode.id, type: 'video', label: '收束', url: videoUrl, durationSeconds: 2, trimStart: 0, trimEnd: 2 },
]
const clipNode = {
  id: 'canvas-clip-editor', kind: 'clip', categoryId: 'shots', title: '画布剪辑',
  position: { x: 450, y: 300 }, exactPosition: true, size: { width: 760, height: 140 }, status: 'idle',
  meta: { clip: { nodeRole: 'clip', sourceNodeIds: seedClips.map((clip) => clip.id), clips: seedClips } },
}
const generationCanvas = {
  nodes: [imageNode, videoNode, clipNode],
  edges: [
    { id: 'edge-image-clip', source: imageNode.id, target: clipNode.id, mode: 'reference', order: 0 },
    { id: 'edge-video-clip', source: videoNode.id, target: clipNode.id, mode: 'reference', order: 1 },
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
  await node.click({ position: { x: 20, y: 20 } })
  return node
}

async function runExport(scope, destination, expectedToast) {
  const menu = win.getByTestId('clip-node-export-menu')
  if (!(await menu.isVisible().catch(() => false))) await win.getByTestId('clip-node-export').click()
  await menu.getByRole('radio', { name: scope }).click()
  await menu.getByRole('button', { name: destination, exact: true }).click()
  await win.getByText(expectedToast, { exact: false }).waitFor({ state: 'visible', timeout: 120_000 })
}

async function closeApp() {
  await Promise.race([app.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 8000))])
  fs.rmSync(root, { recursive: true, force: true })
}

try {
  const clip = await openCanvas()
  const clips = clip.getByTestId('clip-node-clip')
  await win.waitForFunction(() => {
    const video = document.querySelector('[data-node-preview-video="true"]')
    return video instanceof HTMLVideoElement && video.readyState >= 2 && getComputedStyle(video).opacity !== '0'
  }, { timeout: 15_000 })
  await win.waitForTimeout(1200)

  const compactDefault = await clip.evaluate((element) => element.getAttribute('data-clip-mode') === 'compact')
    && (await clips.count()) === 4
    && (await win.getByTestId('clip-node-preview').count()) === 0
  const canvasVideoFrameReady = await win.locator('[data-node-preview-video="true"]').evaluate((video) => (
    video instanceof HTMLVideoElement && video.readyState >= 2 && getComputedStyle(video).opacity !== '0'
  ))
  const canvasVideoAudioEnabled = await win.locator('[data-node-preview-video="true"]').evaluate((video) => (
    video instanceof HTMLVideoElement && video.muted === false
  ))
  const canvasVideoNode = win.locator('[data-node-preview-video="true"]').locator('xpath=ancestor::*[@data-node-id][1]')
  await canvasVideoNode.hover()
  await win.waitForFunction(() => document.querySelector('[data-node-preview-video="true"]')?.muted === true)
  await clip.hover({ position: { x: 20, y: 20 } })
  await win.waitForFunction(() => document.querySelector('[data-node-preview-video="true"]')?.muted === false)
  const canvasVideoAudioRestoredAfterHover = await win.locator('[data-node-preview-video="true"]').evaluate((video) => (
    video instanceof HTMLVideoElement && video.muted === false
  ))
  const clipNodeIsWideEnough = (await clip.boundingBox())?.width >= 750
  const rulerBoxBeforeDrag = await clip.getByTestId('clip-node-ruler').boundingBox()
  const mediaLaneBox = await clip.getByTestId('clip-node-media-lane').boundingBox()
  const thirtySecondLabelBox = await clip.getByText('00:30', { exact: true }).boundingBox()
  const axisViewportBox = await clip.getByTestId('clip-node-axis-content').locator('..').boundingBox()
  const rulerDoesNotOverlapMedia = Boolean(rulerBoxBeforeDrag && mediaLaneBox && rulerBoxBeforeDrag.y + rulerBoxBeforeDrag.height <= mediaLaneBox.y)
  const thirtySecondHasTrailingSpace = Boolean(
    thirtySecondLabelBox
    && axisViewportBox
    && axisViewportBox.x + axisViewportBox.width - (thirtySecondLabelBox.x + thirtySecondLabelBox.width) >= 20,
  )
  const clipVideoThumbnailReady = await clip.locator('[data-clip-id="clip-video-b"]').evaluate((element) => (
    Array.from(element.children).some((child) => {
      if (child instanceof HTMLImageElement) return child.complete && child.naturalWidth > 0
      if (!(child instanceof HTMLElement) || child.dataset.clipFilmstrip !== 'true') return false
      const style = getComputedStyle(child)
      const sourceWidth = Number.parseFloat(style.backgroundSize)
      return style.backgroundImage !== 'none'
        && style.backgroundSize.endsWith('px 100%')
        && Number.isFinite(sourceWidth)
        && sourceWidth >= element.getBoundingClientRect().width - 1
    })
  ))
  await win.screenshot({ path: screenshots.compact })

  const nodeBeforeDrag = await clip.boundingBox()
  const dragHandleBox = await clip.getByTestId('clip-node-drag-handle').boundingBox()
  if (!nodeBeforeDrag || !dragHandleBox) throw new Error('找不到剪辑节点拖动区域')
  await win.mouse.move(dragHandleBox.x + dragHandleBox.width / 2, dragHandleBox.y + dragHandleBox.height / 2)
  await win.mouse.down()
  await win.mouse.move(dragHandleBox.x + dragHandleBox.width / 2 + 100, dragHandleBox.y + dragHandleBox.height / 2 + 60, { steps: 10 })
  await win.mouse.up()
  await win.waitForTimeout(300)
  const nodeAfterDrag = await clip.boundingBox()
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const nodeDragWorks = Boolean(
    nodeAfterDrag
    && nodeAfterDrag.x > nodeBeforeDrag.x + 60
    && nodeAfterDrag.y > nodeBeforeDrag.y + 30,
  )
  const nodeVisibleAfterDrag = Boolean(
    nodeAfterDrag
    && nodeAfterDrag.x < viewport.width
    && nodeAfterDrag.y < viewport.height
    && nodeAfterDrag.x + nodeAfterDrag.width > 0
    && nodeAfterDrag.y + nodeAfterDrag.height > 0,
  )

  const rulerBox = await clip.getByTestId('clip-node-ruler').boundingBox()
  if (!rulerBox) throw new Error('找不到剪辑轴标尺')
  await win.mouse.click(rulerBox.x + rulerBox.width * 0.38, rulerBox.y + rulerBox.height / 2)
  const preview = win.getByTestId('clip-node-preview')
  await preview.waitFor({ state: 'visible' })
  const nodeAfterPreview = await clip.boundingBox()
  const previewBox = await preview.boundingBox()
  const timelineClickOpensPreview = Boolean(previewBox)
  const nodeStaysPutWhenPreviewOpens = Boolean(
    nodeAfterDrag
    && nodeAfterPreview
    && Math.abs(nodeAfterPreview.x - nodeAfterDrag.x) < 2
    && Math.abs(nodeAfterPreview.y - nodeAfterDrag.y) < 2,
  )
  const previewDoesNotHideNode = Boolean(
    nodeAfterPreview
    && previewBox
    && (
      previewBox.y + previewBox.height <= nodeAfterPreview.y - 4
      || previewBox.y >= nodeAfterPreview.y + nodeAfterPreview.height + 4
    ),
  )
  const seek = preview.locator('input[type="range"]')
  const clickPositionsGlobalPlayhead = Number(await seek.inputValue()) > 0
  const noDuplicateEditingButtons = (await win.getByRole('button', { name: /分割片段|复制片段|移除片段/ }).count()) === 0
  const previewStartsMuted = await preview.evaluate((element) => (
    element.getAttribute('data-muted') === 'true' && element.querySelector('video')?.muted === true
  ))
  await preview.getByRole('button', { name: '取消静音' }).click()
  const previewCanUnmute = await preview.evaluate((element) => (
    element.getAttribute('data-muted') === 'false' && element.querySelector('video')?.muted === false
  ))
  const first = clips.first()
  const playbackStartBox = await first.boundingBox()
  if (!playbackStartBox) throw new Error('找不到播放起点片段')
  await first.click({ position: { x: playbackStartBox.width * 0.78, y: playbackStartBox.height / 2 } })
  const beforeCutClipId = await preview.getAttribute('data-active-clip-id')
  await preview.getByRole('button', { name: '播放预览' }).click()
  await win.waitForFunction((clipId) => document.querySelector('[data-testid="clip-node-preview"]')?.getAttribute('data-active-clip-id') !== clipId, beforeCutClipId, { timeout: 3000 })
  const afterCutClipId = await preview.getAttribute('data-active-clip-id')
  const playbackCrossesCuts = Boolean(beforeCutClipId && afterCutClipId && beforeCutClipId !== afterCutClipId)
  await preview.getByRole('button', { name: '暂停预览' }).click().catch(() => {})
  await win.screenshot({ path: screenshots.preview })

  await win.getByTestId('clip-node-export').click()
  const exportMenu = win.getByTestId('clip-node-export-menu')
  await exportMenu.waitFor({ state: 'visible' })
  const exportMenuBox = await exportMenu.boundingBox()
  const previewBeforeExportBox = await preview.boundingBox()
  const exportDoesNotOverlapPreview = Boolean(
    exportMenuBox
    && previewBeforeExportBox
    && (
      exportMenuBox.x + exportMenuBox.width <= previewBeforeExportBox.x
      || exportMenuBox.x >= previewBeforeExportBox.x + previewBeforeExportBox.width
      || exportMenuBox.y + exportMenuBox.height <= previewBeforeExportBox.y
      || exportMenuBox.y >= previewBeforeExportBox.y + previewBeforeExportBox.height
    ),
  )
  await win.screenshot({ path: screenshots.exportMenu })

  await runExport('完整成片', '到画布', '已向画布导出 1 个视频节点')
  const fullCanvasExport = (await win.locator('[data-kind="video"]').count()) === 2
  await runExport('完整成片', '下载', '已导出 1 个视频文件')
  const fullExportPath = fs.readdirSync(path.join(projectRoot, 'exports'))
    .map((name) => path.join(projectRoot, 'exports', name))
    .find((candidate) => candidate.endsWith('.mp4'))
  const exportKeepsAudio = Boolean(fullExportPath && execFileSync(ffprobePath, [
    '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', fullExportPath,
  ]).toString().trim())
  await runExport(/独立片段/, '到画布', '已向画布导出 4 个视频节点')
  const segmentCanvasExport = (await win.locator('[data-kind="video"]').count()) === 6
  await runExport(/独立片段/, '下载', '已导出 4 个视频文件')
  const outputEdges = win.locator('.generation-canvas-v2__edge[data-edge-id^="edge-canvas-clip-editor::"]')
  const fiveOutputEdges = (await outputEdges.count()) === 5
  const restingEdgesHaveNoLabels = (await win.locator('.generation-canvas-v2__edge-control').count()) === 0
  await preview.getByRole('button', { name: '关闭预览' }).click()
  const edgePoint = await outputEdges.locator('.generation-canvas-v2__edge-hit').evaluateAll((paths) => {
    for (const candidate of paths) {
      const path = candidate
      const length = path.getTotalLength()
      const matrix = path.getScreenCTM()
      if (!matrix) continue
      for (let index = 2; index <= 8; index += 1) {
        const local = path.getPointAtLength(length * index / 10)
        const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix)
        if (screen.x < 16 || screen.x > window.innerWidth - 16 || screen.y < 80 || screen.y > window.innerHeight - 16) continue
        if ((document.elementFromPoint(screen.x, screen.y))?.closest('.generation-canvas-v2__edge-hit') === path) {
          return { x: screen.x, y: screen.y }
        }
      }
    }
    return null
  })
  if (!edgePoint) throw new Error('找不到可见的输出连线点击位置')
  await win.mouse.click(edgePoint.x, edgePoint.y)
  await win.waitForTimeout(250)
  const clickingEdgeShowsNativeControl = (await win.locator('.generation-canvas-v2__edge-control[data-active="true"]').count()) === 1
  await win.screenshot({ path: screenshots.outputs, fullPage: true })

  const firstBox = await first.boundingBox()
  if (!firstBox) throw new Error('找不到首个片段')
  await first.click({ position: { x: firstBox.width * 0.5, y: firstBox.height / 2 } })
  const beforeSplit = await clips.count()
  await win.keyboard.press('s')
  await win.waitForTimeout(200)
  const keyboardSplit = (await clips.count()) === beforeSplit + 1
  await win.keyboard.press('Control+d')
  await win.waitForTimeout(200)
  const keyboardDuplicate = (await clips.count()) === beforeSplit + 2
  await win.keyboard.press('Delete')
  await win.waitForTimeout(200)
  const keyboardDelete = (await clips.count()) === beforeSplit + 1
  await win.keyboard.press('Control+z')
  await win.waitForTimeout(250)
  const keyboardUndo = (await clips.count()) === beforeSplit + 2
  await win.keyboard.press('Control+Shift+z')
  await win.waitForTimeout(250)
  const keyboardRedo = (await clips.count()) === beforeSplit + 1

  const movable = clip.locator('[data-clip-id="clip-video-d"]')
  await movable.scrollIntoViewIfNeeded()
  const movableId = await movable.getAttribute('data-clip-id')
  const movableBefore = await movable.boundingBox()
  if (!movableId || !movableBefore) throw new Error('找不到可拖动片段')
  await win.mouse.click(movableBefore.x + movableBefore.width / 2, movableBefore.y + movableBefore.height / 2)
  await win.mouse.move(movableBefore.x + movableBefore.width / 2, movableBefore.y + movableBefore.height / 2)
  await win.mouse.down()
  await win.mouse.move(movableBefore.x + movableBefore.width / 2 + 90, movableBefore.y + movableBefore.height / 2, { steps: 8 })
  await win.mouse.up()
  await win.waitForTimeout(250)
  const moved = clip.locator(`[data-clip-id="${movableId}"]`)
  const movedBox = await moved.boundingBox()
  const timelineDrag = Boolean(movedBox && movedBox.x > movableBefore.x + 20)
  const nudgeBefore = movedBox?.x ?? 0
  for (let index = 0; index < 8; index += 1) await win.keyboard.press('Shift+Period')
  await win.waitForTimeout(200)
  const nudgedBox = await moved.boundingBox()
  const keyboardNudge = Boolean(nudgedBox && nudgedBox.x > nudgeBefore + 2)
  const trimHandle = win.getByRole('button', { name: '调整片段出点', exact: true })
  const trimBefore = await moved.boundingBox()
  const handleBox = await trimHandle.boundingBox()
  if (!trimBefore || !handleBox) throw new Error('找不到片段裁剪把手')
  await win.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await win.mouse.down()
  await win.mouse.move(handleBox.x - 40, handleBox.y + handleBox.height / 2, { steps: 8 })
  await win.mouse.up()
  await win.waitForTimeout(200)
  const trimAfter = await moved.boundingBox()
  const trimWorks = Boolean(trimAfter && trimAfter.width < trimBefore.width - 4)

  const beforeImport = await clips.count()
  await clip.getByRole('button', { name: '添加素材', exact: true }).click()
  await win.getByTestId('asset-picker').waitFor({ state: 'visible' })
  await win.locator('input[type="file"]').last().setInputFiles(importedVideoPath)
  await win.waitForFunction((count) => document.querySelectorAll('[data-testid="clip-node-clip"]').length === count + 1, beforeImport, { timeout: 30_000 })
  const realImport = (await clips.count()) === beforeImport + 1 && (await win.getByRole('alert').count()) === 0
  const importedClip = clips.last()
  await importedClip.scrollIntoViewIfNeeded()
  const importedClipBox = await importedClip.boundingBox()
  const importUsesRealDuration = Boolean(importedClipBox && importedClipBox.width >= 220)
  await win.screenshot({ path: screenshots.imported })

  const result = {
    compactDefault,
    canvasVideoFrameReady,
    canvasVideoAudioEnabled,
    canvasVideoAudioRestoredAfterHover,
    clipNodeIsWideEnough,
    rulerDoesNotOverlapMedia,
    thirtySecondHasTrailingSpace,
    clipVideoThumbnailReady,
    nodeDragWorks,
    nodeVisibleAfterDrag,
    timelineClickOpensPreview,
    nodeStaysPutWhenPreviewOpens,
    previewDoesNotHideNode,
    exportDoesNotOverlapPreview,
    clickPositionsGlobalPlayhead,
    noDuplicateEditingButtons,
    previewStartsMuted,
    previewCanUnmute,
    playbackCrossesCuts,
    fullCanvasExport,
    exportKeepsAudio,
    segmentCanvasExport,
    fiveOutputEdges,
    restingEdgesHaveNoLabels,
    clickingEdgeShowsNativeControl,
    keyboardSplit,
    keyboardDuplicate,
    keyboardDelete,
    keyboardUndo,
    keyboardRedo,
    timelineDrag,
    keyboardNudge,
    trimWorks,
    realImport,
    importUsesRealDuration,
  }
  console.log(JSON.stringify({ result, screenshots }))
  await closeApp()
  process.exit(Object.values(result).every(Boolean) ? 0 : 1)
} catch (error) {
  console.error(error)
  await closeApp()
  process.exit(1)
}
