import { describe, expect, it } from 'vitest'
import { computeGridCells } from './cropGridGeometry'

const FULL = { x: 0, y: 0, w: 1, h: 1 }

describe('computeGridCells', () => {
  it('裁剪退化：无分割线 → 1 个 cell，等于外框本身', () => {
    const cells = computeGridCells({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, [], [])
    expect(cells).toHaveLength(1)
    expect(cells[0]).toMatchObject({ row: 0, column: 0 })
    expect(cells[0].x).toBeCloseTo(0.1)
    expect(cells[0].y).toBeCloseTo(0.2)
    expect(cells[0].w).toBeCloseTo(0.5)
    expect(cells[0].h).toBeCloseTo(0.4)
  })

  it('等分 2×2（默认线 0.5）→ 4 个等大 cell，证明＝旧等分行为', () => {
    const cells = computeGridCells(FULL, [0.5], [0.5])
    expect(cells).toHaveLength(4)
    for (const cell of cells) {
      expect(cell.w).toBeCloseTo(0.5)
      expect(cell.h).toBeCloseTo(0.5)
    }
    expect(cells.map((c) => [c.row, c.column])).toEqual([
      [0, 0], [0, 1], [1, 0], [1, 1],
    ])
  })

  it('等分 3×3（线 1/3,2/3）→ 9 个 cell，各 1/3', () => {
    const third = [1 / 3, 2 / 3]
    const cells = computeGridCells(FULL, third, third)
    expect(cells).toHaveLength(9)
    for (const cell of cells) {
      expect(cell.w).toBeCloseTo(1 / 3)
      expect(cell.h).toBeCloseTo(1 / 3)
    }
  })

  it('自定义线：把竖线拖到 0.7 → 左宽 0.7、右窄 0.3（不再等分）', () => {
    const cells = computeGridCells(FULL, [0.7], [0.5])
    expect(cells[0].w).toBeCloseTo(0.7)
    expect(cells[1].w).toBeCloseTo(0.3)
  })

  it('外框偏移 + 缩放：cell 是整图坐标，随框平移缩放', () => {
    const frame = { x: 0.2, y: 0.1, w: 0.6, h: 0.8 }
    const cells = computeGridCells(frame, [0.5], [])
    expect(cells).toHaveLength(2)
    expect(cells[0]).toMatchObject({ x: 0.2, y: 0.1, h: 0.8 })
    expect(cells[0].w).toBeCloseTo(0.3)
    expect(cells[1].x).toBeCloseTo(0.5)
    expect(cells[1].w).toBeCloseTo(0.3)
  })

  it('乱序传入的线也会被升序处理', () => {
    const cells = computeGridCells(FULL, [2 / 3, 1 / 3], [])
    expect(cells.map((c) => c.x)).toEqual([0, 1 / 3, 2 / 3])
  })
})
