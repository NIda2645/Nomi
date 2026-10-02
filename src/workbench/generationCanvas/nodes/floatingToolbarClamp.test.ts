import { describe, expect, it } from 'vitest'
import { floatingToolbarShift } from './floatingToolbarClamp'

// 舞台 [60, 860]（右边是 Agent 面板），浮条 700 宽。
const stage = { min: 68, max: 852 }
const at = (left: number, appliedShift = 0) => floatingToolbarShift({ rectLeft: left + appliedShift, rectRight: left + 700 + appliedShift, appliedShift, ...stage })

describe('floatingToolbarShift', () => {
  it('完整在舞台里：不动', () => { expect(at(100)).toBe(0) })
  it('节点贴左边，浮条左边出了舞台：右移到刚好露出', () => { expect(at(-40)).toBe(108) })
  it('节点贴右边，浮条右边压到右面板底下：左移到刚好露出', () => { expect(at(300)).toBe(-148) })
  it('画布平移回来之后，上一次的位移自己归零', () => { expect(at(100, 108)).toBe(0) })
  it('已经位移过的浮条再算一次结果不变（幂等）', () => { expect(at(-40, 108)).toBe(108) })
  it('浮条比舞台还宽：左对齐', () => {
    expect(floatingToolbarShift({ rectLeft: 0, rectRight: 900, appliedShift: 0, ...stage })).toBe(68)
  })
})
