import { describe, expect, it } from 'vitest'
import { selectShotIdentity } from './useNodeRelationships'
import type { GenerationCanvasNode, GenerationCanvasEdge } from '../model/generationCanvasTypes'

describe('shared full/LOD shot identity selector', () => {
  it('keeps label references stable during movement, and refreshes first-frame ownership on edge changes', () => {
    const nodes: GenerationCanvasNode[] = [
      { id: 'frame', kind: 'image', categoryId: 'shots', position: { x: 0, y: 0 }, meta: { storyboardKeyframe: true } },
      { id: 'video', kind: 'video', categoryId: 'shots', position: { x: 100, y: 0 }, shotIndex: 3 },
    ]
    const edges: GenerationCanvasEdge[] = [{ id: 'pair', source: 'frame', target: 'video', mode: 'first_frame' }]
    const first = selectShotIdentity({ nodes, edges }, 'frame')
    expect(first).toMatchObject({ shotIndex: 3, shotRole: 'first_frame', shotOwnerNodeIds: ['video'] })
    const moved = nodes.map(node => ({ ...node, position: { x: node.position.x + 20, y: 30 } }))
    expect(selectShotIdentity({ nodes: moved, edges }, 'frame')).toBe(first)
    expect(selectShotIdentity({ nodes: moved, edges: [] }, 'frame')).toEqual({ shotRole: 'first_frame', shotOwnerNodeIds: [] })
  })
})
