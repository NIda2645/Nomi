import { describe, expect, it } from 'vitest'
import type { TimelineState } from '../../timeline/timelineTypes'
import { buildClipNodeExportTasks } from './clipNodeExport'

const timeline: TimelineState = {
  version: 1,
  fps: 30,
  scale: 1,
  playheadFrame: 120,
  tracks: [{
    id: 'clip-node-track',
    type: 'video',
    label: '剪辑轴',
    clips: [
      { id: 'clip-a', type: 'image', sourceNodeId: 'a', label: 'A', startFrame: 0, endFrame: 90, frameCount: 90, offsetStartFrame: 0, offsetEndFrame: 0 },
      { id: 'clip-b', type: 'video', sourceNodeId: 'b', label: 'B', startFrame: 90, endFrame: 240, frameCount: 300, offsetStartFrame: 30, offsetEndFrame: 120 },
    ],
  }],
  textClips: [],
}

describe('clip node export planning', () => {
  it('builds one untouched task for the complete cut', () => {
    const tasks = buildClipNodeExportTasks(timeline, 'full')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ outputName: 'nomi-cut' })
    expect(tasks[0]).not.toHaveProperty('sourceClipId')
    expect(tasks[0]?.timeline.tracks[0]?.clips.map((clip) => clip.id)).toEqual(['clip-a', 'clip-b'])
  })

  it('builds one zero-based task per visible segment and preserves source offsets', () => {
    const tasks = buildClipNodeExportTasks(timeline, 'segments')
    expect(tasks).toHaveLength(2)
    expect(tasks.map((task) => task.sourceClipId)).toEqual(['clip-a', 'clip-b'])
    expect(tasks.map((task) => task.outputName)).toEqual(['nomi-clip-01', 'nomi-clip-02'])
    expect(tasks[1]?.timeline).toMatchObject({ playheadFrame: 0 })
    expect(tasks[1]?.timeline.tracks[0]?.clips[0]).toMatchObject({
      id: 'clip-b',
      startFrame: 0,
      endFrame: 150,
      offsetStartFrame: 30,
      offsetEndFrame: 120,
    })
  })
})
