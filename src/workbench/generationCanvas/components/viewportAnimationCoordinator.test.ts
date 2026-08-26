import { describe, expect, it, vi } from 'vitest'
import { createViewportAnimationCoordinator } from './viewportAnimationCoordinator'

function createFrameHarness() {
  let nextId = 1
  const frames = new Map<number, FrameRequestCallback>()
  return {
    frames,
    requestFrame(callback: FrameRequestCallback) {
      const id = nextId
      nextId += 1
      frames.set(id, callback)
      return id
    },
    cancelFrame(id: number) {
      frames.delete(id)
    },
  }
}

describe('viewport animation coordinator ownership', () => {
  it('keeps only the reentrant latest animation when cancelling the previous owner', () => {
    const frameHarness = createFrameHarness()
    const firstSettled = vi.fn()
    const reentrantSettled = vi.fn()
    const outerSettled = vi.fn()
    const coordinator = createViewportAnimationCoordinator({
      ...frameHarness,
      readViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      writeViewport: vi.fn(),
    })

    coordinator.animateTo(1, { x: 0, y: 20 }, 160, (outcome) => {
      firstSettled(outcome)
      coordinator.animateTo(1, { x: 0, y: 40 }, 160, reentrantSettled)
    })
    const firstFrame = [...frameHarness.frames.keys()]
    expect(firstFrame).toHaveLength(1)

    coordinator.animateTo(1, { x: 0, y: 60 }, 160, outerSettled)

    expect(firstSettled).toHaveBeenCalledExactlyOnceWith('cancelled')
    expect(outerSettled).not.toHaveBeenCalled()
    expect(frameHarness.frames).toHaveLength(1)

    expect(coordinator.takeOwnershipAndCancel()).toBe(true)
    expect(frameHarness.frames).toHaveLength(0)
    expect(reentrantSettled).toHaveBeenCalledExactlyOnceWith('cancelled')
  })

  it.each(['direct transform', 'scheduled offset'])('%s yields to an animation reentered from cancellation', () => {
    const frameHarness = createFrameHarness()
    const directWrite = vi.fn()
    const reentrantSettled = vi.fn()
    const coordinator = createViewportAnimationCoordinator({
      ...frameHarness,
      readViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      writeViewport: vi.fn(),
    })

    coordinator.animateTo(1, { x: 0, y: 20 }, 160, () => {
      coordinator.animateTo(1, { x: 0, y: 40 }, 160, reentrantSettled)
    })

    if (coordinator.takeOwnershipAndCancel()) directWrite()

    expect(directWrite).not.toHaveBeenCalled()
    expect(frameHarness.frames).toHaveLength(1)
    expect(coordinator.takeOwnershipAndCancel()).toBe(true)
    expect(reentrantSettled).toHaveBeenCalledExactlyOnceWith('cancelled')
    expect(frameHarness.frames).toHaveLength(0)
  })

  it('keeps the reentrant replacement animation owned when the cancelled callback throws', () => {
    const frameHarness = createFrameHarness()
    const replacementSettled = vi.fn()
    const outerSettled = vi.fn()
    const reportSettlementError = vi.fn()
    const settlementError = new Error('legacy viewport settlement failed')
    const coordinator = createViewportAnimationCoordinator({
      ...frameHarness,
      readViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      writeViewport: vi.fn(),
      reportSettlementError,
    })

    coordinator.animateTo(1, { x: 0, y: 20 }, 160, () => {
      coordinator.animateTo(1, { x: 0, y: 40 }, 160, replacementSettled)
      throw settlementError
    })

    expect(() => coordinator.animateTo(1, { x: 0, y: 60 }, 160, outerSettled)).not.toThrow()
    expect(outerSettled).not.toHaveBeenCalled()
    expect(frameHarness.frames).toHaveLength(1)

    expect(coordinator.takeOwnershipAndCancel()).toBe(true)
    expect(replacementSettled).toHaveBeenCalledExactlyOnceWith('cancelled')
    expect(reportSettlementError).toHaveBeenCalledExactlyOnceWith(settlementError)
    expect(frameHarness.frames).toHaveLength(0)
  })

  it.each(['direct transform', 'scheduled offset'])('%s survives a throwing cancellation callback', () => {
    const frameHarness = createFrameHarness()
    const commandWrite = vi.fn()
    const reportSettlementError = vi.fn()
    const settlementError = new Error('legacy viewport settlement failed')
    const coordinator = createViewportAnimationCoordinator({
      ...frameHarness,
      readViewport: () => ({ zoom: 1, offset: { x: 0, y: 0 } }),
      writeViewport: vi.fn(),
      reportSettlementError,
    })

    coordinator.animateTo(1, { x: 0, y: 20 }, 160, () => {
      throw settlementError
    })

    expect(() => {
      if (coordinator.takeOwnershipAndCancel()) commandWrite()
    }).not.toThrow()
    expect(commandWrite).toHaveBeenCalledOnce()
    expect(reportSettlementError).toHaveBeenCalledExactlyOnceWith(settlementError)
    expect(frameHarness.frames).toHaveLength(0)
  })
})
