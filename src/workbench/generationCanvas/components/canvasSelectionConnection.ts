// Cmd/Ctrl+L「连线」（LibTV 同键）：选中两张卡时把它们连起来。不另写连边逻辑——
// 走 completeNodeConnection，与拖把柄落到目标卡是同一条校验与人话反馈。
//
// 只选一张时**不做**「进入待连态」：React Flow 画布里完成一条连线只有「拖把柄落到目标」这一种手势
// （connectOnClick 关着，旧的点输入口完成已随卡内把手一起删了），待连态进去了没有键盘或点击能收尾，
// 只能 Esc 出来——那是一个死胡同，不是功能。
import { completeNodeConnection } from '../nodes/completeNodeConnection'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'

type PositionedNode = { id: string; position: { x: number; y: number } }

export type SelectionConnectionPlan = { sourceId: string; targetId: string } | null

/**
 * 选 2 个 → 左边那张连到右边那张（画布从左往右读：参考在左、产物在右，与起线默认从右口出一致）；
 * 同一列（x 相同）时上面的连到下面的。其余选择数不做任何事（「连哪条」说不清就不猜）。
 */
export function planSelectionConnection(
  selectedNodeIds: readonly string[],
  nodes: readonly PositionedNode[],
): SelectionConnectionPlan {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const selected = selectedNodeIds.map((id) => byId.get(id)).filter((node): node is PositionedNode => Boolean(node))
  if (selected.length !== 2) return null
  const [source, target] = [...selected].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
  return { sourceId: source.id, targetId: target.id }
}

export function connectSelectedCanvasNodes(): void {
  const state = useGenerationCanvasStore.getState()
  const plan = planSelectionConnection(state.selectedNodeIds, state.nodes)
  if (!plan) return
  state.startConnection(plan.sourceId, 'right')
  completeNodeConnection(plan.targetId)
}
