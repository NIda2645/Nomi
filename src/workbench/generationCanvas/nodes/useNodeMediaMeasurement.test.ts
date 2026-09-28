import { describe, expect, it } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { computeNodeMediaMeasurementPatch } from './useNodeMediaMeasurement'
import { getNodeResizeBounds, getNodeSizeBounds, readNodeMediaAspectRatio, resolveNodeVisualSize } from './nodeSizing'
const image = { id: 'image', type: 'image' as const, url: 'image.png', createdAt: 1 }
const node: GenerationCanvasNode = { id: 'n', title: 'Media', kind: 'image', position: { x: 12, y: 30 }, result: image }

describe('current media measurement shared by full, lightweight and card renderers', () => {
  it('ignores late decode and footer events after result replacement', () => {
    const current = { ...node, result: { ...image, id: 'new', url: 'new.png' } }
    expect(computeNodeMediaMeasurementPatch(current, image, { kind: 'image', sourceUrl: image.url, width: 1920, height: 1080 })).toBeNull()
    expect(computeNodeMediaMeasurementPatch(current, image, { kind: 'card-info', height: 36 })).toBeNull()
  })
  it('never mistakes a video poster for intrinsic video dimensions', () => {
    const video = { ...image, type: 'video' as const }
    const current = { ...node, result: video, meta: { imageWidth: 10, imageHeight: 10 } }
    expect(computeNodeMediaMeasurementPatch(current, video, { kind: 'image', sourceUrl: image.url, width: 320, height: 180 })).toBeNull()
    const patch = computeNodeMediaMeasurementPatch(current, video, { kind: 'video', width: 1080, height: 1920, durationSeconds: 12 })
    expect(patch?.meta.videoDuration).toBe(12)
    const size = resolveNodeVisualSize({ ...current, ...patch })
    expect(size.width / size.height).toBeCloseTo(9 / 16, 8)
  })
  it.each([undefined, { imageWidth: 4001, imageHeight: 3001 }])('never writes thumbnail dimensions as original dimensions (%j)', meta => {
    const result = { ...image, thumbnailUrl: 'preview.png' }
    const current = { ...node, result, meta }
    expect(computeNodeMediaMeasurementPatch(current, result, {
      kind: 'image', sourceUrl: result.thumbnailUrl, width: 1024, height: 768,
    })).toBeNull()
    const patch = computeNodeMediaMeasurementPatch(current, result, {
      kind: 'image', sourceUrl: result.url, width: 4001, height: 3001,
    })
    expect(patch?.meta.imageWidth ?? meta?.imageWidth).toBe(4001)
    expect(patch?.meta.imageHeight ?? meta?.imageHeight).toBe(3001)
  })
  it('rejects a stale DOM image source even if its callback captures the latest result', () => {
    expect(computeNodeMediaMeasurementPatch(node, image, {
      kind: 'image', sourceUrl: 'previous.png', width: 320, height: 180,
    })).toBeNull()
  })
  it('accepts the original relative src attribute without requiring DOM absolute URL conversion', () => {
    const patch = computeNodeMediaMeasurementPatch(node, image, {
      kind: 'image', sourceUrl: 'image.png', width: 4001, height: 3001,
    })
    expect(patch?.meta.imageWidth).toBe(4001)
  })
  it('footer callbacks merge current measurements and do not cause update loops', () => {
    const current = { ...node, kind: 'character' as const, meta: { imageWidth: 1920, imageHeight: 1080, cardInfoHeight: 36 } }
    expect(computeNodeMediaMeasurementPatch(current, image, { kind: 'card-info', height: 36 })).toBeNull()
    const patch = computeNodeMediaMeasurementPatch(current, image, { kind: 'card-info', height: 72 })
    expect(resolveNodeVisualSize({ ...current, ...patch })).toEqual({ width: 200, height: 184.5 })
    expect(patch?.meta.imageWidth).toBe(1920)
  })
  it.each([[1920, 1080], [1080, 1920], [8192, 128], [128, 8192]])('native resize bounds remain achievable at %i×%i', (width, height) => {
    const bounds = getNodeResizeBounds({ ...node, meta: { imageWidth: width, imageHeight: height } })
    expect(bounds.minWidth).toBeLessThanOrEqual(bounds.maxWidth)
    expect(bounds.minHeight).toBeLessThanOrEqual(bounds.maxHeight)
    expect(bounds.minWidth / bounds.minHeight).toBeCloseTo(width / height, 8)
    expect(bounds.maxWidth / bounds.maxHeight).toBeCloseTo(width / height, 8)
  })
})

it.each(['clip', 'shot_table', 'panorama', 'director', 'text', 'whiteboard', 'audio', 'model3d', 'agent-artifact'] as const)('%s preview media does not take over editor geometry or resize limits', kind => {
  const current = { ...node, kind, meta: { imageWidth: 1920, imageHeight: 1080 } }
  expect(readNodeMediaAspectRatio(current)).toBeNull()
  expect(getNodeResizeBounds(current)).toEqual(getNodeSizeBounds(kind))
})
