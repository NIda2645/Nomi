// Shared by the generation canvas and the read-only workflow graph.
// Preserve the generation canvas sensitivity; normalize devices before clamping.
const WHEEL_ZOOM_FACTOR = 1.24
const WHEEL_ZOOM_DELTA = 120
const WHEEL_LINE_HEIGHT = 16
const WHEEL_PAGE_HEIGHT = 800

export type WheelZoomEvent = Pick<WheelEvent, 'deltaMode' | 'deltaY'>

export function getWheelZoomFactor(event: WheelZoomEvent): number {
  const deltaModeMultiplier = event.deltaMode === 1
    ? WHEEL_LINE_HEIGHT
    : event.deltaMode === 2
      ? WHEEL_PAGE_HEIGHT
      : 1
  const deltaPixels = Math.min(WHEEL_ZOOM_DELTA, Math.max(-WHEEL_ZOOM_DELTA, event.deltaY * deltaModeMultiplier))
  return Math.pow(WHEEL_ZOOM_FACTOR, -deltaPixels / WHEEL_ZOOM_DELTA)
}
