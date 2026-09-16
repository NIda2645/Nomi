// 「固化为参考图」：agent-artifact 的 SVG 产物 → 栅格化成 PNG → 落成画布 asset 节点。
//
// 为什么需要它：参考消费链路（generationReferenceResolver / referenceSlots）统一从
// `node.result.url` 取图（referenceUrl.ts 的 resultUrl），不读 meta.artifact——所以 SVG 手绘产物
// 要能被下游当参考图连线，必须有一个 result.url = PNG 的 asset 节点。本模块就是那条桥：
//   SVG 文本 → <img> 载入 → canvas 栅格化 → PNG blob → importWorkbenchLocalAssetFile 落盘 →
//   addNode(kind:'asset') + updateNode(result:{type:'image', url})。
//
// 安全：只栅格化 SVG（无脚本执行面——<img> 渲染 SVG 不执行内联 script）；内容来自 Agent 交付且
// 无外部引用。glb/markdown/table/html 的"参考化"语义不同（3D 截图 / 渲染帧），P1。
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import type { AgentArtifactMeta } from '../../model/artifactMeta'
import type { WorkbenchAssetDto, UploadWorkbenchAssetMeta } from '../../../api/assetUploadApi'
import { hostedAssetUrl, importWorkbenchLocalAssetFile } from '../../../api/assetUploadApi'
import { isProjectImportCancellation } from '../../adapters/assetImportAdapter'
import type { ProjectExecutionContext } from '../../../project/projectCanvasReadSurface'
import { parseNomiLocalAssetUrl } from '../../../../media/nomiLocalAssetUrl'
import i18n from '../../../../i18n'

export type ReferenceAssetDeps = {
  /** 从产物 URL 取文件文本（nomi-local:// 可 fetch）。 */
  readText: (url: string) => Promise<string>
  /** SVG 文本 → 栅格化 PNG blob（依赖注入，node 单测不碰 canvas）。 */
  rasterizeSvgToPngBlob: (svgText: string) => Promise<Blob | null>
  /** 落盘资产。真实实现 importWorkbenchLocalAssetFile。 */
  uploadFile: (file: File, name?: string, meta?: UploadWorkbenchAssetMeta) => Promise<WorkbenchAssetDto>
}

const realDeps: ReferenceAssetDeps = {
  readText: (url) => fetch(url).then((response) => {
    if (!response.ok) throw new Error(`read-failed:${response.status}`)
    return response.text()
  }),
  rasterizeSvgToPngBlob: async (svgText) => {
    const blobUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
    try {
      const image = new Image()
      const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('rasterize-failed'))
        image.src = blobUrl
      })
      const img = await loaded
      // 从 SVG 的 viewBox/宽高取画布尺寸；无尺寸信息回退默认（构图线稿常用 16:9 或 4:3）。
      const naturalWidth = img.naturalWidth || 960
      const naturalHeight = img.naturalHeight || 540
      const scale = Math.min(1, 4096 / Math.max(naturalWidth, naturalHeight)) // 防超大图撑爆 canvas
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(naturalHeight * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      // 白底（透明 SVG 落 PNG 时在浅色画布上看不见线稿；参考图喂模型也常要实体底）。
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  },
  uploadFile: importWorkbenchLocalAssetFile,
}

export type RasterizeArtifactResult =
  | { ok: true; nodeId: string; url: string }
  | { ok: false; reason: string; cancelled?: true }

/** 固化出的参考图相对源产物卡的落点：右边一个身位。
 *  真机走查（2026-09-07）实测：不给落点时 addNode 退到缺省的 (120,360) 再避让，参考图落到了
 *  画布最左侧、压在左侧工具簇下面——用户点完「固化为参考图」，东西不在他刚才看的地方。
 *  给一个「源卡右边」的起点，剩下的仍交给 addNode 的 AABB 避让（挤到了就自己往下找空位）。 */
const REFERENCE_GAP_PX = 48

/** 把 agent-artifact 的 SVG 产物固化成画布参考图（asset 节点）。依赖注入便于单测。
 *
 *  @param project 发起「固化为参考图」那一刻签发的原项目生命周期（必传，这里不自取当前项目）。
 *  @param sourceNodeId 源产物节点 id。给了就把参考图生在它旁边、并**跟它同一个分类**——
 *    分类不是装饰：画布按 activeCategoryId 分屏渲染，参考图落错分类就等于落在另一块屏上，
 *    用户看到的是「点了没反应」。 */
