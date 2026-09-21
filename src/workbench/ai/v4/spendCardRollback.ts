// 付费卡 × 的画布回滚：**这次操作自己造出来的那些占位节点**，一次事务、一个撤销步。
//
// ── 为什么判据是「来源」而不是「绑定」 ──
//
// 卡上每一镜身上挂着一个 `nodeId`，那是**引用**：同一个 shotId 在落地链里可以复用一个
// 早就在画布上的节点（`multiShotCanvasLanding` 的 `existingByShot` 初值就是已有节点），
// 也可以被 rebind 写到一个老节点上。「被这次操作引用到」≠「这次操作造出来的」。
//
// 2026-09-21 用户原话：「我不生成，我的所有节点卡片都没了。」根因正是按引用删：
// × 循环 `deleteNode(shots[].nodeId)`，把**用户自己的节点**一起删了，而且每次 `deleteNode`
// 自己打一个 undo barrier —— 建的时候一个 Cmd+Z，删的时候要按 N 次。
//
// 所以这里只删**同时满足**三条的节点：
//   ① 身上有物化章（`materializationOperationId`）—— 用户徒手建的节点没有这一章，一律不动；
//   ② `productionRunId` 就是这张卡那一个 Run —— 别的 Run 落的节点不归这次 × 管；
//   ③ `productionShotId` 与卡上那一镜对得上，且 `shots[].nodeId` 也指着它 —— 卡上没摆出来的镜不动。
//   ④ 它**还是个占位**——身上没有任何产物。已经出过图的节点不是「这次请求造的占位」：那是用户花过钱的东西。
//      （2026-09-22 真机走查实测：确认出图之后同一镜「再来一次」的那张卡被 × 掉，连带把已经出图的节点删了，画布空了。）
//
// 判据用 `productionRunId`/`productionShotId` 而不是重新拼一次 `canvas-landing:{runId}`：
// 那个串的产地在主进程（`electron/productionRun/multiShotCanvasLanding.ts`），渲染层再写一份
// 就是同一语义两份定义（R14.1）。章在不在由 `materializationOperationId` 回答，是哪一次由
// Run/镜身份回答，两件事各由自己的字段答。
import { withCanvasGestureContext } from '../../generationCanvas/events/canvasGestureContext'
import { pushUndoSnapshot } from '../../generationCanvas/events/canvasUndoJournal'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { MATERIALIZATION_OPERATION_META_KEY } from '../../generationCanvas/agent/materializationStamp'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import type { PendingSpendConfirm } from '../../../desktop/productionRunBridgeTypes'

type NodeLike = Pick<GenerationCanvasNode, 'id' | 'meta' | 'result' | 'history'>

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 这张卡的哪些节点是**这次操作自己造的**。纯函数：喂一份画布快照 + 一张卡即可单测。
 *
 * 返回顺序跟随卡上镜序（回滚倒序应用，和 `proposalUndo.applyCompensationOps` 同姿势）。
 */
export function ownedSpendNodeIds(
  nodes: readonly NodeLike[],
  pending: Pick<PendingSpendConfirm, 'runId' | 'shots'>,
): readonly string[] {
  const byId = new Map(nodes.map((node) => [node.id, node] as const))
  const out: string[] = []
  const seen = new Set<string>()
  for (const shot of pending.shots) {
    const nodeId = text(shot.nodeId)
    if (!nodeId || seen.has(nodeId)) continue
    const node = byId.get(nodeId)
    if (!node) continue
    const meta = (node.meta as Record<string, unknown> | undefined) ?? {}
    // 没有物化章 = 不是任何一次落地造的 = 用户自己的东西。一律不动。
    if (!text(meta[MATERIALIZATION_OPERATION_META_KEY])) continue
    if (text(meta.productionRunId) !== text(pending.runId)) continue
    if (text(meta.productionShotId) !== text(shot.shotId)) continue
    // 已经有产物的节点不是占位：× 撤的是「这次请求」，不是用户已经付过钱的那张图。
    if (node.result || (node.history?.length ?? 0) > 0) continue
    seen.add(nodeId)
    out.push(nodeId)
  }
  return out
}

/**
 * 撤掉这次操作落下的占位节点：**一个 barrier + 一个 txn**，一次 Cmd+Z 整批回来
 * （与 `materializeShots` 建它们时的 `txn_materialize_shots_*` 逐字对称）。
 *
 * 返回真的撤掉了几个（0 = 没有任何一个节点属于这次操作，卡就只是消失，画布一个字不动）。
 */
export function rollBackDiscardedSpendNodes(pending: Pick<PendingSpendConfirm, 'runId' | 'operationId' | 'shots'>): number {
  const store = useGenerationCanvasStore.getState()
  const owned = ownedSpendNodeIds(store.nodes, pending)
  if (owned.length === 0) return 0
  const ctx = {
    source: 'user' as const,
    txnId: `txn_discard_spend_${pending.operationId}`,
    suppressUndoBarriers: true,
  }
  // barrier 在事务**外**打一次（不被抑制）：事务内每个 deleteNode 自带的 pushUndoSnapshot
  // 都被抑制掉，于是整批只占一个撤销步。
  withCanvasGestureContext({ ...ctx, suppressUndoBarriers: false }, () => pushUndoSnapshot())
  withCanvasGestureContext(ctx, () => {
    // 倒序：与建的顺序相反，且对「用户已经自己删掉了其中一个」全部容忍 no-op。
    for (const nodeId of [...owned].reverse()) {
      const existing = useGenerationCanvasStore.getState().nodes.some((node) => node.id === nodeId)
      if (existing) useGenerationCanvasStore.getState().deleteNode(nodeId)
    }
  })
  return owned.length
}
