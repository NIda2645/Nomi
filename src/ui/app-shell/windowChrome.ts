export const WORKBENCH_TOPBAR_HEIGHT = 56
export const WINDOWS_WINDOWBAR_HEIGHT = 32

export function workbenchFloatingTopOffset(platform: string | undefined, gap = 8): number {
  const windowbarHeight = platform === 'win32' ? WINDOWS_WINDOWBAR_HEIGHT : 0
  return windowbarHeight + WORKBENCH_TOPBAR_HEIGHT + gap
}

export function currentWorkbenchFloatingTopOffset(gap = 8): number {
  const platform = typeof window === 'undefined' ? undefined : window.nomiDesktop?.platform
  return workbenchFloatingTopOffset(platform, gap)
}
