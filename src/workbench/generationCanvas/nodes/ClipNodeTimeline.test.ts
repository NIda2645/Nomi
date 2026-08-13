import { describe, expect, it } from 'vitest'
import type { TimelineState } from '../../timeline/timelineTypes'
import { resolveClipNodeTimelineLayout } from './clipNodeTimelineLayout'

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
})
