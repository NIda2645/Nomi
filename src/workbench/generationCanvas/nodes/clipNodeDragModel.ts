import { clipVisibleFrames, resolveLegalStartFrame } from '../../timeline/timelineEdit'
import { buildSnapPoints, pixelThresholdToFrames, resolveSnap, type SnapResult } from '../../timeline/snapping'
import type { TimelineState } from '../../timeline/timelineTypes'

export type ClipNodeDragTarget = {
  startFrame: number
  snap: SnapResult | null
}

type ResolveClipNodeDragTargetInput = {
  timeline: TimelineState
  clipId: string
  desiredStartFrame: number
  pxPerFrame: number
  snapping: boolean
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
