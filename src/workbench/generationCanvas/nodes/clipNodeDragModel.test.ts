import { describe, expect, it } from 'vitest'
import type { TimelineClip, TimelineState } from '../../timeline/timelineTypes'
import {
  clipNodeClientDeltaToFrames,
  resolveClipNodeDragTarget,
  resolveClipNodeResizeTarget,
} from './clipNodeDragModel'

function clip(id: string, startFrame: number, endFrame: number): TimelineClip {
  return {
    id,
    type: 'video',
    sourceNodeId: id,
    label: id,
    url: `${id}.mp4`,
    startFrame,
    endFrame,
    frameCount: endFrame - startFrame,
    offsetStartFrame: 7,
    offsetEndFrame: 11,
  }
}

function timeline(clips: TimelineClip[], playheadFrame = 100): TimelineState {
  return {
    version: 1,
    fps: 30,
    playheadFrame,
    scale: 1,
    tracks: [{ id: 'track', type: 'video', label: 'Video', clips }],
    textClips: [],
  }
}

describe('clip node drag target', () => {
  it('converts screen movement through the canvas transform', () => {
    expect(clipNodeClientDeltaToFrames(60, 0.5, 1)).toBe(120)
    expect(clipNodeClientDeltaToFrames(60, 0.5, 0.5)).toBe(240)
  })

  it('freely positions an isolated clip and preserves its source trim data', () => {
    const source = clip('solo', 0, 60)
    const state = timeline([source])

    expect(resolveClipNodeDragTarget({
      timeline: state,
      clipId: source.id,
      desiredStartFrame: 150,
      pxPerFrame: 1,
      snapping: false,
    })).toEqual({ startFrame: 150, snap: null })
    expect(source).toMatchObject({ startFrame: 0, endFrame: 60, offsetStartFrame: 7, offsetEndFrame: 11 })
  })

  it('snaps an isolated clip back to the timeline origin', () => {
    const state = timeline([clip('solo', 120, 180)])
    const target = resolveClipNodeDragTarget({
      timeline: state,
      clipId: 'solo',
      desiredStartFrame: 5,
      pxPerFrame: 1,
      snapping: true,
    })

    expect(target?.startFrame).toBe(0)
    expect(target?.snap?.point.type).toBe('origin')
  })

  it('snaps both the dragged clip start and end to sparse targets', () => {
    const state = timeline([clip('dragged', 0, 60), clip('neighbor', 180, 240)], 100)

    expect(resolveClipNodeDragTarget({
      timeline: state,
      clipId: 'dragged',
      desiredStartFrame: 96,
      pxPerFrame: 1,
      snapping: true,
    })?.startFrame).toBe(100)
    expect(resolveClipNodeDragTarget({
      timeline: state,
      clipId: 'dragged',
      desiredStartFrame: 124,
      pxPerFrame: 1,
      snapping: true,
    })?.startFrame).toBe(120)
  })

  it('bypasses snapping while Shift is held', () => {
    const state = timeline([clip('dragged', 0, 60)], 100)

    expect(resolveClipNodeDragTarget({
      timeline: state,
      clipId: 'dragged',
      desiredStartFrame: 96,
      pxPerFrame: 1,
      snapping: false,
    })).toEqual({ startFrame: 96, snap: null })
  })

  it('returns the nearest legal collision-free destination shown to the user', () => {
    const state = timeline([clip('dragged', 0, 60), clip('neighbor', 180, 240)])

    expect(resolveClipNodeDragTarget({
      timeline: state,
      clipId: 'dragged',
      desiredStartFrame: 150,
      pxPerFrame: 8,
      snapping: false,
    })).toEqual({ startFrame: 120, snap: null })
  })

  it('previews an image extension as one total resize delta', () => {
    const image = { ...clip('still', 0, 120), type: 'image' as const }
    const target = resolveClipNodeResizeTarget({
      timeline: timeline([image]),
      clipId: image.id,
      edge: 'right',
      desiredDeltaFrame: 75,
      pxPerFrame: 1,
      snapping: false,
    })

    expect(target).toMatchObject({ deltaFrame: 75, limited: false, clip: { startFrame: 0, endFrame: 195, frameCount: 195 } })
  })

  it('shrinks a video and can extend it back only to the source boundary', () => {
    const source = clip('video', 0, 180)
    source.frameCount = 180
    source.offsetStartFrame = 0
    source.offsetEndFrame = 0
    const shrunk = resolveClipNodeResizeTarget({
      timeline: timeline([source]),
      clipId: source.id,
      edge: 'right',
      desiredDeltaFrame: -60,
      pxPerFrame: 1,
      snapping: false,
    })
    expect(shrunk).toMatchObject({ deltaFrame: -60, limited: false, clip: { endFrame: 120, frameCount: 180, offsetEndFrame: 60 } })

    const restored = resolveClipNodeResizeTarget({
      timeline: timeline([shrunk!.clip]),
      clipId: source.id,
      edge: 'right',
      desiredDeltaFrame: 120,
      pxPerFrame: 1,
      snapping: false,
    })
    expect(restored).toMatchObject({ deltaFrame: 60, limited: true, clip: { endFrame: 180, offsetEndFrame: 0 } })
  })

  it('clamps a resize at its neighbor and drops an unreachable snap guide', () => {
    const resized = { ...clip('resized', 0, 60), type: 'image' as const }
    const target = resolveClipNodeResizeTarget({
      timeline: timeline([resized, clip('neighbor', 90, 150)]),
      clipId: 'resized',
      edge: 'right',
      desiredDeltaFrame: 80,
      pxPerFrame: 1,
      snapping: false,
    })

    expect(target).toMatchObject({ deltaFrame: 30, snap: null, limited: true, clip: { endFrame: 90 } })
  })
})
