import React from 'react'
import type { GenerationCanvasNode, GenerationNodeResult } from '../model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { persistNodeImageBlob } from '../adapters/persistNodeImage'
import type { CropGridResult, CropGridSize } from './render/ImageCropGridOverlay'
import { computeGridCells, type GridCell } from './render/cropGridGeometry'
import { removeBackgroundBlob } from '../../../lib/removeBackground'
import { IMAGE_EDIT_PHASE, REMOVE_BACKGROUND_PHASE } from './localImageOpPhase'
import i18n from '../../../i18n'

// 裁切 / 旋转 / 网格切分统一产 PNG **Blob**，落盘换 nomi-local:// 之后才写 store。
//
// 根因笔记（2026-08-20「九宫格直接卡死」，取证见 docs/plan/2026-08-20-grid-split-freeze.md）：
// 旧管线每个 cell 都 new Image() 重新解码整张源图、再 canvas.toDataURL 同步编码成 base64，
// 9 段 base64 先塞进 store 再逐个落盘替换 —— 主线程连冻 1.6s（9 次同步 PNG 编码就占 700ms），
// 且 1+9 次 updateNode 每次都被 emitCanvasGesture 做 JSON 深拷贝，共 60MB 走一遍 JSON。
// 现在三件事都堵在源头：源图只解码一次；裁剪+编码交给 createImageBitmap/convertToBlob（不占主线程）；
// store 只收门牌号、只写一次。落盘失败才退回 base64 兜底（可持久化、不丢图）。
const PNG_TYPE = 'image/png'

type EditedTile = { blob: Blob; width: number; height: number }

/** 源图解码一次，所有 cell 共用这一张位图（旧管线是每格重解一次整图）。 */
async function decodeSourceBitmap(url: string): Promise<ImageBitmap> {
  return createImageBitmap(await loadImageForCanvas(url))
}

/** OffscreenCanvas → PNG Blob。convertToBlob 是异步的，编码不占主线程（toDataURL 是同步的，占）。 */
async function canvasToPngBlob(canvas: OffscreenCanvas, width: number, height: number): Promise<EditedTile | null> {
  const blob = await canvas.convertToBlob({ type: PNG_TYPE })
  return blob ? { blob, width, height } : null
}

/** 从已解码的源位图上裁一格（归一化坐标 → 像素）。 */
async function cropBitmapRegion(source: ImageBitmap, rect: { x: number; y: number; w: number; h: number }): Promise<EditedTile | null> {
  const sx = clampNumber(Math.round(rect.x * source.width), 0, source.width - 1)
  const sy = clampNumber(Math.round(rect.y * source.height), 0, source.height - 1)
  const sw = clampNumber(Math.round(rect.w * source.width), 1, source.width - sx)
  const sh = clampNumber(Math.round(rect.h * source.height), 1, source.height - sy)
  const canvas = new OffscreenCanvas(sw, sh)
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvasToPngBlob(canvas, sw, sh)
}

/** 旋转 / 翻转：同一条 Blob 管线（不留第二个 base64 入口）。 */
async function transformBitmap(source: ImageBitmap, op: ImageTransformOp): Promise<EditedTile | null> {
  const rotated = op === 'rotate-left' || op === 'rotate-right'
  const width = rotated ? source.height : source.width
  const height = rotated ? source.width : source.height
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) return null
  if (rotated) {
    context.translate(width / 2, height / 2)
    context.rotate(op === 'rotate-right' ? Math.PI / 2 : -Math.PI / 2)
    context.drawImage(source, -source.width / 2, -source.height / 2)
  } else if (op === 'flip-h') {
    context.translate(source.width, 0)
    context.scale(-1, 1)
    context.drawImage(source, 0, 0)
  } else {
    context.translate(0, source.height)
    context.scale(1, -1)
    context.drawImage(source, 0, 0)
  }
  return canvasToPngBlob(canvas, width, height)
}


