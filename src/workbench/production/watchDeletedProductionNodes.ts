import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { reportDetachedShotNodes, type DetachReportApi } from './reportDetachedShotNodes'
import { surfaceDetachReportFailure } from './detachReportFeedback'
import type { GenerationCanvasState } from '../generationCanvas/store/canvasStoreTypes'

/** 这一份画布上每个制作占位节点 id → 它所属的 runId。 */
function productionNodeRuns(state: Pick<GenerationCanvasState, 'nodes'>): Map<string, string> {
  const runs = new Map<string, string>()
  for (const node of state.nodes) {
    const meta = node.meta as Record<string, unknown> | undefined
    if (typeof meta?.productionRunId === 'string' && meta.productionRunId) runs.set(node.id, meta.productionRunId)
  }
  return runs
}

/**
 * 观察制作占位节点被删（整批 ⌘Z / 手动删）→ 让它所属的 Run 记 detached：还没派出去的那一镜就此不再派、不扣钱
 * （撤销事实优先）。上一拍在、这一拍不在 = 被删；按 runId 聚合，每个 Run 发一条（Run 侧对已 detached 的无变化，幂等）。
 *
 * **只有「同一份已装载的项目画布」上的消失才算删除**：变化的前后两拍里只要有一拍 `isReady` 不成立，这一下就是
 * 项目文档的装载 / 卸下（返回项目库、切项目、首次打开），不是编辑——重新记一遍基线，什么都不报。
 * `isReady` 是画布 store 自己的「项目文档已装载」标记：只有 restoreSnapshot 置真、只有项目释放置假。
 * 2026-10-03（S1-5）：离开项目时 store 被同步清空，而这个观察者要等 React 下一次提交才卸载；清空那一拍它把
 * 「项目卸下」当成「用户删了全部制作节点」上报，Run 记下 detached，在跑的那一镜出完图也永远落不到节点上。
 *
 * 上报没落到 Run 就意味着被删的那一镜可能照样派发、照样扣费，所以失败一定交给 `surfaceDetachReportFailure`
 * 留痕并告诉用户——这里以前是 `catch {}`，删节点静默失效（2026-09-29 #921 真额度验收）。
 *
 * 返回取消订阅。
 */
export function watchDeletedProductionNodes(projectId: string, api: DetachReportApi): () => void {
  let known = productionNodeRuns(useGenerationCanvasStore.getState())
  return useGenerationCanvasStore.subscribe((state, previous) => {
    const next = productionNodeRuns(state)
    if (!state.isReady || !previous.isReady) {
      known = next
      return
    }
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
