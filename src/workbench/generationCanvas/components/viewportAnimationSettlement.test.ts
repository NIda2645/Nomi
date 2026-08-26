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
})
