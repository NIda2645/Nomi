// agent-artifact 的「交付落盘」：Agent 在 create_canvas_nodes 里直接给文件内容（artifact.content），
// 渲染层把它落盘为项目资产（nomi-local://）再建节点——不调模型、不假装能生成。
//
// 设计：
// - 与 electron canvasWrite schema 的 artifact 字段对齐：fileType ∈ {svg,html,markdown,table,text}，
//   content 为文件原文；glb 等二进制不走文本通道（P1 另接文件上传）。
// - 落盘走渲染层标准资产导入（importWorkbenchLocalAssetFile：resolve projectId + importFile + 落盘广播），
//   与图片/素材导入同一条主进程通道，不新造写盘路径。
// - 本模块保持纯 + 依赖注入（assetImport 可注入），单测不碰 Electron。
import type { ArtifactFileType } from '../model/artifactMeta'
import type { ProjectBinding } from '../../../../electron/shared/projectBinding'
import type { UploadWorkbenchAssetMeta } from '../../api/assetUploadApi'
import { surfacePortFailure, type SurfacePortFailure } from '../../../../electron/shared/surfacePortBinding'

export type ArtifactWriteContext = Readonly<{ binding: ProjectBinding; assertCurrent(): void }>

/** 文本类手艺产物 → 资产落盘文件名扩展名（与 meta.artifact.url 带真实扩展名的约束一致）。 */
export const DELIVERABLE_ARTIFACT_EXTENSION: Record<ArtifactFileType, string> = {
  svg: 'svg',
  html: 'html',
  markdown: 'md',
  table: 'html',
  text: 'txt',
  glb: 'glb', // 词表兼容；文本交付通道在 schema 层已排除 glb
}

/** 文本类手艺产物 → MIME（供 File 构造）。 */
export const DELIVERABLE_ARTIFACT_MIME: Record<ArtifactFileType, string> = {
  svg: 'image/svg+xml',
  html: 'text/html',
  markdown: 'text/markdown',
  table: 'text/html',
  text: 'text/plain',
  glb: 'model/gltf-binary',
}

export type DeliverAgentArtifactInput = {
  fileType: ArtifactFileType
  /** Agent 手写的文件原文。 */
  content: string
  /** 标题（用于资产文件名）；空则用「agent-artifact-时间戳」。 */
  title?: string
}

export type DeliverAgentArtifactResult = {
  ok: true
  /** nomi-local://asset/... 资产 URL（带真实扩展名，可直接作 meta.artifact.url）。 */
  url: string
  fileName: string
} | {
  ok: false
  failure: SurfacePortFailure
}

/** 从标题 derive 安全文件名（去掉路径分隔与危险字符；保底用默认名）。 */
export function artifactFileName(input: DeliverAgentArtifactInput): string {
  const base = (input.title || '').trim().replace(/[/\\:*?"<>|\s]+/g, '-').slice(0, 80) || 'agent-artifact'
  return `${base}.${DELIVERABLE_ARTIFACT_EXTENSION[input.fileType]}`
}

export function buildArtifactFile(input: DeliverAgentArtifactInput): File {
  return new File([input.content], artifactFileName(input), {
    type: DELIVERABLE_ARTIFACT_MIME[input.fileType],
  })
}

/** 落盘器抽象：真实实现 importWorkbenchLocalAssetFile，单测注入 stub。 */
export type WorkbenchAssetImporter = (file: File, name: string, meta: UploadWorkbenchAssetMeta) => Promise<{ data?: { url?: string } }>

const realImporter: WorkbenchAssetImporter = async (file, name, meta) => {
  const { importWorkbenchLocalAssetFile } = await import('../../api/assetUploadApi')
  const asset = await importWorkbenchLocalAssetFile(file, name, meta)
  return asset as { data?: { url?: string } }
}

/** 交付一件手艺产物：构建 File → 落盘 → 返回 nomi-local URL（供 create_canvas_nodes 填 meta.artifact）。 */
export async function deliverAgentArtifactToAsset(
  input: DeliverAgentArtifactInput,
  context: ArtifactWriteContext,
  assetImport: WorkbenchAssetImporter = realImporter,
): Promise<DeliverAgentArtifactResult> {
  const content = (input.content || '').trim()
  if (!content) return { ok: false, failure: { code: 'capability_input_invalid' } }
  const file = buildArtifactFile(input)
  try {
    context.assertCurrent()
    const imported = await assetImport(file, artifactFileName(input), {
      projectBinding: context.binding,
      assertCurrent: context.assertCurrent,
    })
    context.assertCurrent()
    const url = imported?.data?.url
    if (!url) return { ok: false, failure: { code: 'capability_receipt_unresolved' } }
    return { ok: true, url, fileName: file.name }
  } catch (error) {
    return { ok: false, failure: surfacePortFailure(error) }
  }
}

/** 校验/文件类型是否可走文本交付通道（glb 二进制除外——与 electron canvasWrite schema 对齐）。 */
export function isTextDeliverableFileType(fileType: string): fileType is Extract<ArtifactFileType, 'svg' | 'html' | 'markdown' | 'table' | 'text'> {
  return fileType === 'svg' || fileType === 'html' || fileType === 'markdown' || fileType === 'table' || fileType === 'text'
}
