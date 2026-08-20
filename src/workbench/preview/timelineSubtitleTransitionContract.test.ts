import { describe, expect, it } from 'vitest'

import { assertDraftFilmReady, draftFilmTimelineFromState, validateDraftFilmTimeline, type DraftFilmTimeline } from './timelineSubtitleTransitionContract'

const base: DraftFilmTimeline = {
  fps: 30,
  durationFrames: 900,
  clips: Array.from({ length: 8 }, (_, index) => ({
    shotId: `shot-${index + 1}`,
    startFrame: index * 112,
    endFrame: index === 7 ? 900 : (index + 1) * 112,
  })),
  subtitles: [
    { startFrame: 20, endFrame: 80, text: '今晚，一定要找到它。', style: 'caption' },
    { startFrame: 300, endFrame: 360, text: '听见了吗？', style: 'caption' },
    { startFrame: 720, endFrame: 820, text: '找到了。', style: 'caption' },
  ],
  transitions: [
    { fromShotId: 'shot-2', toShotId: 'shot-3', type: 'dissolve', durationFrames: 6 },
    { fromShotId: 'shot-5', toShotId: 'shot-6', type: 'match_cut', durationFrames: 5 },
  ],
}

describe('draft film subtitle/transition contract', () => {
  it('accepts a contiguous roughly-30-second film with subtitles and explicit transitions', () => {
    expect(validateDraftFilmTimeline(base)).toMatchObject({
      durationSeconds: 30,
      clipCount: 8,
      subtitleCount: 3,
      transitionCount: 2,
    })
    expect(() => assertDraftFilmReady(base)).not.toThrow()
  })

  it('rejects a final film when subtitles are absent or a transition points to a non-adjacent shot', () => {
    expect(() => assertDraftFilmReady({ ...base, subtitles: [] })).toThrow(/字幕/)
    expect(() => validateDraftFilmTimeline({
      ...base,
      transitions: [{ fromShotId: 'shot-1', toShotId: 'shot-8', type: 'dissolve' }],
    })).toThrow(/相邻|adjacent/i)
  })

  it('returns actionable errors for gaps, invalid subtitle ranges, and too few transitions', () => {
    expect(() => validateDraftFilmTimeline({
      ...base,
      clips: [{ ...base.clips[0], endFrame: 100 }, ...base.clips.slice(1)],
    })).toThrow(/连续|contiguous/i)
    expect(() => validateDraftFilmTimeline({
      ...base,
      subtitles: [{ startFrame: 400, endFrame: 400, text: '空区间', style: 'caption' }],
    })).toThrow(/字幕.*区间|subtitle.*range/i)
    expect(() => assertDraftFilmReady({
      ...base,
      transitions: [{ ...base.transitions[0] }],
    })).toThrow(/转场|transition/i)
  })

  it('projects the existing Nomi timeline into the same contract without inventing a second timeline', () => {
    const projected = draftFilmTimelineFromState({
      version: 1,
      fps: 30,
      scale: 1,
      playheadFrame: 0,
      tracks: [
        { id: 'videoTrack', type: 'video', label: '视频轨', clips: [
          { id: 'clip-a', type: 'video', sourceNodeId: 'shot-a', label: 'A', startFrame: 0, endFrame: 450, frameCount: 450, offsetStartFrame: 0, offsetEndFrame: 0 },
          { id: 'clip-b', type: 'video', sourceNodeId: 'shot-b', label: 'B', startFrame: 450, endFrame: 900, frameCount: 450, offsetStartFrame: 0, offsetEndFrame: 0 },
        ] },
        { id: 'imageTrack', type: 'image', label: '图片轨', clips: [] },
        { id: 'audioTrack', type: 'audio', label: '音频轨', clips: [] },
      ],
      textClips: [{ id: 'caption-1', text: '找到了。', style: 'caption', startFrame: 700, endFrame: 820 }],
      transitions: [{ fromClipId: 'clip-a', toClipId: 'clip-b', type: 'dissolve', durationFrames: 6 }],
    })
    expect(projected).toMatchObject({ durationFrames: 900, subtitles: [{ text: '找到了。' }] })
    expect(projected.transitions).toEqual([{ fromShotId: 'shot-a', toShotId: 'shot-b', type: 'dissolve', durationFrames: 6 }])
    expect(validateDraftFilmTimeline(projected).subtitleCount).toBe(1)
  })

  it('does not count implicit clip boundaries as transitions', () => {
    const projected = draftFilmTimelineFromState({
      version: 1,
      fps: 30,
      scale: 1,
      playheadFrame: 0,
      tracks: [{ id: 'videoTrack', type: 'video', label: '视频轨', clips: [
        { id: 'clip-a', type: 'video', sourceNodeId: 'shot-a', label: 'A', startFrame: 0, endFrame: 900, frameCount: 900, offsetStartFrame: 0, offsetEndFrame: 0 },
      ] }],
      textClips: [],
    })
    expect(projected.transitions).toEqual([])
    expect(() => assertDraftFilmReady({ ...base, transitions: [] })).toThrow(/明确转场|explicit transitions/i)
  })

  it('accepts an explicitly authored hard cut as a normal transition', () => {
    const withCuts = {
      ...base,
      transitions: [
        { fromShotId: 'shot-2', toShotId: 'shot-3', type: 'cut' as const },
        { fromShotId: 'shot-5', toShotId: 'shot-6', type: 'cut' as const },
      ],
    }
    expect(assertDraftFilmReady(withCuts).transitionCount).toBe(2)
  })
})
