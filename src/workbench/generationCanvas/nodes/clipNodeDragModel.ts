import { clipVisibleFrames, resizeClipEdge, resolveLegalStartFrame } from '../../timeline/timelineEdit'
import { buildSnapPoints, pixelThresholdToFrames, resolveSnap, type SnapResult } from '../../timeline/snapping'
import type { TimelineClip, TimelineState } from '../../timeline/timelineTypes'

export type ClipNodeDragTarget = {
  startFrame: number
  snap: SnapResult | null
}

export type ClipNodeResizeTarget = {
  clip: TimelineClip
  deltaFrame: number
  snap: SnapResult | null
  limited: boolean
}

type ResolveClipNodeDragTargetInput = {
  timeline: TimelineState
  clipId: string
  desiredStartFrame: number
  pxPerFrame: number
  snapping: boolean
}

type ResolveClipNodeResizeTargetInput = {
  timeline: TimelineState
  clipId: string
  edge: 'left' | 'right'
  desiredDeltaFrame: number
  pxPerFrame: number
  snapping: boolean
}

export function clipNodeClientDeltaToFrames(clientDelta: number, pxPerFrame: number, canvasZoom: number): number {
  const screenPxPerFrame = Math.max(0.01, pxPerFrame * Math.max(0.1, canvasZoom))
  return Math.round(clientDelta / screenPxPerFrame)
}

/** Resolve the exact position rendered during drag so preview and committed placement cannot diverge. */
export function resolveClipNodeDragTarget({
  timeline,
  clipId,
  desiredStartFrame,
  pxPerFrame,
  snapping,
}: ResolveClipNodeDragTargetInput): ClipNodeDragTarget | null {
  const track = timeline.tracks.find((candidate) => candidate.clips.some((clip) => clip.id === clipId))
  const clip = track?.clips.find((candidate) => candidate.id === clipId)
  if (!track || !clip) return null

  const visibleFrames = Math.max(1, clipVisibleFrames(clip))
  let desiredStart = Math.max(0, Math.round(desiredStartFrame))
  let snap: SnapResult | null = null

  if (snapping) {
    const points = buildSnapPoints(timeline, { excludeClipIds: new Set([clipId]) })
    const threshold = pixelThresholdToFrames(pxPerFrame)
    const snapStart = resolveSnap(desiredStart, points, threshold)
    const snapEnd = resolveSnap(desiredStart + visibleFrames, points, threshold)
    if (snapStart && (!snapEnd || Math.abs(snapStart.deltaFrame) <= Math.abs(snapEnd.deltaFrame))) {
      desiredStart = Math.max(0, snapStart.frame)
      snap = snapStart
    } else if (snapEnd) {
      desiredStart = Math.max(0, snapEnd.frame - visibleFrames)
      snap = snapEnd
    }
  }

  const startFrame = resolveLegalStartFrame(track, clipId, desiredStart) ?? clip.startFrame
  const legalSnap = snap && (startFrame === snap.frame || startFrame + visibleFrames === snap.frame)
    ? snap
    : null
  return { startFrame, snap: legalSnap }
}

/** Resolve a trim preview from the gesture origin; callers can commit the returned total delta once on pointer-up. */
export function resolveClipNodeResizeTarget({
  timeline,
  clipId,
  edge,
  desiredDeltaFrame,
  pxPerFrame,
  snapping,
}: ResolveClipNodeResizeTargetInput): ClipNodeResizeTarget | null {
  const original = timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId)
  if (!original) return null

  const originEdge = edge === 'left' ? original.startFrame : original.endFrame
  let deltaFrame = Math.round(desiredDeltaFrame)
  let snap: SnapResult | null = null
  if (snapping) {
    const points = buildSnapPoints(timeline, { excludeClipIds: new Set([clipId]) })
    snap = resolveSnap(originEdge + deltaFrame, points, pixelThresholdToFrames(pxPerFrame))
    if (snap) deltaFrame = snap.frame - originEdge
  }

  const resized = resizeClipEdge(timeline, clipId, edge, deltaFrame)
  const clip = resized.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === clipId)
  if (!clip) return null
  const resolvedEdge = edge === 'left' ? clip.startFrame : clip.endFrame
  const resolvedDelta = resolvedEdge - originEdge
  return {
    clip,
    deltaFrame: resolvedDelta,
    snap: snap?.frame === resolvedEdge ? snap : null,
    limited: resolvedDelta !== deltaFrame,
  }
}
