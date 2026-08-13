import type { TimelineClip, TimelineState } from '../../timeline/timelineTypes'
import {
  moveClipToLegalFrame,
  removeClipById,
  resizeClipEdge,
  splitClipAtFrame,
} from '../../timeline/timelineEdit'
import { clipNodeTimeline, type ClipNodeMeta, type ClipNodeSource } from './clipNodeModel'

const DEFAULT_FPS = 30

export function clipNodeTimelineFromMeta(meta: ClipNodeMeta, fps = DEFAULT_FPS): TimelineState {
  return clipNodeTimeline(meta, fps)
}

function clipInstanceId(clipId: string): string {
  return clipId.startsWith('clip-') ? clipId.slice('clip-'.length) : clipId
}

function sourceForTimelineClip(meta: ClipNodeMeta, clip: TimelineClip): ClipNodeSource | null {
  const instanceId = clipInstanceId(clip.id)
  const exact = meta.clips.find((source) => source.id === instanceId)
  if (exact) return exact
  return meta.clips.find((source) => source.id === clip.sourceNodeId || source.sourceNodeId === clip.sourceNodeId) ?? null
}

function sourceFromTimelineClip(source: ClipNodeSource, clip: TimelineClip, fps: number, instanceId: string): ClipNodeSource {
  const isImage = clip.type === 'image'
  const durationSeconds = isImage ? Math.max(0.1, clip.frameCount / fps) : source.durationSeconds
  return {
    ...source,
    id: instanceId,
    sourceNodeId: source.sourceNodeId ?? source.id,
    durationSeconds,
    trimStart: clip.offsetStartFrame / fps,
    trimEnd: (clip.frameCount - clip.offsetEndFrame) / fps,
    timelineStartFrame: clip.startFrame,
    timelineEndFrame: clip.endFrame,
    offsetStartFrame: clip.offsetStartFrame,
    offsetEndFrame: clip.offsetEndFrame,
  }
}

export function clipNodeMetaFromTimeline(meta: ClipNodeMeta, timeline: TimelineState, fps = timeline.fps || DEFAULT_FPS): ClipNodeMeta {
  const timelineClips = timeline.tracks.flatMap((track) => track.clips).sort((left, right) => left.startFrame - right.startFrame)
  const nextClips = timelineClips.flatMap((clip) => {
    const source = sourceForTimelineClip(meta, clip)
    if (!source) return []
    return [sourceFromTimelineClip(source, clip, fps, clipInstanceId(clip.id))]
  })
  const nextSelected = meta.selectedClipId && nextClips.some((source) => source.id === meta.selectedClipId)
    ? meta.selectedClipId
    : nextClips[0]?.id
  return {
    ...meta,
    clips: nextClips,
    sourceNodeIds: nextClips.map((source) => source.id),
    ...(nextSelected ? { selectedClipId: nextSelected } : { selectedClipId: undefined }),
  }
}

function editClipNode(meta: ClipNodeMeta, edit: (timeline: TimelineState) => TimelineState, fps = DEFAULT_FPS): ClipNodeMeta {
  const timeline = edit(clipNodeTimelineFromMeta(meta, fps))
  return clipNodeMetaFromTimeline(meta, timeline, fps)
}

export function moveClipNode(meta: ClipNodeMeta, clipId: string, startFrame: number, fps = DEFAULT_FPS): ClipNodeMeta {
  return editClipNode(meta, (timeline) => moveClipToLegalFrame(timeline, clipId, startFrame), fps)
}

export function splitClipNode(meta: ClipNodeMeta, clipId: string, frame: number, fps = DEFAULT_FPS): ClipNodeMeta {
  return editClipNode(meta, (timeline) => splitClipAtFrame(timeline, clipId, frame), fps)
}

export function resizeClipNode(meta: ClipNodeMeta, clipId: string, edge: 'left' | 'right', deltaFrame: number, fps = DEFAULT_FPS): ClipNodeMeta {
  return editClipNode(meta, (timeline) => resizeClipEdge(timeline, clipId, edge, deltaFrame), fps)
}

function compactTimeline(timeline: TimelineState): TimelineState {
  let cursor = 0
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips
        .slice()
        .sort((left, right) => left.startFrame - right.startFrame)
        .map((clip) => {
          const visibleFrames = Math.max(1, clip.endFrame - clip.startFrame)
          const next = { ...clip, startFrame: cursor, endFrame: cursor + visibleFrames }
          cursor += visibleFrames
          return next
        }),
    })),
  }
}

export function removeClipNode(meta: ClipNodeMeta, clipId: string, fps = DEFAULT_FPS): ClipNodeMeta {
  const removed = meta.clips.find((source) => `clip-${source.id}` === clipId || source.id === clipId)
  const next = editClipNode(meta, (timeline) => compactTimeline(removeClipById(timeline, clipId)), fps)
  if (!removed) return next
  const sourceNodeId = removed.sourceNodeId ?? removed.id
  const sourceStillPresent = next.clips.some((source) => (source.sourceNodeId ?? source.id) === sourceNodeId)
  if (sourceStillPresent) return next
  const excludedSourceNodeIds = Array.from(new Set([...(next.excludedSourceNodeIds ?? []), sourceNodeId]))
  return { ...next, excludedSourceNodeIds }
}

export function duplicateClipNode(meta: ClipNodeMeta, clipId: string, fps = DEFAULT_FPS): ClipNodeMeta {
  const next = editClipNode(meta, (timeline) => {
    const track = timeline.tracks[0]
    if (!track) return timeline
    const current = track.clips.find((clip) => clip.id === clipId)
    if (!current) return timeline
    const ids = new Set(track.clips.map((clip) => clip.id))
    const baseId = `${current.id}-copy`
    let nextId = baseId
    for (let index = 2; ids.has(nextId); index += 1) nextId = `${baseId}-${index}`
    const visibleFrames = Math.max(1, current.endFrame - current.startFrame)
    const occupied = (start: number) => track.clips.some((clip) => clip.id !== current.id && start < clip.endFrame && clip.startFrame < start + visibleFrames)
    let startFrame = current.endFrame
    if (occupied(startFrame)) startFrame = Math.max(0, ...track.clips.map((clip) => clip.endFrame))
    const copy = { ...current, id: nextId, startFrame, endFrame: startFrame + visibleFrames }
    return { ...timeline, tracks: [{ ...track, clips: [...track.clips, copy].sort((left, right) => left.startFrame - right.startFrame) }, ...timeline.tracks.slice(1)] }
  }, fps)
  const duplicate = next.clips.find((source) => source.id.endsWith('-copy'))
  return duplicate ? { ...next, selectedClipId: duplicate.id } : next
}
