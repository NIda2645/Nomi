import { describe, expect, it } from 'vitest'
import type { TimelineState } from '../../timeline/timelineTypes'
import {
  CLIP_NODE_TRAILING_INSET,
  resolveClipNodeFilmstripStyle,
  resolveClipNodeTimelineLayout,
  resolveClipNodeTimelineViewport,
} from './clipNodeTimelineLayout'

const timeline: TimelineState = {
  version: 1,
  fps: 30,
  scale: 1,
  playheadFrame: 0,
  tracks: [{
    id: 'clip-node-track',
    type: 'video',
    label: '剪辑轴',
    clips: [
      { id: 'clip-image', type: 'image', sourceNodeId: 'image', label: '图片', startFrame: 0, endFrame: 30, frameCount: 30, offsetStartFrame: 0, offsetEndFrame: 0 },
      { id: 'clip-video', type: 'video', sourceNodeId: 'video', label: '视频', startFrame: 30, endFrame: 90, frameCount: 90, offsetStartFrame: 0, offsetEndFrame: 0 },
    ],
  }],
  textClips: [],
}

describe('ClipNodeTimeline layout', () => {
  it('maps mixed clips to one continuous visual axis', () => {
    expect(resolveClipNodeTimelineLayout(timeline, 300)).toEqual([
      { id: 'clip-image', left: 0, width: 100 },
      { id: 'clip-video', left: 100, width: 200 },
    ])
  })

  it('keeps the 30-second tick inside the viewport with trailing interaction space', () => {
    const viewport = resolveClipNodeTimelineViewport({ viewportWidth: 760, timeline })
    const thirtySecondPixel = viewport.frameToPixel(30 * timeline.fps)

    expect(thirtySecondPixel).toBeCloseTo(viewport.viewportWidth - CLIP_NODE_TRAILING_INSET)
    expect(viewport.contentWidth).toBe(viewport.viewportWidth)
  })

  it('preserves the initial scale when content extends beyond 30 seconds', () => {
    const longTimeline: TimelineState = {
      ...timeline,
      tracks: [{
        ...timeline.tracks[0],
        clips: [{ ...timeline.tracks[0].clips[0], endFrame: 40 * timeline.fps, frameCount: 40 * timeline.fps }],
      }],
    }
    const initial = resolveClipNodeTimelineViewport({ viewportWidth: 760, timeline })
    const extended = resolveClipNodeTimelineViewport({ viewportWidth: 760, timeline: longTimeline })

    expect(extended.pxPerFrame).toBe(initial.pxPerFrame)
    expect(extended.contentWidth).toBeGreaterThan(initial.contentWidth)
  })

  it('maps the complete source filmstrip and crop offset onto the visible clip', () => {
    expect(resolveClipNodeFilmstripStyle({ frameCount: 300, offsetStartFrame: 60 }, 0.5)).toEqual({
      backgroundSize: '150px 100%',
      backgroundPosition: '-30px 0',
    })
  })
})
