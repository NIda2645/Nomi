import { describe, expect, it } from 'vitest'
import { dominantAxis, elementOwnsWheelGesture } from './canvasScroll'

describe('dominantAxis — 按 |dx| vs |dy| 选主轴（含正负方向）', () => {
  it('纵向占优 → 返回 y 轴及其 delta', () => {
    expect(dominantAxis(2, -30)).toEqual({ axis: 'y', delta: -30 })
    expect(dominantAxis(-5, 40)).toEqual({ axis: 'y', delta: 40 })
  })
  it('横向占优 → 返回 x 轴及其 delta（触控板横滑场景）', () => {
    expect(dominantAxis(50, 3)).toEqual({ axis: 'x', delta: 50 })
    expect(dominantAxis(-44, 10)).toEqual({ axis: 'x', delta: -44 })
  })
  it('相等时按 y（与原 max(|dy|,|dx|) 偏向纵轴一致）', () => {
    expect(dominantAxis(20, 20)).toEqual({ axis: 'y', delta: 20 })
  })
})

describe('elementOwnsWheelGesture — 内部滚动区在边界处也拥有滚轮手势', () => {
  const scrollableY = { overflow: 'auto', scrollSize: 500, clientSize: 200 }
  const scrollableX = { overflow: 'scroll', scrollSize: 800, clientSize: 300 }

  it('overflow 非 auto/scroll → 永远不滚（即便内容溢出）', () => {
    expect(elementOwnsWheelGesture({ overflow: 'visible', scrollSize: 999, clientSize: 100 }, 30)).toBe(false)
    expect(elementOwnsWheelGesture({ overflow: 'hidden', scrollSize: 999, clientSize: 100 }, 30)).toBe(false)
  })

  it('scrollSize 不超过 clientSize → 不可滚', () => {
    expect(elementOwnsWheelGesture({ overflow: 'auto', scrollSize: 200, clientSize: 200 }, 30)).toBe(false)
  })

  it('纵向和横向的真实滚动区都拥有对应轴的手势', () => {
    expect(elementOwnsWheelGesture(scrollableY, 30)).toBe(true)
    expect(elementOwnsWheelGesture(scrollableX, 30)).toBe(true)
  })

  it('正负方向都由内部区域消费；当前位置不参与判定，因此顶部/底部不会穿透', () => {
    expect(elementOwnsWheelGesture(scrollableY, 30)).toBe(true)
    expect(elementOwnsWheelGesture(scrollableY, -30)).toBe(true)
  })

  it('delta 为 0 → 不消费（交画布）', () => {
    expect(elementOwnsWheelGesture(scrollableY, 0)).toBe(false)
  })
})