function mergeNodeImageHistory(
  currentResult: GenerationNodeResult | undefined,
  currentHistory: GenerationNodeResult[] | undefined,
  newResults: GenerationNodeResult[],
): GenerationNodeResult[] {
  const merged: GenerationNodeResult[] = []
  const seen = new Set<string>()
  const add = (result: GenerationNodeResult | undefined) => {
    if (!result) return
    const key = result.id || result.url || result.thumbnailUrl || result.text || ''
    if (!key || seen.has(key)) return
    seen.add(key)
    merged.push(result)
  }
  newResults.forEach(add)
  add(currentResult)
  ;(currentHistory || []).forEach(add)
  return merged
}

// 图片本地编辑（切图 / 裁剪 / 旋转翻转）从 BaseGenerationNode 抽出（A1.5 接缝）。
// 图片类与素材类节点都复用这一处；以后新增图片编辑功能只动这里 + NodeImageEditToolbar，
// 不碰壳、不碰生成逻辑。编辑产物统一写回当前节点历史堆叠，并切为主图。

// 切图入口仍是「四视图(2) / 九宫格(3)」两档；裁剪是 1 档。统一由可调框处理（见 CropGridSize）。
export type ImageGridSize = 2 | 3
export type ImageTransformOp = 'rotate-left' | 'rotate-right' | 'flip-h' | 'flip-v'

// 这几个布局上下界与壳里 resize 用的同名常量保持一致（壳负责 resize，这里负责编辑后主图尺寸）。
const MIN_NODE_WIDTH = 240
const MAX_NODE_WIDTH = 680

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function removeBackgroundProgressMessage(key: string): string {
  if (key.includes('decode')) return '读取图片中'
  if (key.includes('inference')) return '识别主体中'
  if (key.includes('mask')) return '生成透明遮罩'
  if (key.includes('encode')) return '导出透明 PNG'
  if (key.includes('model')) return '加载抠图模型'
  return '抠图中'
}

function imageGridTileNodeSize(
  width: number,
  height: number,
  preferredWidth: number,
): { width: number; height: number; previewHeight: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const aspectRatio = width / height
  const nodeWidth = clampNumber(preferredWidth, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
  const previewHeight = Math.max(1, Math.round(nodeWidth / aspectRatio))
  return { width: nodeWidth, height: previewHeight, previewHeight }
}

function loadImageForCanvas(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image.'))
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      image.crossOrigin = 'anonymous'
    }
    image.src = url
  })
}

export type NodeImageEditing = {
  /** 当前打开的可调框：null=未开，1=裁剪，2/3=切图（四视图/九宫格）。 */
  editGrid: CropGridSize | null
  openEdit: (gridSize: CropGridSize) => void
  cancelEdit: () => void
  imageOpBusy: boolean
  handleEditConfirm: (result: CropGridResult) => Promise<void>
  handleImageTransform: (op: ImageTransformOp) => Promise<void>
  handleRemoveBackground: () => Promise<void>
}

