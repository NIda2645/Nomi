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
    // Workspace slots stay mounted while hidden. Observe only this origin's ancestor chain;
    // no global scan, timer, or other stage can release this lease.
    if (typeof MutationObserver !== 'undefined') {
      const ancestors: Element[] = []
      for (let element: Element | null = origin; element; element = element.parentElement) ancestors.push(element)
      const observer = new MutationObserver(() => {
        if (!origin.isConnected || ancestors.some(element => element.hasAttribute('hidden') || getComputedStyle(element).display === 'none' || getComputedStyle(element).visibility === 'hidden')) cancel()
      })
      for (const element of ancestors) observer.observe(element, { attributes: true, attributeFilter: ['hidden', 'style', 'class'], childList: true })
      cleanup.push(() => observer.disconnect())
    }
  }
  return { activate, release, cancel }
}
