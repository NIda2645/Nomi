import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetDeferredNodeMediaQueueForTests,
  __setDeferredNodeMediaLimitForTests,
  isDeferredVideoFrameReady,
  observeDeferredNodeMediaVisibility,
  requestDeferredNodeMediaSlot,
} from './deferredNodeMediaQueue'

describe('deferred node media queue', () => {
  afterEach(() => {
    __resetDeferredNodeMediaQueueForTests()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reveals video only after the browser has decoded current-frame data', () => {
    expect(isDeferredVideoFrameReady(1)).toBe(false)
    expect(isDeferredVideoFrameReady(2)).toBe(true)
    expect(isDeferredVideoFrameReady(4)).toBe(true)
  })

  it('limits image activation until an active slot is released', () => {
    __setDeferredNodeMediaLimitForTests('image', 2)
    const activated: string[] = []
    const releases: Array<() => void> = []

    requestDeferredNodeMediaSlot('image', (release) => {
      activated.push('first')
      releases.push(release)
    })
    requestDeferredNodeMediaSlot('image', (release) => {
      activated.push('second')
      releases.push(release)
    })
    requestDeferredNodeMediaSlot('image', (release) => {
      activated.push('third')
      releases.push(release)
    })

    expect(activated).toEqual(['first', 'second'])

    releases[0]()

    expect(activated).toEqual(['first', 'second', 'third'])
  })

  it('lets priority media move ahead of queued normal media', () => {
    __setDeferredNodeMediaLimitForTests('image', 1)
    const activated: string[] = []
    const releases: Array<() => void> = []

    requestDeferredNodeMediaSlot('image', (release) => {
      activated.push('active')
      releases.push(release)
    })
    requestDeferredNodeMediaSlot('image', (release) => {
      activated.push('normal')
      releases.push(release)
    })
    requestDeferredNodeMediaSlot(
      'image',
      (release) => {
        activated.push('priority')
        releases.push(release)
      },
      true,
    )

    releases[0]()

    expect(activated).toEqual(['active', 'priority'])
  })

  it('reprioritizes media that is already waiting in the queue', () => {
    __setDeferredNodeMediaLimitForTests('image', 1)
    const activated: string[] = []
    let releaseActive = () => {}

    requestDeferredNodeMediaSlot('image', (release) => {
      activated.push('active')
      releaseActive = release
    })
    requestDeferredNodeMediaSlot('image', () => {
      activated.push('normal-first')
    })
    const promoted = requestDeferredNodeMediaSlot('image', () => {
      activated.push('promoted')
    })

    promoted.setPriority(true)
    releaseActive()

    expect(activated).toEqual(['active', 'promoted'])
  })

  it('cancels active offscreen media and immediately releases its slot', () => {
    __setDeferredNodeMediaLimitForTests('video', 1)
    const activated: string[] = []

    const offscreen = requestDeferredNodeMediaSlot('video', () => {
      activated.push('offscreen')
    })
    requestDeferredNodeMediaSlot('video', () => {
      activated.push('visible')
    })

    offscreen.cancel()

    expect(activated).toEqual(['offscreen', 'visible'])
  })

  it('turns the active-slot watchdog into an observable timeout', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const activated: string[] = []

    __setDeferredNodeMediaLimitForTests('image', 1)
    requestDeferredNodeMediaSlot('image', () => activated.push('timed-out'), false, onTimeout)
    requestDeferredNodeMediaSlot('image', () => activated.push('next'))
    vi.advanceTimersByTime(8000)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(activated).toEqual(['timed-out', 'next'])
  })

  it('keeps video activation on its own lower concurrency lane', () => {
    __setDeferredNodeMediaLimitForTests('image', 2)
    __setDeferredNodeMediaLimitForTests('video', 1)
    const activated: string[] = []

    requestDeferredNodeMediaSlot('video', () => {
      activated.push('video-1')
    })
    requestDeferredNodeMediaSlot('video', () => {
      activated.push('video-2')
    })
    requestDeferredNodeMediaSlot('image', () => {
      activated.push('image-1')
    })

    expect(activated).toEqual(['video-1', 'image-1'])
  })

  it('tracks IntersectionObserver visibility until cleanup', () => {
    const cb = { current: null as IntersectionObserverCallback | null }
    const disconnect = vi.fn()
    const observe = vi.fn()
    class FakeIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        cb.current = callback
      }

      observe = observe
      disconnect = disconnect
    }
    vi.stubGlobal('window', { IntersectionObserver: FakeIntersectionObserver })
    const onVisibilityChange = vi.fn()
    const element = {} as Element

    const cleanup = observeDeferredNodeMediaVisibility(element, onVisibilityChange)

    expect(observe).toHaveBeenCalledWith(element)
    expect(onVisibilityChange).not.toHaveBeenCalled()

    cb.current?.(
      [{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false)

    cb.current?.(
      [{ isIntersecting: true, intersectionRatio: 0 } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true)
    expect(disconnect).not.toHaveBeenCalled()

    cb.current?.(
      [{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false)

    cleanup()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('falls back to immediate activation when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('window', {})
    const onVisibilityChange = vi.fn()

    observeDeferredNodeMediaVisibility({} as Element, onVisibilityChange)

    expect(onVisibilityChange).toHaveBeenCalledWith(true)
  })
})