export function useNodeImageEditing(
  node: GenerationCanvasNode,
  visualSize: { width: number; height: number },
): NodeImageEditing {
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const [editGrid, setEditGrid] = React.useState<CropGridSize | null>(null)
  const [imageOpBusy, setImageOpBusy] = React.useState(false)
  const openEdit = React.useCallback((gridSize: CropGridSize) => setEditGrid(gridSize), [])
  const cancelEdit = React.useCallback(() => setEditGrid(null), [])

  const visualWidth = visualSize.width
  const nodeId = node.id
  const nodeResult = node.result
  const nodeHistory = node.history
  const nodeMeta = node.meta
  const nodeStatus = node.status

  // 裁剪 / 切图统一走可调框确认：computeGridCells 把「外框 + 框内线」换算成 N 个 image 归一化
  // cell；逐格裁出 PNG Blob → 落盘换 nomi-local:// → **一次**写回节点 history。
  // 1 cell = 裁剪；N cell = 切图堆叠。逐格 await 是有意的：让出主线程，切图期间画布仍可拖可点。
  const handleEditConfirm = React.useCallback(
    async (confirmed: CropGridResult) => {
      const imageUrl = nodeResult?.type === 'image' ? nodeResult.url : undefined
      const grid = editGrid
      cancelEdit()
      if (!imageUrl || grid == null || imageOpBusy) return
      setImageOpBusy(true)
      const cells = computeGridCells(confirmed.rect, confirmed.cols, confirmed.rows)
      const isSplit = cells.length > 1
      const createdAt = Date.now()
      const previousStatus = nodeStatus || 'success'
      // 进度反馈走节点既有的 running + progress（与抠图同一套：图保留、加模糊呼吸），不新造 UI。
      // persist:false —— 这是转瞬即逝的中间态，不该把项目标脏触发存盘。
      const reportProgress = (done: number) =>
        updateNode(
          nodeId,
          {
            status: 'running',
            progress: {
              runId: `image-edit-${nodeId}-${createdAt}`,
              taskKind: 'asset',
              phase: IMAGE_EDIT_PHASE,
              message: i18n.t(isSplit ? 'generationCommon.imageToolbar.splitting' : 'generationCommon.imageToolbar.cropping'),
              percent: Math.round((done / cells.length) * 100),
              updatedAt: Date.now(),
            },
          },
          { persist: false },
        )
      try {
        reportProgress(0)
        const source = await decodeSourceBitmap(imageUrl)
        const tiles: { cell: GridCell; index: number; tile: EditedTile }[] = []
        try {
          for (const [index, cell] of cells.entries()) {
            const tile = await cropBitmapRegion(source, cell)
            if (tile) tiles.push({ cell, index, tile })
            reportProgress(index + 1)
          }
        } finally {
          source.close()
        }
        const outputs = await Promise.all(
          tiles.map(async ({ cell, index, tile }) => {
            const stored = await persistNodeImageBlob(tile.blob, nodeId, `edit-${nodeId}-${createdAt}-${index}.png`)
            const result: GenerationNodeResult = {
              id: `image-${isSplit ? 'split' : 'crop'}-${nodeId}-${createdAt}-${index}`,
              type: 'image' as const,
              url: stored.url,
              createdAt,
            }
            return { cell, tile, result, localOnly: stored.localOnly }
          }),
        )
        const main = outputs[0]
        if (!main) throw new Error('image edit produced no tile')
        const preferredWidth = clampNumber(visualWidth, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
        const newSize = imageGridTileNodeSize(main.tile.width, main.tile.height, preferredWidth)
        updateNode(nodeId, {
          result: main.result,
          history: mergeNodeImageHistory(nodeResult, nodeHistory, outputs.map((entry) => entry.result)),
          status: 'success',
          error: undefined,
          progress: undefined,
          ...(newSize && nodeMeta?.userResized !== true
            ? { size: { width: newSize.width, height: newSize.height } }
            : {}),
          meta: {
            ...(nodeMeta || {}),
            source: isSplit ? `image-grid-split-${grid}x${grid}` : 'image-crop',
            localOnly: main.localOnly,
            ...(main.localOnly ? {} : { uploadStatus: 'uploaded' as const }),
            ...(isSplit ? { gridSize: grid, gridRow: main.cell.row, gridColumn: main.cell.column } : {}),
            imageWidth: main.tile.width,
            imageHeight: main.tile.height,
            imageAspectRatio: main.tile.width / Math.max(1, main.tile.height),
            previewHeight: newSize?.previewHeight,
          },
        })
      } catch {
        // 源图读不进画布（CORS/解码失败）时别再静默——用户点了确认什么都没发生，看起来就是「卡死」。
        updateNode(nodeId, { status: previousStatus, progress: undefined })
        const { toast } = await import('../../../ui/toast')
        toast(i18n.t('generationCommon.imageToolbar.editFailed'), 'error')
      } finally {
        setImageOpBusy(false)
      }
    },
    [cancelEdit, editGrid, imageOpBusy, nodeHistory, nodeId, nodeMeta, nodeResult, nodeStatus, updateNode, visualWidth],
  )

  // 旋转 / 翻转：写回当前节点历史堆叠，并切换为当前主图。
  const handleImageTransform = React.useCallback(
    async (op: ImageTransformOp) => {
      const imageUrl = nodeResult?.type === 'image' ? nodeResult.url : undefined
      if (!imageUrl || imageOpBusy) return
      setImageOpBusy(true)
      const createdAt = Date.now()
      try {
        const source = await decodeSourceBitmap(imageUrl)
        let out: EditedTile | null = null
        try {
          out = await transformBitmap(source, op)
        } finally {
          source.close()
        }
        if (!out) throw new Error('image transform produced no tile')
        const stored = await persistNodeImageBlob(out.blob, nodeId, `edit-${nodeId}-${createdAt}-${op}.png`)
        const preferredWidth = clampNumber(visualWidth, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
        const newSize = imageGridTileNodeSize(out.width, out.height, preferredWidth)
        const result: GenerationNodeResult = {
          id: `image-${op}-${nodeId}-${createdAt}`,
          type: 'image' as const,
          url: stored.url,
          createdAt,
        }
        updateNode(nodeId, {
          result,
          history: mergeNodeImageHistory(nodeResult, nodeHistory, [result]),
          status: 'success',
          error: undefined,
          ...(newSize && nodeMeta?.userResized !== true
            ? { size: { width: newSize.width, height: newSize.height } }
            : {}),
          meta: {
            ...(nodeMeta || {}),
            source: `image-${op}`,
            localOnly: stored.localOnly,
            ...(stored.localOnly ? {} : { uploadStatus: 'uploaded' as const }),
            imageWidth: out.width,
            imageHeight: out.height,
            imageAspectRatio: out.width / Math.max(1, out.height),
            previewHeight: newSize?.previewHeight,
          },
        })
      } catch {
        const { toast } = await import('../../../ui/toast')
        toast(i18n.t('generationCommon.imageToolbar.editFailed'), 'error')
      } finally {
        setImageOpBusy(false)
      }
    },
    [imageOpBusy, nodeHistory, nodeId, nodeMeta, nodeResult, updateNode, visualWidth],
  )

  const handleRemoveBackground = React.useCallback(async () => {
    const imageUrl = nodeResult?.type === 'image' ? nodeResult.url : undefined
    if (!imageUrl || imageOpBusy) return
    setImageOpBusy(true)
    const createdAt = Date.now()
    const previousStatus = nodeStatus || 'success'
    updateNode(nodeId, {
      status: 'running',
      progress: {
        runId: `remove-bg-${nodeId}-${createdAt}`,
        taskKind: 'asset',
        phase: REMOVE_BACKGROUND_PHASE,
      message: i18n.t('generationCommon.imageToolbar.removingBackground'),
        percent: 0,
        updatedAt: createdAt,
      },
      meta: {
        ...(nodeMeta || {}),
        removeBackgroundSource: imageUrl,
      },
    })
    try {
      const blob = await removeBackgroundBlob(imageUrl, ({ key, current, total }) => {
        const percent = total > 0 ? Math.round((current / total) * 100) : undefined
        updateNode(
          nodeId,
          {
            progress: {
              runId: `remove-bg-${nodeId}-${createdAt}`,
              taskKind: 'asset',
              phase: REMOVE_BACKGROUND_PHASE,
              message: removeBackgroundProgressMessage(key),
              percent,
              updatedAt: Date.now(),
            },
          },
          { persist: false },
        )
      })
      const stored = await persistNodeImageBlob(blob, nodeId, `remove-bg-${nodeId}-${createdAt}.png`)
      const result: GenerationNodeResult = {
        id: `image-remove-bg-${nodeId}-${createdAt}`,
        type: 'image' as const,
        url: stored.url,
        createdAt,
      }
      updateNode(nodeId, {
        result,
        history: mergeNodeImageHistory(nodeResult, nodeHistory, [result]),
        status: 'success',
        error: undefined,
        progress: undefined,
        meta: {
          ...(nodeMeta || {}),
          removeBackgroundSource: imageUrl,
          localOnly: stored.localOnly,
          uploadStatus: stored.localOnly ? undefined : 'uploaded',
        },
      })
    } catch {
      // removeBackground 失败（离线/CDN 不通）时静默报错 toast
      updateNode(nodeId, {
        status: previousStatus,
        progress: undefined,
      })
      const { toast } = await import('../../../ui/toast')
      toast(i18n.t('generationCommon.whiteboard.removeBackgroundFailed'), 'error')
    } finally {
      setImageOpBusy(false)
    }
  }, [imageOpBusy, nodeHistory, nodeId, nodeMeta, nodeResult, nodeStatus, updateNode])

  return {
    editGrid,
    openEdit,
    cancelEdit,
    imageOpBusy,
    handleEditConfirm,
    handleImageTransform,
    handleRemoveBackground,
  }
}
