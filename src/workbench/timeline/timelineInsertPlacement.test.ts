import { describe, it, expect } from 'vitest'
import type { TimelineClip, TimelineState } from './timelineTypes'
import { addClipAtFrame, resolveLegalInsertStart } from './timelineEdit'
import { findAppendFrame } from './timelineMath'

// L0-b/L3 回归锁：拖放插入与移动共用同一碰撞模型——期望位被占滑入最近空位，
// 插入永不静默失败（旧行为：canPlaceClip 拒收 + toast 让用户自己找空位）。

function clip(id: string, start: number, end: number): TimelineClip {
  return {
    id, type: 'video', sourceNodeId: `node-${id}`, label: id,
    startFrame: start, endFrame: end, frameCount: end - start,
    offsetStartFrame: 0, offsetEndFrame: 0,
  }
}

function timeline(videoClips: TimelineClip[]): TimelineState {
  return {
    version: 1, fps: 30, scale: 1, playheadFrame: 0,
    tracks: [
      { id: 'imageTrack', type: 'image', label: '图片轨', clips: [] },
      { id: 'videoTrack', type: 'video', label: '媒体轨', clips: videoClips },
    ],
    textClips: [],
  }
}

const videoTrack = (state: TimelineState) => state.tracks.find((track) => track.type === 'video')!

describe('resolveLegalInsertStart', () => {
  it('空轨：期望位原样通过', () => {
    expect(resolveLegalInsertStart(videoTrack(timeline([])), clip('n', 0, 120), 90)).toBe(90)
  })

  it('期望位被占：滑入最近能放下的空位（不拒收）', () => {
    const track = videoTrack(timeline([clip('a', 0, 240)]))
    // 120 帧长的新 clip 落在 a 中间 → 最近合法位是 a 的尾部 240
    expect(resolveLegalInsertStart(track, clip('n', 0, 120), 100)).toBe(240)
  })

  it('两段之间的空隙够长时优先就近落隙', () => {
    const track = videoTrack(timeline([clip('a', 0, 100), clip('b', 300, 400)]))
    expect(resolveLegalInsertStart(track, clip('n', 0, 120), 130)).toBe(130)
  })
})

describe('addClipAtFrame（滑入语义）', () => {
  it('落到已占区不再拒收：滑入最近空位并插入', () => {
    const state = timeline([clip('a', 0, 240)])
    const next = addClipAtFrame(state, clip('n', 0, 120), 'video', 100)
    const clips = videoTrack(next).clips
    expect(clips).toHaveLength(2)
    const inserted = clips.find((candidate) => candidate.id === 'n')!
    expect(inserted.startFrame).toBe(240)
    expect(inserted.endFrame).toBe(360)
  })

  it('轨型不匹配仍拒绝（wrongType 是唯一拒收理由）', () => {
    const state = timeline([])
    const next = addClipAtFrame(state, clip('n', 0, 120), 'image', 0)
    expect(next).toBe(state)
  })
})

describe('findAppendFrame（贴尾追加）', () => {
  it('等于末尾 clip 的 endFrame；空轨为 0', () => {
    expect(findAppendFrame(videoTrack(timeline([])))).toBe(0)
    expect(findAppendFrame(videoTrack(timeline([clip('a', 0, 240), clip('b', 300, 400)])))).toBe(400)
  })
})
