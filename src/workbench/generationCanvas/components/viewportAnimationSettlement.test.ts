import { describe, expect, it, vi } from 'vitest'
import { createViewportAnimationSettlement } from './viewportAnimationSettlement'

describe('viewport animation settlement', () => {
  it('settles a naturally completed animation exactly once', () => {
    const onSettled = vi.fn()
    const settlement = createViewportAnimationSettlement(onSettled)

    expect(settlement.settle('completed')).toBe(true)
    expect(settlement.settle('completed')).toBe(false)
    expect(settlement.settle('cancelled')).toBe(false)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith('completed')
  })

  it('settles an animation cancelled by the next viewport command exactly once', () => {
    const onSettled = vi.fn()
    const settlement = createViewportAnimationSettlement(onSettled)

    expect(settlement.settle('cancelled')).toBe(true)
    expect(settlement.settle('completed')).toBe(false)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith('cancelled')
  })

  it('keeps legacy callers that do not provide a callback compatible', () => {
    const settlement = createViewportAnimationSettlement()

    expect(settlement.settle('completed')).toBe(true)
    expect(settlement.settle('cancelled')).toBe(false)
  })

  it('keeps exactly-once state when an external settlement callback throws', () => {
    const error = new Error('legacy viewport settlement failed')
    const onSettled = vi.fn(() => {
      throw error
    })
    const reportError = vi.fn()
    const settlement = createViewportAnimationSettlement(onSettled, reportError)

    expect(() => settlement.settle('cancelled')).not.toThrow()
    expect(settlement.settle('completed')).toBe(false)
    expect(onSettled).toHaveBeenCalledExactlyOnceWith('cancelled')
    expect(reportError).toHaveBeenCalledExactlyOnceWith(error)
  })

  it('reports through the browser error boundary when no reporter is injected', () => {
    const error = new Error('browser-visible settlement failure')
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    try {
      const settlement = createViewportAnimationSettlement(() => { throw error })
      expect(() => settlement.settle('completed')).not.toThrow()
      expect(reportError).toHaveBeenCalledExactlyOnceWith(error)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('falls back to namespaced console reporting when browser reportError is unavailable', () => {
    const error = new Error('fallback settlement failure')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('reportError', undefined)
    try {
      const settlement = createViewportAnimationSettlement(() => { throw error })
      expect(() => settlement.settle('cancelled')).not.toThrow()
      expect(consoleError).toHaveBeenCalledExactlyOnceWith('[nomi] viewport settlement callback failed:', error)
    } finally {
      vi.unstubAllGlobals()
      consoleError.mockRestore()
    }
  })
})
