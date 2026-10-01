import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { reportDetachedShotNodes, type DetachReportApi } from './reportDetachedShotNodes'
import { surfaceDetachReportFailure } from './detachReportFeedback'

/** 当前画布上每个制作占位节点 id → 它所属的 runId。 */
function productionNodeRuns(): Map<string, string> {
  const runs = new Map<string, string>()
  for (const node of useGenerationCanvasStore.getState().nodes) {
    const meta = node.meta as Record<string, unknown> | undefined
    if (typeof meta?.productionRunId === 'string' && meta.productionRunId) runs.set(node.id, meta.productionRunId)
  }
  return runs
}

/**
 * 观察制作占位节点被删（整批 ⌘Z / 手动删）→ 让它所属的 Run 记 detached：还没派出去的那一镜就此不再派、不扣钱
 * （撤销事实优先）。上一拍在、这一拍不在 = 被删；按 runId 聚合，每个 Run 发一条（Run 侧对已 detached 的无变化，幂等）。
 *
 * 上报没落到 Run 就意味着被删的那一镜可能照样派发、照样扣费，所以失败一定交给 `surfaceDetachReportFailure`
 * 留痕并告诉用户——这里以前是 `catch {}`，删节点静默失效（2026-09-29 #921 真额度验收）。
 *
 * 返回取消订阅。
 */
export function watchDeletedProductionNodes(projectId: string, api: DetachReportApi): () => void {
  let known = productionNodeRuns()
  return useGenerationCanvasStore.subscribe(() => {
    const next = productionNodeRuns()
    const removedByRun = new Map<string, string[]>()
    for (const [nodeId, runId] of known) {
      if (next.has(nodeId)) continue
      const nodeIds = removedByRun.get(runId) ?? []
      nodeIds.push(nodeId)
      removedByRun.set(runId, nodeIds)
    }
    known = next
    for (const [runId, nodeIds] of removedByRun) {
      void reportDetachedShotNodes(projectId, runId, nodeIds, api)
        .catch((error: unknown) => surfaceDetachReportFailure(projectId, runId, nodeIds.length, error))
    }
  })
}
