import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { workbenchFloatingTopOffset } from './windowChrome'

const read = (relativePath: string): string => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')

describe('workbench floating surface top offset', () => {
  it('leaves the Windows self-drawn windowbar and app bar clear', () => {
    expect(workbenchFloatingTopOffset('win32')).toBe(96)
    expect(workbenchFloatingTopOffset('win32', 12)).toBe(100)
  })

  it('keeps the existing topbar baseline on native-chrome platforms', () => {
    expect(workbenchFloatingTopOffset('darwin')).toBe(64)
    expect(workbenchFloatingTopOffset(undefined, 12)).toBe(68)
  })

  it('keeps drag semantics on the dedicated windowbar and routes top floating surfaces through one offset', () => {
    const appBar = read('./NomiAppBar.tsx')
    expect(appBar).not.toContain("isWindows && 'app-drag'")
    expect(appBar).not.toContain('handleWindowTitlebarDoubleClick')

    for (const source of [
      read('../../NomiAppProviders.tsx'),
      read('../../workbench/taskCenter/TaskCenterPanel.tsx'),
      read('../../workbench/onboarding/OnboardingChecklist.tsx'),
    ]) {
      expect(source).toContain('currentWorkbenchFloatingTopOffset')
    }
  })
})

// issue #58（Windows v0.19.0）：Portal 浮卡右上角的 × 点中心没反应，偏上下才灵。
// 根因是 Windows frame:false + 自绘窗口栏，拖拽区靠 -webkit-app-region 命中测试划出来，
// 而命中测试**看几何、不看 DOM 层级**：Portal 到 body 的浮层不是窗口栏的后代，
// 拿不到窗口栏内那条 `.app-drag button` 豁免，压在拖拽带上的按钮点击就被系统当成拖窗口吃掉。
const PORTAL_FLOATING_SURFACES = [
  ['任务中心浮卡', '../../workbench/taskCenter/TaskCenterPanel.tsx'],
] as const

describe('Portal 浮层不被 Windows 拖拽区吃掉点击（issue #58）', () => {
  it.each(PORTAL_FLOATING_SURFACES)('%s 整体退出拖拽区', (_name, file) => {
    // 挂在根上即可：tailwind 的 `.app-no-drag *` 覆盖全部后代，关闭按钮不必单独标。
    expect(read(file)).toContain('app-no-drag')
  })

  it.each(PORTAL_FLOATING_SURFACES)('%s 的顶部偏移在渲染时现算，不在模块作用域定死', (_name, file) => {
    // 模块常量在 import 求值那一刻定死：那时若 window.nomiDesktop 还没挂上，platform 是
    // undefined → 悄悄回落成 mac 的 64px，Windows 上整张浮卡上移 32px 贴进窗口栏。
    // 这类「拿运行时输入却在模块作用域算一次」的写法，别处再犯也会以同样方式静默错位。
    expect(read(file)).not.toMatch(/^const\s+TOP_OFFSET\s*=/m)
  })
})
