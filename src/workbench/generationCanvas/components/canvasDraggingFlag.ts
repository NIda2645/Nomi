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

export type CanvasDragLease = { activate: () => void; release: () => void; cancel: () => void }
const draggingOwnersByStage = new WeakMap<Element, Set<symbol>>()

/**
 * 还没结束的那些租约。**只为「宿主把画布藏起来了」这一件事存在**。
 *
 * 2026-09-21：这里原来是给每一次手势装一个 MutationObserver，观测整条祖先链的
 * `attributes` + `childList`，回调里对十几层祖先逐个 `getComputedStyle()`。
 * React Flow 在拖动过程中持续增删 `.react-flow__viewport` 的子节点，于是那个回调**每帧**都触发，
 * 每帧强制一轮同步样式重算——正好落在团队把拖图从 49.3ms 压到 12.9ms 的那条热路径上。
 *
 * 而它要解决的问题（「工作区槽位隐藏时租约不释放」）根本不需要观测：**槽位隐藏是宿主自己知道的事**。
 * 所以改成宿主在隐藏路径上显式喊一声（`cancelCanvasDraggingWithin`），热路径上一个观察者都不装。
 */
const liveLeases = new Set<{ origin: Element; stage: Element | null | undefined; cancel: () => void }>()

/**
 * 把这个容器里所有还没结束的手势**当作被打断**收掉（宿主隐藏/卸载画布时调）。
 *
 * 与 pointercancel 走同一条 `cancel()`：属性摘掉、`onCancel` 照常回调，
 * 于是「藏起来」和「手指被系统抢走」在画布看来是同一件事——不需要第二套收尾语义。
 */
export function cancelCanvasDraggingWithin(container: Element | null | undefined): void {
  if (!container) return
  for (const lease of [...liveLeases]) {
    if (container.contains(lease.origin) || (lease.stage && container.contains(lease.stage))) lease.cancel()
  }
}

/** One lease captures one stage and one gesture. Late cleanup never looks up a new stage. */
export function beginCanvasDragging(
  origin: Element | null | undefined,
  owner: CanvasDraggingOwner,
  options: { onCancel?: () => void; pointerId?: number; active?: boolean } = {},
): CanvasDragLease {
  const stage = origin?.closest(STAGE_SELECTOR)
  const token = Symbol(owner)
  let released = false
  const cleanup: Array<() => void> = []
  const activate = () => {
    if (!stage || released) return
    const owners = draggingOwnersByStage.get(stage) ?? new Set<symbol>()
    draggingOwnersByStage.set(stage, owners)
    owners.add(token)
    stage.setAttribute(CANVAS_DRAGGING_ATTRIBUTE, 'true')
  }
  if (options.active !== false) activate()
  const release = () => {
    if (released) return
    released = true
    cleanup.forEach(dispose => dispose())
    const owners = stage && draggingOwnersByStage.get(stage)
    if (!owners?.delete(token) || owners.size) return
    draggingOwnersByStage.delete(stage!)
    stage!.removeAttribute(CANVAS_DRAGGING_ATTRIBUTE)
  }
  const cancel = () => {
    if (released) return
    release()
    options.onCancel?.()
  }
  if (origin && typeof window !== 'undefined') {
    const interrupted = (event: Event) => {
      // Capture also sees descendant focus changes; only window blur interrupts a gesture.
      if (event.type === 'blur' && event.target !== window) return
      if (event.type !== 'blur') {
        if ('pointerId' in event && options.pointerId !== undefined) {
          if (event.pointerId !== options.pointerId) return
        } else if (!(typeof Node !== 'undefined' && event.target instanceof Node && (origin.contains(event.target) || stage?.contains(event.target)))) return
      }
      cancel()
    }
    for (const name of ['blur', 'pointercancel', 'lostpointercapture']) {
      window.addEventListener(name, interrupted, true)
      cleanup.push(() => window.removeEventListener(name, interrupted, true))
    }
    const visibility = () => { if (document.hidden) cancel() }
    document.addEventListener('visibilitychange', visibility)
    cleanup.push(() => document.removeEventListener('visibilitychange', visibility))
    // 工作区槽位隐藏时仍然挂着（`hidden` 不卸载），所以「藏起来了」要由宿主显式喊一声，
    // 见 `cancelCanvasDraggingWithin`。登记只是一次 Set.add，热路径上零观察者、零 getComputedStyle。
    const record = { origin, stage, cancel: () => cancel() }
    liveLeases.add(record)
    cleanup.push(() => liveLeases.delete(record))
  }
  return { activate, release, cancel }
}
