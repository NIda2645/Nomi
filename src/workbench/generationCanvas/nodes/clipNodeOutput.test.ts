import { describe, expect, it } from 'vitest'
import { buildClipNodeOutputPatch } from './clipNodeOutput'

describe('clip node output', () => {
  it('creates a playable video result with clip provenance', () => {
    const patch = buildClipNodeOutputPatch({
      sourceClipNodeId: 'clip-node-1',
      outputUrl: 'nomi-local://asset/project/exports/nomi-cut.mp4',
      relativePath: 'exports/nomi-cut.mp4',
      durationSeconds: 10,
    })

    expect(patch.result).toMatchObject({
      type: 'video',
      url: 'nomi-local://asset/project/exports/nomi-cut.mp4',
      durationSeconds: 10,
    })
    expect(patch.meta).toMatchObject({ sourceClipNodeId: 'clip-node-1', outputRelativePath: 'exports/nomi-cut.mp4' })
    expect(patch.status).toBe('success')
  })
})
