import { describe, expect, it } from 'vitest'
import { resolvePastePlacement } from './useCanvasPastePlacement'

const stageRect = { left: 100, top: 50, right: 1100, bottom: 750, width: 1000, height: 700 }
// 假内核：画布坐标 = (屏幕 - 舞台左上) / 0.5 - 200，用来证明换算走的是传进来的内核而不是本地手算。
const toCanvasPoint = (x: number, y: number) => ({ x: (x - 100) / 0.5 - 200, y: (y - 50) / 0.5 - 200 })

describe('paste placement', () => {
  it('uses the last pointer position inside the stage, centred', () => {
    const placement = resolvePastePlacement({ lastPointer: { x: 900, y: 600 }, stageRect, toCanvasPoint })
    expect(placement).toEqual({ point: { x: 1400, y: 900 }, anchor: { xRatio: 0.5, yRatio: 0.5 } })
  })

  it('falls back to the stage centre when the pointer is outside the stage (or unknown)', () => {
    const centre = { point: { x: 800, y: 500 }, anchor: { xRatio: 0.5, yRatio: 0.5 } }
    expect(resolvePastePlacement({ lastPointer: { x: 40, y: 600 }, stageRect, toCanvasPoint })).toEqual(centre)
    expect(resolvePastePlacement({ lastPointer: null, stageRect, toCanvasPoint })).toEqual(centre)
  })

  it('returns null before the stage is measured', () => {
    expect(resolvePastePlacement({ lastPointer: { x: 1, y: 1 }, stageRect: { ...stageRect, width: 0 }, toCanvasPoint })).toBeNull()
  })
})
