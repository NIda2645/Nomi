import { clipVisibleFrames } from '../../timeline/timelineEdit'
import type { TimelineState } from '../../timeline/timelineTypes'

export type ClipNodeTimelineLayout = { id: string; left: number; width: number }

export function resolveClipNodeTimelineLayout(timeline: TimelineState, width: number): ClipNodeTimelineLayout[] {
  const clips = timeline.tracks[0]?.clips ?? []
  const duration = Math.max(1, clips.reduce((max, clip) => Math.max(max, clip.endFrame), 1))
  const safeWidth = Math.max(1, width)
  return clips.map((clip) => ({
    id: clip.id,
    left: Math.round((clip.startFrame / duration) * safeWidth),
    width: Math.max(4, Math.round((clipVisibleFrames(clip) / duration) * safeWidth)),
  }))
}
