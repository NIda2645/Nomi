import { describe, expect, it } from 'vitest'
import type { TimelineClip, TimelineState } from '../../timeline/timelineTypes'
import { resolveClipNodeDragTarget } from './clipNodeDragModel'

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
    fps: 30,
    playheadFrame,
    scale: 1,
    tracks: [{ id: 'track', type: 'video', name: 'Video', muted: false, locked: false, clips }],
  }
}

describe('clip node drag target', () => {
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
})
