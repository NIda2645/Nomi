// 滚轮命中判定：从 target 往上找主轴上的真实可滚祖先（到 boundary 为止）。
// 找到 = 整次 wheel 始终归内部区域（卡内提示词编辑器等），画布不缩放/不平移；
// 即使内部已经到顶/到底也不能把同一个手势交回画布，否则用户会突然找不到节点。
//
// 两处根治（审计 P3）：
// 1) **横轴支持**：旧版只查 overflowY/scrollHeight/deltaY；调用方却按 dominant=max(|dy|,|dx|)
//    喂进来——横向 dominant 时仍按纵轴判定必返 false，触控板横滑卡内横向滚区会被画布误平移。
//    现按主轴（dominantAxis）分别查 overflowX/scrollWidth 或 overflowY/scrollHeight。
// 2) **去掉热路径里逐级 getComputedStyle**：wheel 是高频热路径，每 tick 逐级 getComputedStyle
//    会强制 style 重算（与「丝滑」相悖）。overflow 这种 CSS 属性几乎不随滚动变化，按元素
//    缓存一次（OVERFLOW_CACHE），后续 tick 直接命中缓存，不再反复触发重排。
// 几何判定（该轴是否拥有滚轮手势）抽成纯函数 elementOwnsWheelGesture，可单测、无 DOM 依赖。

export type ScrollAxis = 'x' | 'y'

/** 主滚动轴 = |dx| 与 |dy| 较大者；相等偏向纵轴（与旧 max(|dy|,|dx|) 行为一致）。 */
export function dominantAxis(deltaX: number, deltaY: number): { axis: ScrollAxis; delta: number } {
  return Math.abs(deltaX) > Math.abs(deltaY)
    ? { axis: 'x', delta: deltaX }
    : { axis: 'y', delta: deltaY }
}

export type AxisScrollMetrics = {
  /** 该轴的 overflow 计算值（overflowX 或 overflowY）。 */
  overflow: string
  /** 该轴可滚动内容尺寸（scrollWidth 或 scrollHeight）。 */
  scrollSize: number
  /** 该轴可视尺寸（clientWidth 或 clientHeight）。 */
  clientSize: number
}

/**
 * 纯几何判定：给定某元素在主轴上的 overflow/尺寸与滚动 delta，
 * 它是否拥有这次滚轮手势。
 * - overflow 必须是 auto/scroll（visible/hidden 即便内容溢出也不会滚）。
 * - scrollSize 须大于 clientSize（有可滚内容）。
 * - 只要该轴真实可滚，顶部/底部也继续拥有手势；delta=0 不消费。
 */
export function elementOwnsWheelGesture(metrics: AxisScrollMetrics, delta: number): boolean {
  if (delta === 0) return false
  return (metrics.overflow === 'auto' || metrics.overflow === 'scroll') && metrics.scrollSize > metrics.clientSize
}

// 每元素 overflow 缓存：避免 wheel 热路径逐级 getComputedStyle 触发的强制 style 重算。
// class/style 是 overflow 最常见的运行时变更入口；把它们纳入签名，切换条件 class 或 inline style
// 后会自动重读，避免把旧的 auto/scroll 继续当成可滚区而吞掉画布滚轮。元素被 GC 时自动清理（WeakMap）。
const OVERFLOW_CACHE = new WeakMap<HTMLElement, { className: string; style: string; x: string; y: string }>()

function readOverflow(el: HTMLElement): { x: string; y: string } {
  const className = el.className
  const inlineStyle = el.getAttribute('style') ?? ''
  const cached = OVERFLOW_CACHE.get(el)
  if (cached && cached.className === className && cached.style === inlineStyle) return { x: cached.x, y: cached.y }
  const computedStyle = window.getComputedStyle(el)
  const value = { x: computedStyle.overflowX, y: computedStyle.overflowY }
  OVERFLOW_CACHE.set(el, { className, style: inlineStyle, ...value })
  return value
}

export function findScrollableAncestor(
  target: Element,
  boundary: HTMLElement | null,
  deltaX: number,
  deltaY: number,
): boolean {
  const { axis, delta } = dominantAxis(deltaX, deltaY)
  let el: Element | null = target
  while (el && el !== boundary) {
    if (el instanceof HTMLElement) {
      const overflow = readOverflow(el)
      const metrics: AxisScrollMetrics = axis === 'x'
        ? { overflow: overflow.x, scrollSize: el.scrollWidth, clientSize: el.clientWidth }
        : { overflow: overflow.y, scrollSize: el.scrollHeight, clientSize: el.clientHeight }
      // 滚轮从真实可滚区开始后，哪怕已经到边界也仍归该区域，不能穿透给画布。
      if (elementOwnsWheelGesture(metrics, delta)) return true
    }
    el = el.parentElement
  }
  return false
}
