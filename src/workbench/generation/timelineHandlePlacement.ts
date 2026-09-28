// 收起态时间轴手柄的水平落位（纯计算层，2026-09-10 走查反馈 #13 修正）。
//
// 之前的做法是 `left-1/2` 盲居中：agent 面板一拖宽、画布变窄，手柄就跟着中心左移，
// 压到底部已停靠的东西（迷你画面窗/批量停靠条/缩放工具条）——用户看到的就是这个。
//
// 正解：手柄仍然尽量居中（2026-08-08 拍板「底部中间」），但**只能在不被任何底部停靠区
// 压住的自由间隙里居中**。停靠区在 DOM 上自带 `data-canvas-bottom-dock` 标记（见
// useCanvasBottomDockRects.ts 的标记纪律），这里只做几何：给定画布宽、停靠区横向区间、
// 手柄宽，返回手柄的 left（px）。测量的部分住在组件侧，规则住在这里可单测。

export type Interval = { left: number; right: number }

export type VerticalBand = { top: number; bottom: number }
export type DockSpan = Interval & Partial<VerticalBand>

/**
 * 只有和手柄**同一水平带**的停靠区才挡它。
 *
 * 2026-09-21 真机（1280 宽、Agent 面板展开）：批量生成条浮在底排**上方**、横跨整块画布，
 * 被当成一条占满全宽的横向区间 → 没有任何自由间隙 → 退回「理想位居中」→ 胶囊正好压住左下的
 * 画布工具簇（连帮助按钮一起）。批量条根本不在胶囊那一排，挡不着它；按一维区间算就把它算进去了。
 * 没给带（旧调用方 / 量不到高度）时按原规则全算，不放松。
 */
function sharesVerticalBand(dock: DockSpan, band: VerticalBand | undefined): boolean {
  if (!band || dock.top === undefined || dock.bottom === undefined) return true
  return dock.bottom > band.top && dock.top < band.bottom
}

/** 手柄与停靠区之间至少留的呼吸空隙（px）。 */
export const TIMELINE_HANDLE_GAP = 12

function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].filter((i) => i.right > i.left).sort((a, b) => a.left - b.left)
  const merged: Interval[] = []
  for (const i of sorted) {
    const last = merged[merged.length - 1]
    if (last && i.left <= last.right) last.right = Math.max(last.right, i.right)
    else merged.push({ left: i.left, right: i.right })
  }
  return merged
}

/**
 * 返回手柄的 left（px）：理想位是画布水平中心，但钳进「离中心最近的、能容下手柄的
 * 自由间隙」内——绝不与任何停靠区重叠。极端窄画布没有容身间隙时退回理想位钳进画布。
 */
export function resolveTimelineHandleLeft(
  canvasWidth: number,
  docks: readonly DockSpan[],
  handleWidth: number,
  gap: number = TIMELINE_HANDLE_GAP,
  handleBand?: VerticalBand,
): number {
  const idealLeft = canvasWidth / 2 - handleWidth / 2
  if (!(canvasWidth > 0) || !(handleWidth > 0)) return Math.max(0, idealLeft)
  // 停靠区间向外各涨 gap，使手柄贴边时也留呼吸空隙；再合并成占用带。
  const merged = mergeIntervals(
    docks
      .filter((dock) => sharesVerticalBand(dock, handleBand))
      .map((i) => ({ left: i.left - gap, right: i.right + gap })),
  )
  // 自由间隙 = [0, canvasWidth] 减去占用带；能容下手柄的才候选。
  const gaps: Interval[] = []
  let cursor = 0
  for (const i of merged) {
    if (i.left - cursor >= handleWidth) gaps.push({ left: cursor, right: i.left })
    cursor = Math.max(cursor, i.right)
  }
  if (canvasWidth - cursor >= handleWidth) gaps.push({ left: cursor, right: canvasWidth })
  if (gaps.length === 0) return Math.max(0, Math.min(canvasWidth - handleWidth, idealLeft))
  // 取中心离画布中心最近的间隙，理想位钳进该间隙。
  const best = gaps.reduce((acc, g) =>
    Math.abs((g.left + g.right) / 2 - canvasWidth / 2) < Math.abs((acc.left + acc.right) / 2 - canvasWidth / 2) ? g : acc,
  )
  const bounds = { left: Math.max(0, best.left), right: Math.min(canvasWidth, best.right) }
  return Math.max(bounds.left, Math.min(bounds.right - handleWidth, idealLeft))
}
