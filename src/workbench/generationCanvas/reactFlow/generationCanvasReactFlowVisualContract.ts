import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

export type GenerationFlowConnectionAffordance = 'dot' | 'magnetic' | 'hidden'

/**
 * 连线触发面的**唯一 owner**：画布上每一个能起线的东西（节点卡、收起的编组卡）长什么把手，只在这里决定。
 *
 * 三档：
 * - `magnetic`：两侧 112×min(168, h+28) 命中带 + 29px「+」圈，**常驻可见**、跟手（2026-09-21 拍板：
 *   去掉「还得悬停在卡上才露出」这一条）。
 * - `dot`：28px 命中 + 14px 可见圆点（逐字同迁移前 `BaseGenerationNode.tsx` 的 w-7 h-7 按钮 + 14px 点）。
 * - `hidden`：不渲染起线把手（折叠编组在画布内核里的占位节点——真正的把手画在投影层那张编组卡上，
 *   `components/CollapsedGroupCard.tsx`。那张卡没有选中态（点它不选成员），把手常驻、悬停露「+」，
 *   是有意保留的例外，见 docs/fixes/2026-09-21-connection-handle-visibility.root-cause.json）。
 *
 * **谁能起线 → 谁就有「+」圈**（2026-09-21 用户拍板：所有能连线的节点同一种拉环，体验一致）。
 * 从连线能力派生，不按 kind 名单：画布内核里每张非只读的卡都是 `connectable`（generationCanvasReactFlowAdapter.ts），
 * 都渲染左右两个源把手，所以规则里没有任何种类例外。连线落下后合不合法（例如音频接不进图片参考槽）
 * 由完成连线那一侧判（completeNodeConnection / canvasConnectionDropTarget），不是在这里提前藏起入口。
 * 迁移前只给图片类、全景整张不给——全景的命中带在卡片**外侧**，不碰卡内 360° 视角拖动，没有领域冲突。
 *
 * **只给唯一主选中**（2026-09-11 拍板，迁移等价审计 §③ 行 8）：多选时全体退回小圆点。
 * - 迁移前每张选中的图片卡各自长出一条磁吸带。多选五张 = 十条半透明色带首尾相接，看不清选了哪几张。
 * - 多选这一刻用户在做的是「搬一批 / 删一批 / 批量生成」，不是「从这一张起一条线」。
 * 代价：「多选后想从其中某一张起线」要先点回单选。可接受；要改先改这段注释。
 *
 * **磁吸带只在这一张卡上**：未选中的卡永远是小圆点，所以穿过它们旁边的连线照旧点得到——
 * 「每张卡常驻带子、把连线吞掉」正是 #656 被否掉的那版（走查 canvas-handles-alt-drag 有断言）。
 * 起线进行中，起点那张卡退回小圆点（带子会和目标热区叠在同一条边上抢落点）。
 */
export function resolveGenerationFlowConnectionAffordance(
  node: Pick<GenerationCanvasNode, 'id' | 'meta'>,
  primarySelection: boolean,
  pendingConnectionSourceId: string,
): GenerationFlowConnectionAffordance {
  if (node.meta?.collapsedGroupProxy === true) return 'hidden'
  if (!primarySelection || pendingConnectionSourceId === node.id) return 'dot'
  return 'magnetic'
}

