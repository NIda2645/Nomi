// 框选 marquee：**Shift + 左键拖**才进（裸左键是平移，2026-08-08 用户拍板）。
// 既然入口只有 Shift，框选就恒「追加」——Shift 在本产品里到处都是「多选修饰键」
// （Shift+点节点=加选），同一个键不该在这里换成另一种意思。要只框这一批：先点空白清空。
// 是否该进框选由 useCanvasPointerInteractions 一处仲裁（canvasPointerGestureModel），这里只管拉框本身。
import React from 'react'
import { canvasDragExceededThreshold } from './canvasPointerGestureModel'

type Offset = { x: number; y: number }

export type MarqueeRect = { left: number; top: number; width: number; height: number }

type UseMarqueeSelectionArgs = {
  stageRef: React.RefObject<HTMLDivElement>
  offsetRef: React.MutableRefObject<Offset>
  zoomRef: React.MutableRefObject<number>
  activeCategoryId: string
  selectNodesInRect: (rect: { x1: number; y1: number; x2: number; y2: number }, categoryId?: string, additive?: boolean) => void
}

export type MarqueeSelection = {
  marqueeRect: MarqueeRect | null
  cancel: () => void
  handlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  handlePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
  handlePointerUp: (event: React.PointerEvent<HTMLDivElement>) => void
  handlePointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void
}

export function useMarqueeSelection({
  stageRef,
  offsetRef,
  zoomRef,
  activeCategoryId,
  selectNodesInRect,
}: UseMarqueeSelectionArgs): MarqueeSelection {
  const startRef = React.useRef<{ clientX: number; clientY: number; moved: boolean } | null>(null)
  const [marqueeRect, setMarqueeRect] = React.useState<MarqueeRect | null>(null)

  const cancelMarquee = React.useCallback(() => {
    startRef.current = null
    setMarqueeRect(null)
  }, [])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelMarquee()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', cancelMarquee)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', cancelMarquee)
    }
  }, [cancelMarquee])

  const computeStageRect = React.useCallback((clientX: number, clientY: number) => {
    const start = startRef.current
    const stage = stageRef.current
    if (!start || !stage) return null
    const bounds = stage.getBoundingClientRect()
    const sx = start.clientX - bounds.left
    const sy = start.clientY - bounds.top
    const cx = clientX - bounds.left
    const cy = clientY - bounds.top
    return { left: Math.min(sx, cx), top: Math.min(sy, cy), width: Math.abs(cx - sx), height: Math.abs(cy - sy) }
  }, [stageRef])

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    startRef.current = { clientX: event.clientX, clientY: event.clientY, moved: false }
    setMarqueeRect(null)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 无活动指针时忽略 */ }
  }, [])

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current
    if (!start) return
    if (!start.moved) {
      if (!canvasDragExceededThreshold(start.clientX, start.clientY, event.clientX, event.clientY)) return
      start.moved = true
    }
    setMarqueeRect(computeStageRect(event.clientX, event.clientY))
  }, [computeStageRect])

  const handlePointerUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current
    if (!start) return
    startRef.current = null
    setMarqueeRect(null)
    const stage = stageRef.current
    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      typeof event.currentTarget.releasePointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // Shift+点空白（没拉出框）：Shift 是「加选」，加了个空集合 = 保持现有选区不动。
    if (!start.moved) return
    if (!stage) return
    const bounds = stage.getBoundingClientRect()
    const z = zoomRef.current || 1
    const toCanvas = (clientX: number, clientY: number) => ({
      x: (clientX - bounds.left - offsetRef.current.x) / z,
      y: (clientY - bounds.top - offsetRef.current.y) / z,
    })
    const a = toCanvas(start.clientX, start.clientY)
    const b = toCanvas(event.clientX, event.clientY)
    selectNodesInRect({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, activeCategoryId, true)
  }, [activeCategoryId, offsetRef, selectNodesInRect, stageRef, zoomRef])

  const handlePointerCancel = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    cancelMarquee()
    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      typeof event.currentTarget.releasePointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [cancelMarquee])

  return { marqueeRect, cancel: cancelMarquee, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel }
}
