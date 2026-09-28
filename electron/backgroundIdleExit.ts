export const BACKGROUND_IDLE_EXIT_MS = 10 * 60 * 1000

export type BackgroundIdleExit = {
  touch: (now?: number) => void
  markWindowShown: () => void
  dispose: () => void
  isWindowUnshown: () => boolean
}

export function createBackgroundIdleExit(options: {
  isBackground: boolean
  hasInFlightWork: () => boolean
  quit: () => void
}): BackgroundIdleExit {
  let lastActivityAt = Date.now()
  let windowShown = !options.isBackground
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = () => {
    if (!options.isBackground || windowShown) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (!windowShown && !options.hasInFlightWork() && Date.now() - lastActivityAt >= BACKGROUND_IDLE_EXIT_MS) options.quit()
      else schedule()
    }, BACKGROUND_IDLE_EXIT_MS)
  }

  const touch = (at = Date.now()) => {
    lastActivityAt = at
    schedule()
  }
  const markWindowShown = () => {
    windowShown = true
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  const dispose = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  schedule()
  return { touch, markWindowShown, dispose, isWindowUnshown: () => options.isBackground && !windowShown }
}


let activeBackgroundIdleExit: BackgroundIdleExit | null = null
export function setBackgroundIdleExitOwner(owner: BackgroundIdleExit | null): void { activeBackgroundIdleExit = owner }
export function isBackgroundWindowUnshown(): boolean { return activeBackgroundIdleExit?.isWindowUnshown() ?? false }
