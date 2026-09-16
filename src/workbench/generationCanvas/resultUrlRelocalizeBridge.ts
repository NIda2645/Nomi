// 生成结果「趁链接还活着」补救本地化（2026-07-31 群反馈「生成的视频第二天就加载不出来了」的存量半边）。
// projectId 空窗时主进程跳过落盘，node.result.url 存的是厂商临时 CDN 链接（会过期）——主进程侧
// 已加活动项目兜底堵新增，这里救**已经带着 http(s) 结果的存量节点**：项目一打开就后台
// importRemoteAsset 落盘、把 result.url 改写为 nomi-local://（原链接留在 providerUrl）。
// 纪律：幂等（同 node+url 每次启动只试一次）；静默失败（链接已死 → 播放层自会给人话报错，
// 下次启动再试）；写回前核对 url 未被替换（重生成/转码自愈竞态时绝不覆盖新结果）。
import { hostedAssetUrl, importWorkbenchRemoteAssetUrl } from '../api/assetUploadApi'
import { useGenerationCanvasStore } from './store/generationCanvasStore'
import type { GenerationNodeResult } from './model/generationCanvasTypes'
import { isProjectExecutionContextCurrent, subscribeProjectOpened, type ProjectExecutionContext } from '../project/projectCanvasReadSurface'

export function shouldRelocalizeResult(result: GenerationNodeResult | null | undefined): boolean {
  if (!result) return false
  if (result.type !== 'image' && result.type !== 'video') return false
  return /^https?:\/\//i.test(String(result.url || '').trim())
}

export function relocalizedResultPatch(
  result: GenerationNodeResult,
  localUrl: string,
  assetId?: string,
): GenerationNodeResult | null {
  const next = String(localUrl || '').trim()
  if (!next || next === result.url) return null
  return {
    ...result,
    url: next,
    providerUrl: result.providerUrl || result.url,
    ...(result.type === 'image' ? { thumbnailUrl: next } : {}),
    ...(assetId ? { assetId } : {}),
  }
}

const attempted = new Set<string>()

async function relocalizeNode(nodeId: string, result: GenerationNodeResult, project: ProjectExecutionContext): Promise<void> {
  const sourceUrl = String(result.url || '')
  try {
    const dto = await importWorkbenchRemoteAssetUrl(sourceUrl, undefined, {
      projectBinding: project.binding, assertCurrent: project.assertCurrent, ownerNodeId: nodeId, kind: 'generated',
    })
    const localUrl = hostedAssetUrl(dto)
    if (!isProjectExecutionContextCurrent(project)) return
    const state = useGenerationCanvasStore.getState()
    const node = state.nodes.find((candidate) => candidate.id === nodeId)
    if (!node?.result || node.result.url !== sourceUrl) return
    const patch = relocalizedResultPatch(node.result, localUrl, dto?.id)
    if (patch) state.updateNode(nodeId, { result: patch })
  } catch {
    // 链接已死 / 换了项目 → 静默不打扰；attempted 只在本次启动生效，下次打开会再试。
  }
}

/**
 * 每打开一个项目签发一次它的生命周期，对它画布里带 http(s) 结果的节点后台补一次本地化。
 * 目标项目只来自签发，不读「当前项目」；换项目即停。返回解除函数。
 */
export function initResultUrlRelocalizeBridge(): () => void {
  let unsubscribeStore: () => void = () => undefined
  const unsubscribeOpened = subscribeProjectOpened((project) => {
    unsubscribeStore()
    const sweep = (): void => {
      if (!isProjectExecutionContextCurrent(project)) return
      for (const node of useGenerationCanvasStore.getState().nodes) {
        if (!shouldRelocalizeResult(node.result)) continue
        const key = `${project.binding.projectId}:${node.id}:${String(node.result?.url || '')}`
        if (attempted.has(key)) continue
        attempted.add(key)
        void relocalizeNode(node.id, node.result as GenerationNodeResult, project)
      }
    }
    sweep()
    unsubscribeStore = useGenerationCanvasStore.subscribe(sweep)
  })
  return () => {
    unsubscribeOpened()
    unsubscribeStore()
  }
}
