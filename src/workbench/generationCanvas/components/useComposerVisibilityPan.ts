import React from 'react'
import { ENSURE_COMPOSER_VISIBLE_EVENT } from '../nodes/nodeSizing'
import type { ViewportAnimationSettlementOutcome } from './viewportAnimationSettlement'

type Offset = { x: number; y: number }

export type EnsureComposerVisibleEventDetail = {
  deltaY?: unknown
  onSettled?: (outcome: ViewportAnimationSettlementOutcome) => void
}

export function useComposerVisibilityPan(input: {
  animateViewportTo: (
    zoom: number,
    offset: Offset,
    duration?: number,
    onSettled?: (outcome: ViewportAnimationSettlementOutcome) => void,
  ) => void
  offsetRef: React.MutableRefObject<Offset>
  zoomRef: React.MutableRefObject<number>
}): void {
  const { animateViewportTo, offsetRef, zoomRef } = input

  React.useEffect(() => {
    const ensureVisible = (event: Event) => {
      const detail = (event as CustomEvent<EnsureComposerVisibleEventDetail>).detail
      const rawDelta = detail?.deltaY
      if (typeof rawDelta !== 'number' || !Number.isFinite(rawDelta) || rawDelta === 0) return
      const zoom = zoomRef.current || 1
      const offset = offsetRef.current
      animateViewportTo(zoom, { x: offset.x, y: offset.y + rawDelta }, 160, detail?.onSettled)
    }
    window.addEventListener(ENSURE_COMPOSER_VISIBLE_EVENT, ensureVisible)
    return () => window.removeEventListener(ENSURE_COMPOSER_VISIBLE_EVENT, ensureVisible)
  }, [animateViewportTo, offsetRef, zoomRef])
}
