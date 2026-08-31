import { describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from './generationCanvasStore'
import { projectParameterReferenceSlots } from '../model/parameterReferenceSlots'
import { applyCanvasEvent, type CanvasProjection } from '../events/canvasEventReducer'
import type { GenerationCanvasNode, NodeGroup } from '../model/generationCanvasTypes'

const catalog = { parameters: ['a', 'b', 'c'].map((key) => ({ key, label: key, type: 'image-url' })) }
function node(id: string): GenerationCanvasNode {
  return { id, kind: 'image', title: id, position: { x: 0, y: 0 }, meta: {} }
}
function setup() {
  const target = node('target')
  target.meta = projectParameterReferenceSlots({ modelKey: 'three', modelVendor: 'custom' }, catalog)
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [target, node('one'), node('two'), node('three')], edges: [], groups: [] })
  return useGenerationCanvasStore.getState()
}

describe('parameter reference store boundaries', () => {
  it('persists separate keys when bare manual connections fill three pending slots', () => {
    const store = setup()
    for (const source of ['one', 'two', 'three']) {
      store.startConnection(source)
      expect(store.connectToNode('target').ok).toBe(true)
    }
    expect(useGenerationCanvasStore.getState().edges.map((edge) => edge.targetParamKey)).toEqual(['a', 'b', 'c'])
  })

  it('replaces exactly the selected slot and removes it without touching the other same-source slot', () => {
    const store = setup()
    store.connectNodes('one', 'target', 'reference', 'a')
    store.connectNodes('one', 'target', 'reference', 'b')
    store.connectNodes('two', 'target', 'reference', 'b')
    let edges = useGenerationCanvasStore.getState().edges
    expect(edges.map((edge) => [edge.source, edge.targetParamKey])).toEqual([['one', 'a'], ['two', 'b']])
    store.disconnectEdge(edges.find((edge) => edge.targetParamKey === 'b')!.id)
    edges = useGenerationCanvasStore.getState().edges
    expect(edges.map((edge) => [edge.source, edge.targetParamKey])).toEqual([['one', 'a']])
  })

  it('assigns legacy edges when the catalog declaration arrives, with identical event replay', () => {
    const nodes = [node('target'), node('one'), node('two')]
    const edges = [
      { id: 'old-a', source: 'one', target: 'target', mode: 'reference' as const },
      { id: 'old-b', source: 'two', target: 'target', mode: 'reference' as const },
    ]
    const base: CanvasProjection = { nodes, edges, groups: [] }
    useGenerationCanvasStore.getState().restoreSnapshot(base)
    const patch = { meta: projectParameterReferenceSlots({ modelKey: 'three', modelVendor: 'custom' }, catalog) }
    useGenerationCanvasStore.getState().updateNode('target', patch)
    const stored = useGenerationCanvasStore.getState().readSnapshot()
    expect(stored.edges.map((edge) => edge.targetParamKey)).toEqual(['a', 'b'])
    expect(applyCanvasEvent(base, { type: 'canvas.node.updated', payload: { nodeId: 'target', patch } }).edges).toEqual(stored.edges)
  })

  it('undo restores the replaced slot without collapsing a same-source sibling', () => {
    const store = setup()
    store.connectNodes('one', 'target', 'reference', 'a')
    store.connectNodes('one', 'target', 'reference', 'b')
    store.captureHistory()
    store.connectNodes('two', 'target', 'reference', 'b')
    store.undo()
    expect(useGenerationCanvasStore.getState().edges.map((edge) => [edge.source, edge.targetParamKey])).toEqual([['one', 'a'], ['one', 'b']])
  })

  it('rejects a bare connection when every declared slot is already occupied', () => {
    const store = setup()
    for (const [index, source] of ['one', 'two', 'three'].entries()) store.connectNodes(source, 'target', 'reference', ['a', 'b', 'c'][index])
    store.startConnection('one')
    expect(store.connectToNode('target').ok).toBe(false)
    expect(useGenerationCanvasStore.getState().edges).toHaveLength(3)
  })

  it('uses declared reference slots instead of guessing first-frame semantics for video targets', () => {
    const store = setup()
    store.updateNode('target', { kind: 'video' })
    store.startConnection('one')
    expect(store.connectToNode('target').ok).toBe(true)
    expect(useGenerationCanvasStore.getState().edges).toMatchObject([{ mode: 'reference', targetParamKey: 'a' }])
  })

  it('keeps full-slot programmatic connections and wrong-media picks from creating undeliverable edges', () => {
    const store = setup()
    store.updateNode('three', { kind: 'video' })
    store.connectNodes('three', 'target', 'reference', 'a')
    expect(useGenerationCanvasStore.getState().edges).toEqual([])
    for (const key of ['a', 'b', 'c']) store.connectNodes('one', 'target', 'reference', key)
    store.connectNodes('two', 'target')
    expect(useGenerationCanvasStore.getState().edges).toHaveLength(3)
    store.updateNode('two', { kind: 'text' })
    store.startConnection('two')
    expect(store.connectToNode('target').ok).toBe(true)
    expect(useGenerationCanvasStore.getState().edges).toHaveLength(4)
  })

  it.each(['input', 'output'] as const)('materializes %s group links through declared slots with stable keys', (direction) => {
    const store = setup()
    store.updateNode('target', { kind: 'video' })
    const nodes = useGenerationCanvasStore.getState().nodes
    const members = direction === 'input' ? ['target'] : ['one', 'two', 'three']
    const group: NodeGroup = { id: 'group', name: 'group', categoryId: 'shots', nodeIds: members, createdAt: 1, updatedAt: 1 }
    store.restoreSnapshot({ nodes, edges: [], groups: [group] })
    store.startConnection(direction === 'input' ? 'one' : 'target', direction === 'input' ? 'right' : 'left')
    expect(store.connectToGroup('group').ok).toBe(true)
    const edges = useGenerationCanvasStore.getState().edges
    expect(edges.map((edge) => edge.targetParamKey)).toEqual(direction === 'input' ? ['a'] : ['a', 'b', 'c'])
    expect(edges.every((edge) => edge.mode === 'reference' && edge.viaGroupId === 'group')).toBe(true)
  })

  it('allows a video source to relay into an explicitly image-typed first-frame slot', () => {
    const store = setup()
    store.updateNode('target', { kind: 'video', meta: projectParameterReferenceSlots({ modelKey: 'relay', modelVendor: 'custom' }, {
      parameters: [{ key: 'first_frame_url', label: 'First', type: 'image-url', mediaKind: 'image' }],
    }) })
    store.updateNode('one', { kind: 'video' })
    store.startConnection('one')
    expect(store.connectToNode('target').ok).toBe(true)
    expect(useGenerationCanvasStore.getState().edges).toMatchObject([{ mode: 'first_frame', targetParamKey: 'first_frame_url' }])
  })
})
