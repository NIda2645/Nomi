import type { TimelineClip, TimelineState } from '../../timeline/timelineTypes'

export type ClipNodeExportScope = 'full' | 'segments'

export type ClipNodeExportTask = {
  timeline: TimelineState
  outputName: string
  sourceClipId?: string
  index: number
  durationFrames: number
}

function singleClipTimeline(timeline: TimelineState, clip: TimelineClip): TimelineState {
  const visibleFrames = Math.max(1, clip.endFrame - clip.startFrame)
  const sourceTrack = timeline.tracks.find((track) => track.clips.some((candidate) => candidate.id === clip.id))
  return {
    ...timeline,
    playheadFrame: 0,
    tracks: timeline.tracks.map((track) => track.id === sourceTrack?.id
      ? { ...track, clips: [{ ...clip, startFrame: 0, endFrame: visibleFrames }] }
      : { ...track, clips: [] }),
    textClips: [],
  }
}

export function buildClipNodeExportTasks(
  timeline: TimelineState,
  scope: ClipNodeExportScope,
): ClipNodeExportTask[] {
  const clips = timeline.tracks.flatMap((track) => track.clips).sort((left, right) => left.startFrame - right.startFrame)
  if (!clips.length) return []
  if (scope === 'full') {
    const durationFrames = clips.reduce((max, clip) => Math.max(max, clip.endFrame), 0)
    return [{ timeline, outputName: 'nomi-cut', index: 0, durationFrames }]
  }
  return clips.map((clip, index) => ({
    timeline: singleClipTimeline(timeline, clip),
    outputName: `nomi-clip-${String(index + 1).padStart(2, '0')}`,
    sourceClipId: clip.id,
    index,
    durationFrames: Math.max(1, clip.endFrame - clip.startFrame),
  }))
}
