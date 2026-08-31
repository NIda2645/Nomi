import { describe, expect, it, vi } from 'vitest'
import { createViewportAnimationSettlement } from '../components/viewportAnimationSettlement'
import { createComposerPanRequestLatch } from './composerPanRequestLifecycle'

describe('composer pan request lifecycle', () => {
  it('can request pan again after an external fit cancels the first animation and acknowledges it', () => {
    const onReleased = vi.fn()
    const latch = createComposerPanRequestLatch(onReleased)
    const firstAck = latch.tryAcquire()

    expect(firstAck).toEqual(expect.any(Function))
    expect(latch.tryAcquire()).toBeNull()

    const interruptedPan = createViewportAnimationSettlement(() => firstAck?.())
    interruptedPan.settle('cancelled')

    expect(onReleased).toHaveBeenCalledTimes(1)
    expect(latch.tryAcquire()).toEqual(expect.any(Function))
  })

  it('treats a repeated acknowledgement as the same completed request', () => {
    const onReleased = vi.fn()
    const latch = createComposerPanRequestLatch(onReleased)
    const acknowledge = latch.tryAcquire()

    acknowledge?.()
    acknowledge?.()

    expect(onReleased).toHaveBeenCalledTimes(1)
  })

  it('does not release or reacquire on an intermediate zero-delta measurement', () => {
    const onReleased = vi.fn()
    const latch = createComposerPanRequestLatch(onReleased)
    const acknowledge = latch.tryAcquire()

    // A zero geometry sample while the viewport animation is between frames only means
    // "do not dispatch another request". It is not ownership acknowledgement.
    latch.observeNoRequest()
    expect(latch.tryAcquire()).toBeNull()
    expect(onReleased).not.toHaveBeenCalled()

    acknowledge?.()
    expect(onReleased).toHaveBeenCalledTimes(1)
    expect(latch.tryAcquire()).toEqual(expect.any(Function))
  })
})
