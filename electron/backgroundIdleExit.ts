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
  now?: () => number
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
  idleMs?: number
}): BackgroundIdleExit {
  const now = options.now ?? (() => Date.now())
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay))
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer))
  const idleMs = options.idleMs ?? BACKGROUND_IDLE_EXIT_MS
  let lastActivityAt = now()
  let windowShown = !options.isBackground
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = () => {
    if (!options.isBackground || windowShown) return
    if (timer !== undefined) clearTimer(timer)
    timer = setTimer(() => {
      timer = undefined
      if (!windowShown && !options.hasInFlightWork() && now() - lastActivityAt >= idleMs) options.quit()
      else schedule()
    }, idleMs)
  }

  const touch = (at = now()) => {
    lastActivityAt = at
    schedule()
  }
  const markWindowShown = () => {
    windowShown = true
    if (timer !== undefined) clearTimer(timer)
    timer = undefined
  }
  const dispose = () => {
    if (timer !== undefined) clearTimer(timer)
    timer = undefined
  }

  schedule()
  return { touch, markWindowShown, dispose, isWindowUnshown: () => options.isBackground && !windowShown }
}


let activeBackgroundIdleExit: BackgroundIdleExit | null = null
export function setBackgroundIdleExitOwner(owner: BackgroundIdleExit | null): void { activeBackgroundIdleExit = owner }
export function isBackgroundWindowUnshown(): boolean { return activeBackgroundIdleExit?.isWindowUnshown() ?? false }
