import { describe, expect, it } from 'vitest'
import type { TimelineState } from '../../timeline/timelineTypes'
import {
  resolveClipNodeTimelineViewport,
  resolveClipNodeTimelineLayout,
  type ClipNodeTimelineViewport,
} from './clipNodeTimelineLayout'

const timeline = (endFrame: number): TimelineState => ({
  version: 1,
  fps: 30,
  scale: 1,
  playheadFrame: 0,
  tracks: [{
    id: 'clip-node-track',
    type: 'video',
    label: '剪辑轴',
    clips: [
      { id: 'clip-a', type: 'video', sourceNodeId: 'a', label: 'A', startFrame: 0, endFrame: 150, frameCount: 150, offsetStartFrame: 0, offsetEndFrame: 0 },
      { id: 'clip-b', type: 'video', sourceNodeId: 'b', label: 'B', startFrame: 150, endFrame, frameCount: Math.max(1, endFrame - 150), offsetStartFrame: 0, offsetEndFrame: 0 },
    ],
  }],
  textClips: [],
})

describe('clip node infinite timeline viewport', () => {
  it('keeps the initial viewport at 30 seconds and puts the add slot before frame zero', () => {
    const viewport = resolveClipNodeTimelineViewport({ viewportWidth: 420, timeline: timeline(780) })

    expect(viewport.axisEndSeconds).toBe(30)
    expect(viewport.frameToPixel(0)).toBe(viewport.leadingSlotWidth + viewport.axisInset)
    expect(viewport.frameToPixel(900)).toBeLessThanOrEqual(viewport.contentWidth - viewport.axisInset)
    expect(viewport.contentWidth).toBeGreaterThanOrEqual(420)
  })

  it('grows to the right without changing old clip pixels', () => {
    const before = resolveClipNodeTimelineViewport({ viewportWidth: 420, timeline: timeline(780) })
    const appendedTimeline: TimelineState = {
      ...timeline(780),
      tracks: [{
        ...timeline(780).tracks[0]!,
        clips: [
          ...timeline(780).tracks[0]!.clips,
          { id: 'clip-c', type: 'video', sourceNodeId: 'c', label: 'C', startFrame: 780, endFrame: 1110, frameCount: 330, offsetStartFrame: 0, offsetEndFrame: 0 },
        ],
      }],
    }
    const after = resolveClipNodeTimelineViewport({ viewportWidth: 420, timeline: appendedTimeline })
    const beforeLayout = resolveClipNodeTimelineLayout(timeline(780), before)
    const afterLayout = resolveClipNodeTimelineLayout(appendedTimeline, after)

    expect(after.axisEndSeconds).toBe(41)
    expect(after.contentWidth).toBeGreaterThan(before.contentWidth)
    expect(afterLayout[0]).toEqual(beforeLayout[0])
    expect(afterLayout[1]).toEqual(beforeLayout[1])
    expect(afterLayout[2]?.left).toBeGreaterThan(afterLayout[1]?.left ?? 0)
  })

  it('uses one frame/pixel mapping for layout and scrub conversion', () => {
    const viewport: ClipNodeTimelineViewport = resolveClipNodeTimelineViewport({ viewportWidth: 420, timeline: timeline(780) })
    const frame = 517
    expect(viewport.pixelToFrame(viewport.frameToPixel(frame))).toBe(frame)
  })
})
