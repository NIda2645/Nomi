import { describe, expect, it } from 'vitest'
import { connectNodes } from './graphOps'
import type { GenerationCanvasEdge, GenerationCanvasNode } from './generationCanvasTypes'
import { generationCanvasEdgeSchema } from './generationCanvasSchema'
import { normalizeStoreSnapshot } from '../store/canvasSnapshotNormalizer'
import { applyCanvasEvent, emptyCanvasProjection } from '../events/canvasEventReducer'
import { resolveGenerationReferences } from '../runner/generationReferenceResolver'
import { buildCatalogTaskRequest } from '../runner/catalogTaskActions'

const slots = ['ref_a', 'ref_b', 'ref_c'].map((key) => ({ key, label: key, group: 'reference' }))
function target(): GenerationCanvasNode {
  return {
    id: 'target', kind: 'video', title: 'target', position: { x: 0, y: 0 }, prompt: 'make video',
    meta: {
      modelKey: 'custom-three-images', modelVendor: 'custom-provider',
      parameterReferenceSlots: { modelKey: 'custom-three-images', vendorKey: 'custom-provider', slots },
    },
  }
}
function source(id: string): GenerationCanvasNode {
  return {
    id, kind: 'image', title: id, position: { x: 0, y: 0 },
    result: { id: `${id}-result`, type: 'image', url: `https://assets.test/${id}.png`, createdAt: 1 },
  }
}
function edge(id: string, sourceId: string, targetParamKey?: string): GenerationCanvasEdge {
  return { id, source: sourceId, target: 'target', mode: 'reference', ...(targetParamKey ? { targetParamKey } : {}) }
}

describe('declared parameter reference identity', () => {
  it('allows one source in two parameter slots without inventing edge modes', () => {
    const first = connectNodes([], 'one', 'target', 'reference', 'ref_a')
    const both = connectNodes(first, 'one', 'target', 'reference', 'ref_b')
    expect(both.map((item) => item.targetParamKey)).toEqual(['ref_a', 'ref_b'])
    expect(connectNodes(both, 'one', 'target', 'reference', 'ref_b')).toBe(both)
  })

  it('preserves the optional slot key through schema parsing', () => {
    expect(generationCanvasEdgeSchema.parse(edge('one', 'one', 'ref_b')).targetParamKey).toBe('ref_b')
    expect(generationCanvasEdgeSchema.parse(edge('old', 'one')).targetParamKey).toBeUndefined()
  })

  it('binds legacy edges once in declaration order and does not shift after removing the middle slot', () => {
    const nodes = [target(), source('one'), source('two'), source('three')]
    const restored = normalizeStoreSnapshot({ nodes, edges: [edge('e1', 'one'), edge('e2', 'two'), edge('e3', 'three')], groups: [] })
    expect(restored.edges.map((item) => item.targetParamKey)).toEqual(['ref_a', 'ref_b', 'ref_c'])
    const again = normalizeStoreSnapshot({ ...restored, edges: restored.edges.filter((item) => item.id !== 'e2') })
    expect(again.edges.map((item) => item.targetParamKey)).toEqual(['ref_a', 'ref_c'])
  })

  it('replays same-source same-mode edges in two slots independently and idempotently', () => {
    const first = { type: 'canvas.edge.added', payload: { edge: edge('one-a', 'one', 'ref_a') } }
    const second = { type: 'canvas.edge.added', payload: { edge: edge('one-b', 'one', 'ref_b') } }
    let projection = applyCanvasEvent(emptyCanvasProjection(), first)
    projection = applyCanvasEvent(projection, second)
    expect(projection.edges).toHaveLength(2)
    expect(applyCanvasEvent(projection, second).edges).toHaveLength(2)
  })

  it('projects live edge URLs by declared key into request extras, including the same source twice', () => {
    const node = target()
    node.meta!.ref_b = 'https://assets.test/stale.png'
    const references = resolveGenerationReferences(node, {
      nodes: [node, source('one'), source('two')],
      edges: [edge('e1', 'one', 'ref_a'), edge('e2', 'two', 'ref_b'), edge('e3', 'one', 'ref_c')],
    })
    const { request } = buildCatalogTaskRequest(node, { references })
    expect(request.extras).toMatchObject({
      ref_a: 'https://assets.test/one.png', ref_b: 'https://assets.test/two.png', ref_c: 'https://assets.test/one.png',
    })
  })
})
