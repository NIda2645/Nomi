/**
 * 「新东西落在画布哪一点」的共用词汇：一个画布坐标点 + 它压在新东西外接盒的哪一处（比例）。
 *
 * 拖入（components/canvasStageDrop.ts）、粘贴（components/useCanvasShortcuts.ts）、导入适配器
 * （adapters/assetImportAdapter.ts 的 `anchor`）与 store 的 `pasteNodes` 用的都是这一对，
 * 不再各自约定「一个点指的是卡的左上角还是中心」（结构评审 docs/audit/2026-09-21-canvas-node-placement-structure.md §2）。
 */
export type CanvasPlacementAnchor = { xRatio: number; yRatio: number }

export type CanvasPlacement = {
  /** 画布坐标（只许由画布内核 screenToFlowPosition 换算得到，不在调用方手算）。 */
  point: { x: number; y: number }
  anchor: CanvasPlacementAnchor
}

/** 光标 / 视口中央压在新东西的中心——tldraw、Excalidraw 的粘贴与我们的拖入都是这一约定。 */
export const CENTER_PLACEMENT_ANCHOR: CanvasPlacementAnchor = { xRatio: 0.5, yRatio: 0.5 }

/** 已知外接盒尺寸时，把「点 + 锚」换成外接盒左上角。 */
export function placementOrigin(
  placement: CanvasPlacement,
  size: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: placement.point.x - size.width * placement.anchor.xRatio,
    y: placement.point.y - size.height * placement.anchor.yRatio,
  }
}
