// 「把选中的成图拼成一张联系表」整动作（不碰 UI，选择浮条调用它）。
//
// 产物是**一张普通图片**，落成普通 image 节点——刻意不新增节点 kind（拍板 2026-08-02）：
// 联系表是拿去给客户/团队看整场戏的**交付物**，不是新的一类创作对象。
//
// 画法沿用仓里已有的 canvas 2D（切图九宫格同一套 drawImage + convertToBlob），不引第三方；
// 落盘走 persistNodeImageBlob，避免 PNG base64 挂进 store（图多即卡，见 useNodeImageEditing 头注释）。
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { persistNodeImageBlob } from '../adapters/persistNodeImage'
import { toast } from '../../../ui/toast'
import { CONTACT_SHEET_DEFAULTS, computeContactSheetLayout, containRect } from './contactSheetLayout'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import i18n from '../../../i18n'

/** 联系表的候选：选中的节点里**已经出图**的那些，按画布上的选中顺序。 */
export function contactSheetSources(
  selectedNodeIds: readonly string[],
  nodes: readonly GenerationCanvasNode[],
): { id: string; url: string; label: string }[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return selectedNodeIds.flatMap((id) => {
    const node = byId.get(id)
    const url = node?.result?.url
    if (!node || !url || node.result?.type === 'video') return []
    const label = (node.title || '').trim() || String(node.shotIndex ?? '')
    return [{ id: node.id, url, label }]
  })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image.'))
    if (!url.startsWith('data:') && !url.startsWith('blob:')) image.crossOrigin = 'anonymous'
    image.src = url
  })
}

/** 渲染联系表 → PNG Blob。任何一张加载失败**不毁整张**：那格画成占位并标出来，其余照排。 */
export async function renderContactSheet(
  sources: readonly { url: string; label: string }[],
): Promise<{ blob: Blob; width: number; height: number; failed: number } | null> {
  if (typeof document === 'undefined' || !sources.length) return null
  const layout = computeContactSheetLayout({ count: sources.length })
  const canvas = new OffscreenCanvas(layout.width, layout.height)
  const context = canvas.getContext('2d')
  if (!context) return null

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, layout.width, layout.height)

  let failed = 0
  for (const cell of layout.cells) {
    const source = sources[cell.index]
    if (!source) continue
    context.fillStyle = '#f2f2f0'
    context.fillRect(cell.x, cell.y, cell.width, cell.height)
    try {
      const image = await loadImage(source.url)
      const sw = image.naturalWidth || image.width
      const sh = image.naturalHeight || image.height
      const rect = containRect(sw, sh, cell.width, cell.height)
      context.drawImage(image, cell.x + rect.x, cell.y + rect.y, rect.width, rect.height)
    } catch {
      failed += 1
      context.fillStyle = '#c8c8c4'
      context.font = '16px sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(i18n.t('generationCommon.contactSheet.missing'), cell.x + cell.width / 2, cell.y + cell.height / 2)
    }
    // 标号条：没有它，客户看到九张图也说不清「你说的是哪一张」。
    context.fillStyle = '#1a1a1a'
    context.font = '500 15px sans-serif'
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    const caption = source.label || String(cell.index + 1)
    context.fillText(caption, cell.x + 2, cell.captionY + CONTACT_SHEET_DEFAULTS.captionHeight / 2, cell.width - 4)
  }

  // convertToBlob 是异步的：联系表画布可以很大（N 张成图拼一张），同步 toDataURL 会当场冻住主线程。
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return blob ? { blob, width: layout.width, height: layout.height, failed } : null
}

/** 选中的成图 → 一张联系表图片节点。返回是否成功。 */
export async function buildContactSheetNode(selectedNodeIds: readonly string[]): Promise<boolean> {
  const store = useGenerationCanvasStore.getState()
  const sources = contactSheetSources(selectedNodeIds, store.nodes)
  if (sources.length < 2) {
    toast(i18n.t('generationCommon.contactSheet.needTwo'), 'error')
    return false
  }

  const rendered = await renderContactSheet(sources)
  if (!rendered) {
    toast(i18n.t('generationCommon.contactSheet.failed'), 'error')
    return false
  }

  // 放在选中区右侧，别压着原图。
  const picked = store.nodes.filter((node) => selectedNodeIds.includes(node.id))
  const right = picked.reduce((max, node) => Math.max(max, node.position.x), 0)
  const top = picked.reduce((min, node) => Math.min(min, node.position.y), Number.POSITIVE_INFINITY)
  const created = store.addNode({
    kind: 'image',
    title: i18n.t('generationCommon.contactSheet.nodeTitle', { count: sources.length }),
    position: { x: Math.round(right + 560), y: Math.round(Number.isFinite(top) ? top : 0) },
    categoryId: picked[0]?.categoryId,
  })
  const createdAt = Date.now()
  useGenerationCanvasStore.getState().selectNode(created.id)

  // 落盘换 nomi-local:// 之后**只写一次** store：base64 进 store 会被事件层整段 JSON 深拷贝，
  // 联系表这种大图一次就是十几 MB（同 useNodeImageEditing 的收敛，见 persistNodeImageBlob 注释）。
  const stored = await persistNodeImageBlob(rendered.blob, created.id, `contact-sheet-${createdAt}.png`)
  useGenerationCanvasStore.getState().updateNode(created.id, {
    result: { id: `contact-sheet-${createdAt}`, type: 'image', url: stored.url, createdAt },
    meta: { localOnly: stored.localOnly, ...(stored.localOnly ? {} : { uploadStatus: 'uploaded' as const }) },
  })

  if (rendered.failed > 0) {
    toast(i18n.t('generationCommon.contactSheet.someMissing', { count: rendered.failed }), 'error')
  }
  return true
}
