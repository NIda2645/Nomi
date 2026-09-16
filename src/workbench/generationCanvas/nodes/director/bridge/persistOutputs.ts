/**
 * [INPUT]: 依赖 ../../../../../desktop/bridge 的 getDesktopBridge、调用方签发的 ProjectExecutionContext
 * [OUTPUT]: 对外提供 PersistedScreenshot / PersistedFramesVideo、persistDirectorScreenshot、persistDirectorFramesVideo
 * [POS]: director/bridge 的产物落盘桥（原 V1 scene3dScreenshot / cameraMoveVideo，切换门入籍）：
 *        截图 dataURL → 资产桥 importRemoteUrl 落成项目素材 PNG，缺失/临时句柄拒绝登记；N 帧 dataURL → ffmpeg 帧转视频 IPC 落成 mp4。
 *        无桌面运行时 / 无激活项目 → localOnly=true，不炸（devlab / 单测）。产物只返回句柄 url，禁 base64 进工程。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { getDesktopBridge } from '../../../../../desktop/bridge'
import { importWorkbenchRemoteAssetUrl } from '../../../../api/assetUploadApi'
import type { ProjectExecutionContext } from '../../../../project/projectCanvasReadSurface'

export type PersistedScreenshot = {
  url: string
  assetId?: string
  raw?: unknown
  localOnly: boolean
}

export type PersistedFramesVideo = {
  url: string | null
  assetId?: string
  localOnly: boolean
}

function fileSafePart(value: string, fallback: string): string {
  return value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || fallback
}

/**
 * project：发起出图/出片那一刻签发的原项目；null = 此刻没有打开的项目（devlab / 无桌面运行时），
 * 显式走本地临时产物，绝不回退去读「当前项目」。
 */
export async function persistDirectorScreenshot(dataUrl: string, ownerNodeId: string, title: string, project: ProjectExecutionContext | null): Promise<PersistedScreenshot> {
  const desktop = getDesktopBridge()
  if (!desktop || !project) return { url: dataUrl, localOnly: true }
  const fileName = `${fileSafePart(title, 'director')}-${fileSafePart(ownerNodeId, 'node')}-${Date.now()}.png`
  const asset = await importWorkbenchRemoteAssetUrl(dataUrl, fileName, {
    projectBinding: project.binding, assertCurrent: project.assertCurrent, kind: 'generated', ownerNodeId,
  })
  const url = typeof asset.data?.url === 'string' ? asset.data.url.trim() : ''
  if (!url || /^(data|blob):/i.test(url)) throw new Error('Director screenshot persistence returned no durable asset URL')
  return { url, assetId: asset.id, raw: { asset }, localOnly: false }
}

/** N 帧 PNG dataURL（按播放顺序）→ mp4 项目素材。 */
export async function persistDirectorFramesVideo(frames: string[], ownerNodeId: string, title: string, fps: number, project: ProjectExecutionContext | null): Promise<PersistedFramesVideo> {
  const desktop = getDesktopBridge()
  if (!desktop?.director?.framesToVideo || !project) return { url: null, localOnly: true }
  const fileName = `${fileSafePart(title, 'director')}-${fileSafePart(ownerNodeId, 'node')}-${Date.now()}.mp4`
  project.assertCurrent()
  const result = await desktop.director.framesToVideo({
    projectId: project.binding.projectId, projectBinding: project.binding, ownerNodeId, fileName, fps, frames,
  })
  project.assertCurrent()
  return { url: result.url || null, assetId: result.assetId, localOnly: false }
}
