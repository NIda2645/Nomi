import { describe, it, expect } from 'vitest'
import type { TimelineClip, TimelineState } from './timelineTypes'
import { clipVisibleFrames, resizeClipEdge, splitClipAtFrame } from './timelineEdit'

// 回归背景：布局宽度曾读 clip.frameCount（源总长）。视频/音频裁剪只改 offset 与
// endFrame，frameCount 恒定 → 裁剪在 UI 上纹丝不动，且视觉跨度 ≠ 真实跨度，
// 按视觉位置发起的分割落在真实跨度之外被守卫静默吞掉（真机 2026-08-01 实测）。
// 本文件锁死：可见跨度唯一来源 = endFrame - startFrame。

function videoClip(id: string, start: number, end: number, sourceFrames: number): TimelineClip {
  return {
    id, type: 'video', sourceNodeId: `node-${id}`, label: id,
    startFrame: start, endFrame: end, frameCount: sourceFrames,
    offsetStartFrame: 0, offsetEndFrame: sourceFrames - (end - start),
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

const videoClipsOf = (state: TimelineState): TimelineClip[] =>
  state.tracks.find((track) => track.type === 'video')?.clips ?? []

describe('clipVisibleFrames', () => {
  it('未裁剪时可见帧数 = 源总长', () => {
    const clip = videoClip('a', 0, 240, 240)
    expect(clipVisibleFrames(clip)).toBe(240)
    expect(clipVisibleFrames(clip)).toBe(clip.frameCount)
  })

  it('裁尾后可见帧数跟随 endFrame 收缩，且不再等于 frameCount（曾致 UI 纹丝不动的回归点）', () => {
    const state = timeline([videoClip('a', 0, 240, 240)])
    const trimmed = videoClipsOf(resizeClipEdge(state, 'a', 'right', -90))[0]
    expect(trimmed.frameCount).toBe(240)
    expect(clipVisibleFrames(trimmed)).toBe(150)
    expect(clipVisibleFrames(trimmed)).not.toBe(trimmed.frameCount)
  })

  it('裁头同理：offsetStart 增加、可见帧数收缩', () => {
    const state = timeline([videoClip('a', 0, 240, 240)])
    const trimmed = videoClipsOf(resizeClipEdge(state, 'a', 'left', 60))[0]
    expect(trimmed.offsetStartFrame).toBe(60)
    expect(clipVisibleFrames(trimmed)).toBe(180)
  })
})

describe('裁剪后的分割按可见跨度命中', () => {
  it('可见跨度内分割成功，两段可见帧数之和守恒', () => {
    const state = timeline([videoClip('a', 0, 240, 240)])
    const trimmed = resizeClipEdge(state, 'a', 'right', -90) // 可见 0..150
    const split = splitClipAtFrame(trimmed, 'a', 100)
    const clips = videoClipsOf(split)
    expect(clips).toHaveLength(2)
    expect(clipVisibleFrames(clips[0]) + clipVisibleFrames(clips[1])).toBe(150)
  })

  it('落在已裁掉的"幽灵区"（旧视觉跨度内、真实跨度外）的分割是 no-op —— 修复前用户点得到这里', () => {
    const state = timeline([videoClip('a', 0, 240, 240)])
    const trimmed = resizeClipEdge(state, 'a', 'right', -90) // 真实可见 0..150，旧 UI 仍画到 240
    const split = splitClipAtFrame(trimmed, 'a', 200)
    expect(videoClipsOf(split)).toHaveLength(1)
  })
})
