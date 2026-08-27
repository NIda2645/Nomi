import React from 'react'
import type { Viewport } from '@xyflow/react'
import { canvasViewportFromFlow } from './generationCanvasReactFlowAdapter'
import { setCanvasDragging } from '../components/canvasDraggingFlag'

type CanvasStoredViewport = { zoom: number; offset: { x: number; y: number } }
type FlowViewportApi = {
  getViewport: () => Viewport
  setViewport: (viewport: Viewport, options?: { duration?: number }) => Promise<boolean>
}

type UseGenerationCanvasReactFlowPointerArgs = {
  readOnly: boolean
  hostRef: React.RefObject<HTMLDivElement>
  flow: FlowViewportApi
  activeCategoryId: string
  rememberCategoryViewport: (categoryId: string, viewport: CanvasStoredViewport) => void
  setLiveViewport: React.Dispatch<React.SetStateAction<Viewport>>
}

export function useGenerationCanvasReactFlowPointer({
  readOnly,
  hostRef,
  flow,
  activeCategoryId,
  rememberCategoryViewport,
  setLiveViewport,
}: UseGenerationCanvasReactFlowPointerArgs) {
  const canvasPanMovedRef = React.useRef(false)
  const canvasPointerStartRef = React.useRef<{ x: number; y: number } | null>(null)
  const spaceHeldRef = React.useRef(false)
  const auxiliaryPanRef = React.useRef<{
    pointerId: number
    lastX: number
    lastY: number
    button: 1 | 2
    moved: boolean
  } | null>(null)
  const suppressContextMenuRef = React.useRef(false)

  const handleCanvasPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || !(event.target instanceof Element) || !event.target.closest('.react-flow__pane')) return
    canvasPointerStartRef.current = { x: event.clientX, y: event.clientY }
    canvasPanMovedRef.current = false
  }, [readOnly])

  const handleCanvasPointerDownCapture = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || event.pointerType === 'touch') return
    const isAuxiliaryPan = event.button === 1 || event.button === 2 || (event.button === 0 && spaceHeldRef.current)
    if (!isAuxiliaryPan || !event.isPrimary) return
    event.preventDefault()
    event.stopPropagation()
    auxiliaryPanRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      button: event.button as 1 | 2,
      moved: false,
    }
    suppressContextMenuRef.current = false
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture can be unavailable in test DOMs.
    }
  }, [readOnly])

  const handleCanvasPointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const auxiliaryPan = auxiliaryPanRef.current
    if (auxiliaryPan && auxiliaryPan.pointerId === event.pointerId) {
      event.preventDefault()
      const deltaX = event.clientX - auxiliaryPan.lastX
      const deltaY = event.clientY - auxiliaryPan.lastY
      const distance = Math.hypot(deltaX, deltaY)
      auxiliaryPan.lastX = event.clientX
      auxiliaryPan.lastY = event.clientY
      if (!auxiliaryPan.moved && distance >= 2) {
        auxiliaryPan.moved = true
        setCanvasDragging(hostRef.current, true)
        if (auxiliaryPan.button === 2) suppressContextMenuRef.current = true
      }
      if (deltaX === 0 && deltaY === 0) return
      const current = flow.getViewport()
      const next = { x: current.x + deltaX, y: current.y + deltaY, zoom: current.zoom }
      void flow.setViewport(next, { duration: 0 })
      setLiveViewport(next)
      return
    }
    const start = canvasPointerStartRef.current
    if (!start || canvasPanMovedRef.current) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 2) return
    canvasPanMovedRef.current = true
  }, [flow, hostRef, setLiveViewport])

  const handleCanvasPointerEnd = React.useCallback(() => {
    const auxiliaryPan = auxiliaryPanRef.current
    if (auxiliaryPan) {
      auxiliaryPanRef.current = null
      setCanvasDragging(hostRef.current, false)
      const current = flow.getViewport()
      setLiveViewport(current)
      rememberCategoryViewport(activeCategoryId, canvasViewportFromFlow(current))
      try {
        hostRef.current?.releasePointerCapture(auxiliaryPan.pointerId)
      } catch {
        // Pointer capture can be unavailable in test DOMs.
      }
    }
    canvasPointerStartRef.current = null
  }, [activeCategoryId, flow, hostRef, rememberCategoryViewport, setLiveViewport])

  const handleCanvasContextMenuCapture = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressContextMenuRef.current) return
    suppressContextMenuRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  React.useEffect(() => {
    if (readOnly) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      spaceHeldRef.current = true
      hostRef.current?.setAttribute('data-space-pan', 'true')
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      spaceHeldRef.current = false
      hostRef.current?.removeAttribute('data-space-pan')
      if (auxiliaryPanRef.current) handleCanvasPointerEnd()
    }
    const handleBlur = () => {
      spaceHeldRef.current = false
      hostRef.current?.removeAttribute('data-space-pan')
      if (auxiliaryPanRef.current) handleCanvasPointerEnd()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [handleCanvasPointerEnd, hostRef, readOnly])

  return {
    canvasPanMovedRef,
    canvasPointerStartRef,
    handleCanvasPointerDown,
    handleCanvasPointerDownCapture,
    handleCanvasPointerMove,
    handleCanvasPointerEnd,
    handleCanvasContextMenuCapture,
  }
}
