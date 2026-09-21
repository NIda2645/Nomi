// 「画布上正在进行拖动」这一件事的唯一真相 —— 写在 stage 上的一个 DOM 属性。
//
// 谁会升起它：拖单个节点、拖选区框、拖组框（都是在摆节点位置），以及**拖画布本身**（平移）。
// 谁会看它：节点的浮动工具条 / 提示词面板 / 图片版本控件条——拖动期间统统隐身
// （2026-08-08 用户提「拖节点时浮层跟着飞很脏」，08-09 两次扩围：先扩到全部节点、再扩到平移）。
//
// 为什么是画布级而不是节点级：用户选中 A 展开了输入框，再去拖 B——A 那块大面板还杵在画布上。
// 「我正在摆位置/找位置」是一个**画布态**，不是某个节点的私事，所以标志挂 stage、浮层各自声明隐身，
// 天然覆盖全部节点，也不用把状态一层层传下去。
//
// 为什么不进 React：它只驱动可见性（CSS），进 state 就等于每次拖动开始/结束让节点树重渲一轮——
// 和光标那次栽的是同一个坑（见 reactFlow/useGenerationCanvasReactFlowPointer 的 data-panning 那段注释）。
//
// 时机纪律：**跨过拖拽阈值才升**，不是按下就升。否则「点一下空白」也会写两次属性，
// 每次都让整棵 stage 子树重算样式——那正是 2026-08-08 用户报的「点空白也在刷新」。
const STAGE_SELECTOR = '.generation-canvas-v2__stage'

export const CANVAS_DRAGGING_ATTRIBUTE = 'data-dragging'

export const CANVAS_DRAGGING_OWNER = {
  node: 'node',
  selection: 'selection',
  group: 'group',
  viewport: 'viewport',
  reactFlowNode: 'react-flow-node',
  reactFlowPan: 'react-flow-pan',
  reactFlowViewport: 'react-flow-viewport',
} as const

export type CanvasDraggingOwner = (typeof CANVAS_DRAGGING_OWNER)[keyof typeof CANVAS_DRAGGING_OWNER]

const draggingOwnersByStage = new WeakMap<Element, Set<CanvasDraggingOwner>>()

/**
 * 标志的寿命上限 = 这一次指针手势。
 *
 * 升起标志的每一位 owner（拖节点 / 拖选区 / 拖框 / 平移）都是**按着指针**才会发生的动作，所以
 * 指针一松开（pointerup / pointercancel / 窗口失焦），这张画布上就不该再有任何 owner。
 * 各 owner 自己的收尾照旧做；这里只保证：哪位 owner 的收尾因为时序没走到，标志也**不会活过这次手势**。
 *
 * 为什么必须在这一层兜：2026-09-22 用户报「选中节点浮框整个没了 / 点『2 版』没反应」——
 * 真因是视口平移的收尾被 React Flow 推迟 150ms（`panOnScroll` 时 `createPanZoomEndHandler`
 * 用 setTimeout 防抖），这 150ms 里任何一次画布内按下都会把「这次平移动过没」重置掉，收尾于是跳过，
 * `data-dragging` 永远留在 true，浮框 / 浮条 / 版本托盘全部 `invisible`，直到下一次完整拖动画布。
 * 触发它的是 owner 之间的时序，不是某一位 owner 写错了一行；只要标志的释放还靠 owner 各自记账，
 * 下一位 owner 就能用另一种时序再漏一次。所以释放的最后一道闸放在标志自己这里。
 */
const gestureEndGuardByStage = new WeakMap<Element, () => void>()
/** 每次升起标志 +1：兜底收尾只收「手势结束那一刻」的 owner，不误伤紧接着开始的下一次手势。 */
const raiseEpochByStage = new WeakMap<Element, number>()

function armGestureEndGuard(stage: Element): void {
  if (gestureEndGuardByStage.has(stage) || typeof window === 'undefined') return
  const events = ['pointerup', 'pointercancel', 'blur'] as const
  const onGestureEnd = (event: Event) => {
    // 捕获阶段也看得到后代元素的 blur（焦点在控件间移动）；只有窗口本身失焦才算手势被打断。
    if (event.type === 'blur' && event.target !== window) return
    disarm()
    const epoch = raiseEpochByStage.get(stage)
    // 等一帧再收：正常路径上各 owner 自己的收尾（React 的 pointerup、React Flow 0ms 的 move-end）先走完，
    // 属性只摘一次、和它们的状态更新落在同一轮布局里；只有漏收的那位才轮到这里。
    const settle = () => {
      if (raiseEpochByStage.get(stage) !== epoch || !draggingOwnersByStage.has(stage)) return
      draggingOwnersByStage.delete(stage)
      stage.removeAttribute(CANVAS_DRAGGING_ATTRIBUTE)
    }
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => settle())
    else settle()
  }
  const disarm = () => {
    for (const name of events) window.removeEventListener(name, onGestureEnd, true)
    gestureEndGuardByStage.delete(stage)
  }
  for (const name of events) window.addEventListener(name, onGestureEnd, true)
  gestureEndGuardByStage.set(stage, disarm)
}

/**
 * @param origin 拖动发起处的元素（节点/组框/stage）。用它 closest 到自己那张画布——
 *               多画布并存时不会误伤别的 stage；取不到就退回文档里的第一张。
 */
export function setCanvasDragging(
  origin: Element | null | undefined,
  dragging: boolean,
  owner: CanvasDraggingOwner,
): void {
  if (typeof document === 'undefined') return
  const stage = origin?.closest(STAGE_SELECTOR) ?? document.querySelector(STAGE_SELECTOR)
  if (!stage) return
  let owners = draggingOwnersByStage.get(stage)
  if (dragging) {
    if (!owners) {
      owners = new Set()
      draggingOwnersByStage.set(stage, owners)
    }
    owners.add(owner)
    raiseEpochByStage.set(stage, (raiseEpochByStage.get(stage) ?? 0) + 1)
    if (!stage.hasAttribute(CANVAS_DRAGGING_ATTRIBUTE)) {
      stage.setAttribute(CANVAS_DRAGGING_ATTRIBUTE, 'true')
    }
    armGestureEndGuard(stage)
    return
  }
  if (!owners?.delete(owner) || owners.size > 0) return
  draggingOwnersByStage.delete(stage)
  gestureEndGuardByStage.get(stage)?.()
  stage.removeAttribute(CANVAS_DRAGGING_ATTRIBUTE)
}
