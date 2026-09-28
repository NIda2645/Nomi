/**
 * 平台判断与快捷键提示里的修饰键字形。
 *
 * 2026-09-08 从 `generationCanvas/components/` 挪来（原名 `isMacCanvasPlatform` /
 * `canvasControlsHelpModel.platformModifier`）：判断的是**当前平台**，与画布无关，
 * 而时间轴菜单也要用——此前那里硬编码了 `⌘D`，Windows 上照样显示 ⌘
 * （`docs/plan/2026-09-08-menu-primitive-inventory.md` C10）。
 *
 * 放在 design 层是为了让「要显示快捷键」的界面只有这一个来源。
 * **任何新的快捷键提示都从 `platformModifier` derive，不要写字面量 ⌘。**
 */

export function isMacPlatform(platform: string): boolean {
  return /(Mac|iPhone|iPad|iPod)/i.test(platform)
}

export function platformModifier(platform: string): '⌘' | 'Ctrl' {
  return isMacPlatform(platform) ? '⌘' : 'Ctrl'
}

/**
 * Alt 键在提示里的写法：Mac 键帽印的是 ⌥ 和 Option（LibTV 快捷键面板同样写「Option 选项」），
 * Windows / Linux 是 Alt。事件层两者都是 `event.altKey`。
 */
export function platformAltKey(platform: string): '⌥ Option' | 'Alt' {
  return isMacPlatform(platform) ? '⌥ Option' : 'Alt'
}

/** Shift 在提示里的写法：Mac 键帽印 ⇧，Windows / Linux 写 Shift。 */
export function platformShiftKey(platform: string): '⇧' | 'Shift' {
  return isMacPlatform(platform) ? '⇧' : 'Shift'
}

/** 组合键里 Alt 的紧凑写法（⌥⇧F / Alt Shift F）。拖动手势那一行用上面的全称。 */
export function platformAltGlyph(platform: string): '⌥' | 'Alt' {
  return isMacPlatform(platform) ? '⌥' : 'Alt'
}
