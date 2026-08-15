import { describe, expect, it } from 'vitest'
import { advanceTimelinePlayback } from './useTimelinePlaybackClock'

describe('timeline playback clock', () => {
  it('advances one global playhead without resetting at clip boundaries', () => {
    const first = advanceTimelinePlayback({
      currentFrame: 149,
      durationFrame: 780,
      elapsedMs: 50,
      fps: 30,
      fractionalFrames: 0,
    })
    expect(first).toEqual({ frame: 150, fractionalFrames: 0.5, ended: false })

    const second = advanceTimelinePlayback({
      currentFrame: first.frame,
      durationFrame: 780,
      elapsedMs: 50,
      fps: 30,
      fractionalFrames: first.fractionalFrames,
    })
    expect(second).toEqual({ frame: 152, fractionalFrames: 0, ended: false })
  })

  it('clamps to the whole sequence end and reports completion', () => {
    expect(advanceTimelinePlayback({
      currentFrame: 779,
      durationFrame: 780,
      elapsedMs: 100,
      fps: 30,
      fractionalFrames: 0,
    })).toEqual({ frame: 780, fractionalFrames: 0, ended: true })
  })
})
