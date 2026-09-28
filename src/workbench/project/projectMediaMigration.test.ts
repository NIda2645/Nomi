import { describe, expect, it } from 'vitest'
import { backfillCanvasMediaDimensions, findCanvasResultMediaDimensions } from './projectMediaMigration'
import type { WorkbenchProjectRecordV1 } from './projectRecordSchema'

const result = {
  id: 'r1', type: 'image' as const, url: 'nomi-local://asset/p/r1.png', thumbnailUrl: 'nomi-local://asset/p/r1.preview.jpg', createdAt: Date.now(), assetId: 'asset-r1',
}

describe('canvas media dimension migration', () => {
  it('matches persisted asset sidecar dimensions by asset id', () => {
    expect(findCanvasResultMediaDimensions(result, [{ id: 'asset-r1', data: { width: 1600, height: 900 } }])).toEqual({ width: 1600, height: 900 })
  })

  it('backfills missing node meta once from the asset record', async () => {
    const record = {
      id: 'p', name: 'p', version: 1, createdAt: 1, updatedAt: 1,
      payload: { generationCanvas: { nodes: [{ id: 'n1', kind: 'image', meta: {}, result, history: [], size: { width: 340, height: 340 } }], edges: [] }, timeline: { tracks: [] } },
    } as unknown as WorkbenchProjectRecordV1
    const upgraded = await backfillCanvasMediaDimensions(record, { assets: { list: async () => ({ items: [{ id: 'asset-r1', data: { width: 1600, height: 900 } }], cursor: null }) } } as never)
    expect(upgraded.payload.generationCanvas.nodes[0].meta).toMatchObject({ imageWidth: 1600, imageHeight: 900, imageAspectRatio: 16 / 9 })
  })
})
