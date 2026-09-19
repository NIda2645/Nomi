import { describe, it, expect } from 'vitest'
import { computeMediaMetaPatch } from './nodeSizing'

describe('computeMediaMetaPatch 媒体回填', () => {
  it('视频 loadedmetadata 把真实时长写进 meta.videoDuration（修「拖入视频一律 5 秒」的 catch-all）', () => {
    const patch = computeMediaMetaPatch({
      resultType: 'video',
      meta: {},
      width: 1920,
      height: 1080,
      durationSeconds: 12.34,
    })
    expect(patch?.meta.videoDuration).toBe(12.34)
    expect(patch?.meta.videoWidth).toBe(1920)
  })

  it('图片不写 videoDuration（时长仅视频概念）', () => {
    const patch = computeMediaMetaPatch({
      resultType: 'image',
      meta: {},
      width: 800,
      height: 600,
      durationSeconds: 9,
    })
    expect(patch?.meta.videoDuration).toBeUndefined()
    expect(patch?.meta.imageWidth).toBe(800)
  })

  it('W/H 与时长都没变 → null（不发空 update）', () => {
    const meta = { videoWidth: 1920, videoHeight: 1080, videoDuration: 12, userResized: true }
    const patch = computeMediaMetaPatch({
      resultType: 'video',
      meta,
      width: 1920,
      height: 1080,
      durationSeconds: 12,
    })
    expect(patch).toBeNull()
  })
})

it('measures intrinsic dimensions without changing user-authored geometry', () => {
  const patch = computeMediaMetaPatch({ resultType: 'image', meta: {}, width: 640, height: 360 })
  expect(patch).toEqual({ meta: { imageWidth: 640, imageHeight: 360, imageAspectRatio: 640 / 360 } })
})

it('newly decoded historical image replaces old dimensions even when nominal geometry is frozen', async () => {
  const { resolveNodeVisualSize } = await import('./nodeSizing')
  const meta = { imageWidth: 1920, imageHeight: 1080, previewHeight: 240, userResized: true }
  const patch = computeMediaMetaPatch({ resultType: 'image', meta, width: 1080, height: 1920 })
  expect(patch?.meta.imageWidth).toBe(1080)
  expect(resolveNodeVisualSize({ kind: 'image', size: { width: 270, height: 240 }, meta: patch!.meta,
    result: { id: 'historical', type: 'image', url: 'portrait.png', createdAt: 1 } })).toEqual({ width: 270, height: 480 })
})
