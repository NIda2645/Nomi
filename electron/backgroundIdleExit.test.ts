import { describe, expect, it, vi } from 'vitest'

import { createBackgroundIdleExit } from './backgroundIdleExit'
import { taskCache, hasInFlightTasks } from './tasks/taskCache'

describe('background idle exit', () => {
  it('does not exit while a production task is in flight', () => {
    vi.useFakeTimers()
    const quit = vi.fn()
    let active = true
    const idle = createBackgroundIdleExit({ hasInFlightWork: () => active, quit })
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(quit).not.toHaveBeenCalled()
    active = false
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(idle.isWindowUnshown()).toBe(true)
    idle.dispose()
    vi.useRealTimers()
  })

  it('exits after ten idle minutes only if the background window was never shown', () => {
    vi.useFakeTimers()
    const quit = vi.fn()
    const idle = createBackgroundIdleExit({ hasInFlightWork: () => false, quit })
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(quit).toHaveBeenCalledTimes(1)
    idle.dispose()

    const shownQuit = vi.fn()
    const shown = createBackgroundIdleExit({ hasInFlightWork: () => false, quit: shownQuit })
    shown.markWindowShown()
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(shownQuit).not.toHaveBeenCalled()
    shown.dispose()
    vi.useRealTimers()
  })

  it('resets the idle deadline after every MCP activity', () => {
    vi.useFakeTimers()
    const quit = vi.fn()
    const idle = createBackgroundIdleExit({ hasInFlightWork: () => false, quit })
    vi.advanceTimersByTime(9 * 60 * 1000)
    idle.touch()
    vi.advanceTimersByTime(9 * 60 * 1000)
    expect(quit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60 * 1000)
    expect(quit).toHaveBeenCalledTimes(1)
    idle.dispose()
    vi.useRealTimers()
  })
  it('counts direct async generation entries as in-flight work', () => {
    const id = 'background-direct-task'
    taskCache.set(id, {});
    expect(hasInFlightTasks()).toBe(true)
    taskCache.delete(id)
    expect(hasInFlightTasks()).toBe(false)
  })

})
