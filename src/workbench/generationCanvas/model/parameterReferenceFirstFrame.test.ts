import { describe, expect, it } from 'vitest'
import { NEWAPI_STANDARD_VIDEO_PARAMS } from '../../../../electron/catalog/newapiTransport'
import type { GenerationCanvasEdge, GenerationCanvasNode } from './generationCanvasTypes'
import { normalizeParameterEdges, projectParameterReferenceSlots, resolveParameterReferenceAssignments } from './parameterReferenceSlots'
import { resolveCanvasReferenceConnection } from './canvasReferenceConnection'
import { resolveGenerationReferences } from '../runner/generationReferenceResolver'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'

function source(kind: 'image' | 'video' = 'image'): GenerationCanvasNode {
  return { id: 'source', kind, title: kind, position: { x: 0, y: 0 }, result: { id: 'result', type: kind, url: `https://asset.test/${kind}`, createdAt: 1 } }
}
function target(parameters: unknown = NEWAPI_STANDARD_VIDEO_PARAMS): GenerationCanvasNode {
  return { id: 'target', kind: 'video', title: 'Relay', position: { x: 0, y: 0 }, prompt: 'animate',
    meta: projectParameterReferenceSlots({ modelKey: 'generic-relay', modelVendor: 'custom-relay' }, { parameters }) }
}
const legacyEdge: GenerationCanvasEdge = { id: 'legacy', source: 'source', target: 'target', mode: 'first_frame' }

describe('first-frame edges remain compatible with generic image-reference parameters', () => {
  it('resolves and normalizes an existing first_frame edge into the real NEWAPI image_url declaration', () => {
    const node = target()
    const nodes = [source(), node]
    const references = resolveGenerationReferences(node, { nodes, edges: [legacyEdge] })
    expect(references.firstFrameUrl).toBe('https://asset.test/image')
    expect(references.parameterReferenceUrls?.image_url).toBe('https://asset.test/image')
    expect(normalizeParameterEdges(nodes, [legacyEdge])[0].targetParamKey).toBe('image_url')
  })

  it('persists programmatic first_frame connections, including the storyboard keyframe path', () => {
    const src = source()
    const node = target()
    expect(resolveCanvasReferenceConnection(src, node, [src, node], [], 'first_frame')).toEqual({
      ok: true, mode: 'first_frame', targetParamKey: 'image_url',
    })
    const store = useGenerationCanvasStore.getState()
    store.restoreSnapshot({ nodes: [src, node], edges: [], groups: [] })
    store.connectNodes(src.id, node.id, 'first_frame')
    expect(useGenerationCanvasStore.getState().edges).toMatchObject([{ mode: 'first_frame', targetParamKey: 'image_url' }])
  })

  it('prefers a dedicated first-frame declaration even when a compatible reference is listed first', () => {
    const node = target([
      ...NEWAPI_STANDARD_VIDEO_PARAMS,
      { key: 'first_frame_url', label: 'First', type: 'image-url', mediaKind: 'image' },
    ])
    const assignments = resolveParameterReferenceAssignments(node, [source(), node], [legacyEdge])
    expect(assignments.find(({ edge }) => edge)?.slot.key).toBe('first_frame_url')
  })

  it('keeps an explicitly requested video first-frame relay through a generic image declaration', () => {
    const video = source('video')
    const node = target()
    expect(resolveCanvasReferenceConnection(video, node, [video, node], [], 'first_frame')).toEqual({ ok: true, mode: 'first_frame', targetParamKey: 'image_url' })
    const refs = resolveGenerationReferences(node, { nodes: [video, node], edges: [legacyEdge] })
    expect(refs.relayFromVideoUrl).toBe('https://asset.test/video')
    expect(refs.firstFrameUrl).toBeUndefined()
    expect(normalizeParameterEdges([video, node], [legacyEdge])[0].targetParamKey).toBe('image_url')
  })

  it('still rejects ordinary video references to image inputs and never infers relay for explicit video inputs', () => {
    const video = source('video')
    const node = target()
    expect(resolveCanvasReferenceConnection(video, node, [video, node], [], 'reference').ok).toBe(false)
    expect(resolveGenerationReferences(node, { nodes: [video, node], edges: [{ ...legacyEdge, mode: 'reference' }] }).parameterReferenceUrls).toEqual({})
    const videoTarget = target([{ key: 'clip', label: 'Clip', type: 'image-url', mediaKind: 'video' }])
    expect(resolveCanvasReferenceConnection(video, videoTarget, [video, videoTarget], [], 'first_frame').ok).toBe(false)
  })
})
