import type { CropRect } from './ImageCropGridOverlay'

// 可调切图的纯几何：把「外框 rect + 框内分割线」换算成一组 image 归一化 cell。
// cols/rows 是「框内」切分分数（0~1，升序，长度 = gridSize-1；裁剪时为空）。
// 输出 cell 的 x/y/w/h 是「整图」归一化坐标，直接喂给 cropImageRegion。
// 裁剪 = 0 条线 = 1 个 cell（即外框本身）；这让裁剪与切图共用同一条确认路径（P1，不留两套）。

export type GridCell = {
  x: number
  y: number
  w: number
  h: number
  row: number
  column: number
}

function edges(start: number, span: number, cuts: number[]): number[] {
  const sorted = [...cuts].sort((a, b) => a - b)
  const result = [start]
  for (const cut of sorted) result.push(start + cut * span)
  result.push(start + span)
  return result
}

export function computeGridCells(rect: CropRect, cols: number[], rows: number[]): GridCell[] {
  const xEdges = edges(rect.x, rect.w, cols)
  const yEdges = edges(rect.y, rect.h, rows)
  const cells: GridCell[] = []
  for (let row = 0; row < yEdges.length - 1; row += 1) {
    for (let column = 0; column < xEdges.length - 1; column += 1) {
      cells.push({
        x: xEdges[column],
        y: yEdges[row],
        w: xEdges[column + 1] - xEdges[column],
        h: yEdges[row + 1] - yEdges[row],
        row,
        column,
      })
    }
  }
  return cells
}
