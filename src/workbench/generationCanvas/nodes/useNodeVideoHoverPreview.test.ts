import { describe, expect, it, vi } from 'vitest'
import { startNodeVideoHoverPreview, stopNodeVideoHoverPreview } from './useNodeVideoHoverPreview'

function fakeVideo(muted: boolean): HTMLVideoElement {
  return {
    muted,
    currentTime: 3,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement
}

describe('node video hover preview', () => {
  it('restores an audible canvas video after temporary autoplay mute', () => {
    const video = fakeVideo(false)

    startNodeVideoHoverPreview(video)
    expect(video.muted).toBe(true)
    expect(video.play).toHaveBeenCalledOnce()

    stopNodeVideoHoverPreview(video)
    expect(video.muted).toBe(false)
    expect(video.pause).toHaveBeenCalledOnce()
    expect(video.currentTime).toBe(0)
  })

  it('preserves a video that was already muted before hover', () => {
    const video = fakeVideo(true)

    startNodeVideoHoverPreview(video)
    stopNodeVideoHoverPreview(video)

    expect(video.muted).toBe(true)
  })
})
