import { describe, expect, it } from 'vitest'
import { getWheelZoomFactor } from './wheelZoom'

describe('shared canvas wheel sensitivity', () => {
  it.each([-1, 1])('pixel/line/page units have equivalent zoom at direction %s', (direction) => {
    const pixel = getWheelZoomFactor({ deltaY: direction * 96, deltaMode: 0 })
    expect(getWheelZoomFactor({ deltaY: direction * 6, deltaMode: 1 })).toBe(pixel)
    expect(getWheelZoomFactor({ deltaY: direction * 0.12, deltaMode: 2 })).toBe(pixel)
  })
  it('keeps the generation canvas 1.24 factor and bounds huge wheel events', () => {
    expect(getWheelZoomFactor({ deltaY: -120, deltaMode: 0 })).toBe(1.24)
    expect(getWheelZoomFactor({ deltaY: -100000, deltaMode: 0 })).toBe(1.24)
    expect(getWheelZoomFactor({ deltaY: 100000, deltaMode: 0 })).toBe(1 / 1.24)
  })
  it('preserves fine trackpad deltas and treats horizontal-only/zero input as no zoom', () => {
    expect(getWheelZoomFactor({ deltaY: 0, deltaMode: 0 })).toBe(1)
    const fine = getWheelZoomFactor({ deltaY: -0.5, deltaMode: 0 })
    expect(fine).toBeGreaterThan(1)
    expect(fine).toBeLessThan(getWheelZoomFactor({ deltaY: -1, deltaMode: 0 }))
  })
})
