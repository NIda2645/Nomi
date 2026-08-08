// 画布指针仲裁的**唯一真相表**（纯函数，靠单测锁真值表；hook 只负责临时状态与副作用）。
//
// 2026-08-08 用户真机拍板，反转 08-07 的 selection-first：画布的主导作用是**看图**，
// 平移是每分钟都在做的高频动作、框选是低频批量动作。高频动作必须占默认手势，
// 低频动作退到修饰键后（Shift）——这是 ComfyUI / Figma / Miro 的最大公约数。
export const CANVAS_DRAG_THRESHOLD = 4

// 「画布空白」的反向定义：命中这些元素就不是空白，指针归它们自己（节点、工具条、边命中区、菜单、表单控件）。
// 收在模型层是为了让「谁算空白」只有一处定义——平移与框选共用同一张表，语义不会漂移。
export const CANVAS_INTERACTIVE_TARGET_SELECTOR =
  '.generation-canvas-v2-node, .generation-canvas-v2-toolbar, .generation-canvas-v2__zoom-bar, .generation-canvas-v2__minimap, .generation-canvas-v2__selection-toolbar, .generation-canvas-v2__edge-hit, .generation-canvas-v2__edge-cut, .generation-canvas-v2__edge-control, button, input, textarea, select, [role="menu"], [role="menuitem"]'

export function isCanvasInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element ? Boolean(target.closest(CANVAS_INTERACTIVE_TARGET_SELECTOR)) : false
}

export type CanvasPointerDownAction = 'pan' | 'marquee' | 'ignore'

type CanvasPointerDownInput = {
  button: number
  spaceHeld: boolean
  shiftKey: boolean
  interactiveTarget: boolean
  readOnly: boolean
}

/**
 * 一次 pointerdown 该干嘛。只读事件事实，不碰 DOM：
 *   · 空格 / 中键 / 右键 → 平移（压在节点上也生效，capture 阶段就抢）
 *   · Shift + 左键（空白）→ 框选（追加；只读态没有选区可改，忽略）
 *   · 左键（空白）→ 平移。只读态同样放行——看图的人更需要能拖。
 */
export function resolveCanvasPointerDownAction(input: CanvasPointerDownInput): CanvasPointerDownAction {
  if (input.spaceHeld || input.button === 1 || input.button === 2) return 'pan'
  if (input.button !== 0 || input.interactiveTarget) return 'ignore'
  if (!input.shiftKey) return 'pan'
  return input.readOnly ? 'ignore' : 'marquee'
}

/**
 * capture 阶段只接「压在节点上也要平移」的三个入口。空白左键平移**必须**留到 bubble 阶段——
 * capture 抢在节点/控件的 pointerdown 之前，在那里接左键等于把节点拖拽和按钮点击一起吞掉。
 */
export function isCanvasCapturePanPointer(input: { button: number; spaceHeld: boolean }): boolean {
  return input.spaceHeld || input.button === 1 || input.button === 2
}

/**
 * 主指针已经按下后才形成的平移和弦（指针从别处滑进 stage、或按下左键后再补按空格/中键）。
 * **不含裸左键**：裸左键此刻可能正在框选或拖节点，在 move 里认领它会把那两件事劫走。
 */
export function resolveCanvasPanButtonFromMove(input: {
  buttons: number
  spaceHeld: boolean
}): 0 | 1 | 2 | null {
  if ((input.buttons & 2) !== 0) return 2
  if ((input.buttons & 4) !== 0) return 1
  if (input.spaceHeld && (input.buttons & 1) !== 0) return 0
  return null
}

/** 平移是否还该继续：只问发起它的那颗键还按着没。空格中途松开由 keyup 单独收尾（见 useCanvasViewportGestures）。 */
export function isCanvasPanButtonHeld(button: 0 | 1 | 2, input: { buttons: number }): boolean {
  if (button === 2) return (input.buttons & 2) !== 0
  if (button === 1) return (input.buttons & 4) !== 0
  return (input.buttons & 1) !== 0
}

export function canvasDragExceededThreshold(startX: number, startY: number, x: number, y: number): boolean {
  return Math.abs(x - startX) >= CANVAS_DRAG_THRESHOLD || Math.abs(y - startY) >= CANVAS_DRAG_THRESHOLD
}

export function shouldFinishCanvasConnection(button: number, pointerUpConsumed = false): boolean {
  return button === 0 && !pointerUpConsumed
}

export function shouldPreventDefaultForCanvasPanStart(button: number): boolean {
  return button !== 2
}

export function isMacCanvasPlatform(platform: string): boolean {
  return /(Mac|iPhone|iPad|iPod)/i.test(platform)
}

export function isCanvasContextMenuPointer(button: number, ctrlKey: boolean, platform: string): boolean {
  return button === 2 || (button === 0 && ctrlKey && isMacCanvasPlatform(platform))
}
