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
      read('../onboarding/OnboardingFloatingPanel.tsx'),
      read('../../workbench/taskCenter/TaskCenterPanel.tsx'),
      read('../../workbench/onboarding/OnboardingChecklist.tsx'),
    ]) {
      expect(source).toContain('currentWorkbenchFloatingTopOffset')
    }
  })
})