export async function rasterizeArtifactToReferenceAsset(
  artifact: AgentArtifactMeta,
  project: ProjectExecutionContext,
  deps: ReferenceAssetDeps = realDeps,
  sourceNodeId?: string,
): Promise<RasterizeArtifactResult> {
  if (artifact.fileType !== 'svg') {
    return { ok: false, reason: `unsupported-file-type:${artifact.fileType}` }
  }
  let svgText: string
  try {
    project.assertCurrent()
    svgText = await deps.readText(artifact.url)
    project.assertCurrent()
  } catch (error) {
    if (project.signal.aborted || isProjectImportCancellation(error)) return { ok: false, cancelled: true, reason: 'cancelled' }
    return { ok: false, reason: error instanceof Error ? error.message : 'read-failed' }
  }
  let pngBlob: Blob | null
  try {
    pngBlob = await deps.rasterizeSvgToPngBlob(svgText)
    project.assertCurrent()
  } catch (error) {
    if (project.signal.aborted || isProjectImportCancellation(error)) return { ok: false, cancelled: true, reason: 'cancelled' }
    return { ok: false, reason: error instanceof Error ? error.message : 'rasterize-failed' }
  }
  if (!pngBlob) return { ok: false, reason: 'rasterize-failed' }

  const baseName = artifactFileNameFallback(artifact.url) || i18n.t('runtime.nodeRegistry.agent-artifact.referenceName')
  const pngFile = new File([pngBlob], `${baseName}.png`, { type: 'image/png' })
  let asset: WorkbenchAssetDto
  try {
    asset = await deps.uploadFile(pngFile, pngFile.name, { projectBinding: project.binding, assertCurrent: project.assertCurrent })
    project.assertCurrent()
  } catch (error) {
    if (project.signal.aborted || isProjectImportCancellation(error)) return { ok: false, cancelled: true, reason: 'cancelled' }
    return { ok: false, reason: error instanceof Error ? error.message : 'upload-failed' }
  }
  const hostedUrl = hostedAssetUrl(asset)
  if (!hostedUrl) return { ok: false, reason: 'no-hosted-url' }

  const store = useGenerationCanvasStore.getState()
  const source = sourceNodeId ? store.nodes.find((candidate) => candidate.id === sourceNodeId) : undefined
  const node = store.addNode({
    kind: 'asset',
    title: pngFile.name,
    prompt: '',
    categoryId: source?.categoryId || 'shots',
    ...(source
      ? { position: { x: source.position.x + (source.size?.width || 360) + REFERENCE_GAP_PX, y: source.position.y } }
      : {}),
  })
  const hostedResult = {
    id: `ref-${node.id}`,
    type: 'image' as const,
    url: hostedUrl,
    assetId: asset.id,
    raw: { asset },
    createdAt: Date.now(),
  }
  store.updateNode(node.id, {
    result: hostedResult,
    history: [hostedResult],
    status: 'success',
    meta: { ...(node.meta || {}), source: 'artifact-reference', fileName: pngFile.name },
  })
  return { ok: true, nodeId: node.id, url: hostedUrl }
}

/** 从产物 URL 取文件名（去目录去扩展名；空则空串）。
 *
 *  必须走 parseNomiLocalAssetUrl：nomi-local URL 是**逐段 encodeURIComponent** 建出来的
 *  （buildNomiLocalAssetUrl），所以取名也必须逐段 decode。原先在这里自己写正则切最后一段，
 *  中文标题就原封不动带着 %E5%BC%80… 变成参考图的文件名和节点标题——用户看到一串乱码。
 *  建与解已经是同一个模块里配对的两个函数，这里只该消费它，不该再写第三种解法。 */
function artifactFileNameFallback(url: string): string {
  const target = parseNomiLocalAssetUrl(url)
  if (!target) return ''
  const fileName = target.relativePath.split('/').pop() || ''
  const cleaned = fileName.replace(/\.[^.]+$/, '')
  return cleaned && cleaned !== 'asset' ? cleaned : ''
}
