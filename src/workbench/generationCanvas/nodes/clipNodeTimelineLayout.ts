import { clipVisibleFrames } from '../../timeline/timelineEdit'
import type { TimelineState } from '../../timeline/timelineTypes'

export type ClipNodeTimelineLayout = { id: string; left: number; width: number }

export const CLIP_NODE_INITIAL_VIEW_SECONDS = 30
export const CLIP_NODE_TRAILING_SECONDS = 4
export const CLIP_NODE_AXIS_INSET = 8
export const CLIP_NODE_LEADING_SLOT_WIDTH = 56

export type ClipNodeTimelineViewport = {
  viewportWidth: number
  contentWidth: number
  timelineWidth: number
  timelineEndFrame: number
  axisEndSeconds: number
  pxPerFrame: number
  leadingSlotWidth: number
  axisInset: number
  frameToPixel: (frame: number) => number
  pixelToFrame: (pixel: number) => number
}

function safeFps(fps: number): number {
  return Number.isFinite(fps) && fps > 0 ? fps : 30
}

/**
 * The axis is a fixed viewport over a content layer.  The first 30 seconds
 * establish the density; once content passes that window, only the content
 * layer grows, so existing clips never change pixel positions.
 */
export function resolveClipNodeTimelineViewport(input: {
  viewportWidth: number
  timeline: TimelineState
}): ClipNodeTimelineViewport {
  const viewportWidth = Math.max(1, Math.round(input.viewportWidth))
  const fps = safeFps(input.timeline.fps)
  const clips = input.timeline.tracks[0]?.clips ?? []
  const timelineEndFrame = clips.reduce((max, clip) => Math.max(max, clip.endFrame), 0)
  const timelineEndSeconds = Math.max(0, timelineEndFrame / fps)
  const axisEndSeconds = Math.max(CLIP_NODE_INITIAL_VIEW_SECONDS, timelineEndSeconds + CLIP_NODE_TRAILING_SECONDS)
  const leadingSlotWidth = CLIP_NODE_LEADING_SLOT_WIDTH
  const axisInset = CLIP_NODE_AXIS_INSET
  const usableViewportWidth = Math.max(1, viewportWidth - leadingSlotWidth - axisInset * 2)
  const pxPerSecond = usableViewportWidth / CLIP_NODE_INITIAL_VIEW_SECONDS
  const pxPerFrame = pxPerSecond / fps
  const timelineWidth = Math.max(1, Math.round(axisEndSeconds * pxPerSecond))
  const contentWidth = Math.max(viewportWidth, leadingSlotWidth + axisInset * 2 + timelineWidth)
  const timelineStart = leadingSlotWidth + axisInset

  return {
    viewportWidth,
    contentWidth,
    timelineWidth,
    timelineEndFrame: Math.max(0, Math.round(axisEndSeconds * fps)),
    axisEndSeconds,
    pxPerFrame,
    leadingSlotWidth,
    axisInset,
    frameToPixel: (frame) => timelineStart + Math.max(0, Number(frame) || 0) * pxPerFrame,
    pixelToFrame: (pixel) => Math.max(0, Math.round((Number(pixel) - timelineStart) / pxPerFrame)),
  }
}

export function resolveClipNodeTimelineLayout(timeline: TimelineState, width: number | ClipNodeTimelineViewport): ClipNodeTimelineLayout[] {
  const clips = timeline.tracks[0]?.clips ?? []
  if (typeof width !== 'number') {
    const timelineStart = width.leadingSlotWidth + width.axisInset
    return clips.map((clip) => ({
      id: clip.id,
      left: Math.round(width.frameToPixel(clip.startFrame) - timelineStart),
      width: Math.max(4, Math.round(clipVisibleFrames(clip) * width.pxPerFrame)),
    }))
  }
  const duration = Math.max(1, clips.reduce((max, clip) => Math.max(max, clip.endFrame), 1))
  const safeWidth = Math.max(1, width)
  return clips.map((clip) => ({
    id: clip.id,
    left: Math.round((clip.startFrame / duration) * safeWidth),
    width: Math.max(4, Math.round((clipVisibleFrames(clip) / duration) * safeWidth)),
  }))
}
