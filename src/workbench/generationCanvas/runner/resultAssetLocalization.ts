import { getDesktopBridge } from '../../../desktop/bridge'
import { unwrapAssetImportResult } from '../../../../electron/shared/contracts/assetImportResult'
import type { GenerationNodeResult } from '../model/generationCanvasTypes'

// 「厂商临时 URL 绝不落进 result.url」的结构闸 + 存量抢救，共用的领域逻辑。
//
// 根因：主进程 localizeTaskAsset 只在 projectId 有值时把厂商产物下载成本地 nomi-local 资产；
// projectId 缺失的时序窗口（runtime.ts / taskResultQuery.ts 的三处 else 分支）会把厂商返回的
// 临时 CDN 直链原样当成品返回 → 被 addNodeResult 写进项目文件 → 隔天/过段时间 CDN 过期 →
// 播放时 4xx/超时 → 纯灰壳（症状「生成的视频过段时间打开播不了」）。
//
// 修在渲染层做「最后一道防线」而非只靠主进程：渲染层此刻拿的是「当前打开的项目」这一确切、
// 同步可读的 projectId，比主进程那条受启动时序影响的 projectId 更可靠。主进程有值时已本地化
// （result.url 已是 nomi-local → 这里判定为非 http → 立即原样返回，零开销 no-op），只有主进程
// 漏了才真正补一次。这是同一职责的两道防线，不是并行版：职责单一——result.url 必须落地。
export function isRemoteHttpUrl(url: string | undefined | null): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim())
}

/**
 * 确保一个生成结果的 url 落到本地。已是 nomi-local / 无 url → 原样返回（no-op）。
 * http(s) → 用 projectId 下载落盘，成功换成本地 url 并把原 CDN 留进 providerUrl；
 * 失败（URL 已过期 / 网络 / 无桌面环境）→ 保持原样，绝不阻断生成或加载（播放守卫会诚实报错）。
 */
export async function localizeRemoteResultUrl(
  result: GenerationNodeResult,
  projectId: string,
  nodeId: string,
): Promise<GenerationNodeResult> {
  if (!isRemoteHttpUrl(result.url)) return result
  const trimmedProjectId = String(projectId || '').trim()
  if (!trimmedProjectId) return result // 无项目可落（headless/首启窗口）→ 交给调用方，不硬塞
  const importRemoteUrl = getDesktopBridge()?.assets?.importRemoteUrl
  if (!importRemoteUrl) return result
  const remoteUrl = String(result.url)
  try {
    const asset = unwrapAssetImportResult(await importRemoteUrl({
      projectId: trimmedProjectId,
      url: remoteUrl,
      kind: 'generated',
      ownerNodeId: nodeId,
    }))
    const localUrl = typeof asset?.data?.url === 'string' ? asset.data.url.trim() : ''
    if (!localUrl || localUrl === remoteUrl) return result
    return {
      ...result,
      url: localUrl,
      // 原始 CDN 留进 providerUrl（若尚无）：vendor 侧可直用、留作诊断，但绝不再当播放主源。
      providerUrl: result.providerUrl || remoteUrl,
      ...(asset.id ? { assetId: asset.id } : {}),
    }
  } catch {
    // 本地化失败绝不冒泡：新生成时 URL 还新鲜、几乎必成；存量隔天可能已过期救不回，
    // 那就保持原样，由播放守卫说人话（「视频代理返回 4xx」），而不是让整轮生成/加载失败。
    return result
  }
}
