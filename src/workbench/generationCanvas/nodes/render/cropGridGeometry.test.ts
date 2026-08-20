import { describe, expect, it } from 'vitest'
import { computeGridCells, computeSplitLayout } from './cropGridGeometry'

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

describe('computeSplitLayout（排布：行列对齐 + 绝不重叠）', () => {
  const grid = (n: number) => computeGridCells({ x: 0, y: 0, w: 1, h: 1 }, cuts(n), cuts(n))
  const cuts = (n: number) => Array.from({ length: n - 1 }, (_, i) => (i + 1) / n)
  const same = (count: number, width: number, height: number) => Array.from({ length: count }, () => ({ width, height }))
  const overlaps = (boxes: { x: number; y: number; width: number; height: number }[]) => {
    let hits = 0
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) hits += 1
      }
    }
    return hits
  }

  it('九宫格等大瓦片：3 列 3 行、步距=尺寸+间距、零重叠', () => {
    const cells = grid(3)
    const boxes = computeSplitLayout(cells, same(9, 240, 240), { gap: 16 })
    expect(boxes).toHaveLength(9)
    expect([...new Set(boxes.map((b) => b.x))]).toEqual([0, 256, 512])
    expect([...new Set(boxes.map((b) => b.y))]).toEqual([0, 256, 512])
    expect(overlaps(boxes)).toBe(0)
  })

  // 「布局很乱」的回归锁：卡片实际渲染得比按比例算出来的格子大时，排布必须跟着卡片走。
  it('卡片被壳撑到地板尺寸时也不重叠（旧版按比例算格宽 → 九张互相压掉 110px）', () => {
    const cells = grid(3)
    const boxes = computeSplitLayout(cells, same(9, 240, 240), { gap: 16 })
    const pitchX = boxes[1].x - boxes[0].x
    expect(pitchX).toBeGreaterThanOrEqual(240)
    expect(overlaps(boxes)).toBe(0)
  })

  it('同列不等高：列宽取该列最宽、行高取该行最高，仍然行列对齐', () => {
    const cells = grid(2)
    const boxes = computeSplitLayout(cells, [
      { width: 240, height: 200 },
      { width: 300, height: 240 },
      { width: 240, height: 180 },
      { width: 260, height: 160 },
    ], { gap: 16 })
    expect(boxes[0].x).toBe(0)
    expect(boxes[1].x).toBe(256) // 第 2 列起点 = 第 1 列最宽(240) + gap
    expect(boxes[2].x).toBe(0)
    expect(boxes[2].y).toBe(256) // 第 2 行起点 = 第 1 行最高(240) + gap
    expect(overlaps(boxes)).toBe(0)
  })

  it('单格（裁剪退化）：一个盒子，原点对齐', () => {
    const cells = computeGridCells({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, [], [])
    expect(computeSplitLayout(cells, [{ width: 320, height: 200 }])).toEqual([{ x: 0, y: 0, width: 320, height: 200 }])
  })

  it('空输入不炸', () => {
    expect(computeSplitLayout([], [])).toEqual([])
  })
})
