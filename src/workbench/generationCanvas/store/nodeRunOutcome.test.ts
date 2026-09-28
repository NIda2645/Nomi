import { describe, expect, it } from 'vitest'
import type { GenerationCanvasNode, GenerationNodeResult } from '../model/generationCanvasTypes'
import { readNodeMediaAspectRatio, resolveNodeVisualSize } from '../nodes/nodeSizing'
import { nodeRunOutcomePatch } from './nodeRunOutcome'

const imageResult: GenerationNodeResult = {
  id: 'result-1',
  type: 'image',
  url: 'nomi-local://asset/project/image.png',
  thumbnailUrl: 'nomi-local://asset/project/image.preview.jpg',
  createdAt: Date.now(),
}

function node(): GenerationCanvasNode {
  return {
    id: 'node-1',
    kind: 'image',
    title: 'image',
    prompt: '',
    position: { x: 0, y: 0 },
    size: { width: 340, height: 340 },
    meta: {},
    result: undefined,
    history: [],
    status: 'idle',
  } as GenerationCanvasNode
}

describe('nodeRunOutcomePatch intrinsic media dimensions', () => {
  it('writes original landing dimensions even when the node renders a thumbnail', () => {
    const patch = nodeRunOutcomePatch(node(), {
      kind: 'result',
      result: imageResult,
      mediaDimensions: { width: 1600, height: 900 },
    })

    const landed = { ...node(), ...patch, meta: patch.meta ?? {} } as GenerationCanvasNode
    expect(readNodeMediaAspectRatio(landed)).toBeCloseTo(16 / 9)
    expect(resolveNodeVisualSize(landed).height).toBeCloseTo(resolveNodeVisualSize(landed).width / (16 / 9))
    expect(landed.meta).toMatchObject({ imageWidth: 1600, imageHeight: 900, imageAspectRatio: 16 / 9 })
  })
})
