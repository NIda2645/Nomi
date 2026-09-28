/**
 * 键盘快捷键归哪一面（2026-09-22，核心冒烟「用过的项目」夹具当场抓到）。
 *
 * 生成页上画布和时间轴同时可见时，两边都在 window 上监听 keydown，而且都认领 ⌘Z / Delete。
 * 谁先注册谁赢：时间轴一展开（或者用户去过一次预览页，keep-alive 的那条时间轴还挂着），
 * 在画布上删了东西按 ⌘Z，撤的是时间轴，画布上删掉的编组框回不来。
 *
 * 不变量（唯一 owner 就是这个文件）：
 *   1. 看不见的面不认领任何快捷键（keep-alive 藏起来的那条时间轴不许吃键）。
 *   2. 同屏有两面时，最近一次指针落在哪一面，快捷键就归哪一面；落在别处（Agent 面板、顶栏）不改归属。
 *   3. 还没在任何一面上按过指针时，维持各面原来的行为（不凭空改变没有冲突的场景）。
 *
 * 面的标记：根元素上写 `data-shortcut-surface="<名字>"`。
 */

export const SHORTCUT_SURFACE_ATTRIBUTE = 'data-shortcut-surface'

let lastPointerSurface: Element | null = null
let installedOn: Window | null = null

function recordPointer(event: Event): void {
  const target = event.target as Partial<Element> | null
  if (typeof target?.closest !== 'function') return
  const surface = target.closest(`[${SHORTCUT_SURFACE_ATTRIBUTE}]`)
  if (surface) lastPointerSurface = surface
}

/** 幂等：同一个 window 只装一次，捕获期记录，任何浮层 stopPropagation 都挡不住。 */
export function installShortcutSurfaceTracker(target: Window = window): void {
  if (installedOn === target) return
  installedOn?.removeEventListener('pointerdown', recordPointer, true)
  target.addEventListener('pointerdown', recordPointer, true)
  installedOn = target
}

/** 面的根都是常规流里的块元素：`offsetParent === null` 就是它（或某个祖先）display:none——keep-alive 藏起来的那种。 */
function isShown(element: Element): boolean {
  if (element.isConnected === false) return false
  return (element as Partial<HTMLElement>).offsetParent !== null
}

/** 这一面此刻能不能认领一次快捷键。surface 为 null（面还没挂上）一律不认领。 */
export function shortcutSurfaceMayHandle(surface: Element | null): boolean {
  if (!surface || !isShown(surface)) return false
  const last = lastPointerSurface
  if (last && last !== surface && isShown(last)) return false
  return true
}

/** 仅供单测：回到「还没按过指针」。 */
export function resetShortcutSurfaceForTest(): void {
  lastPointerSurface = null
}
