import { afterEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from './generationCanvasStore'
import { applyCanvasEvent } from '../events/canvasEventReducer'
import { setCanvasEventSinkForTests, type CanvasShadowEvent } from '../events/canvasEventEmitter'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

function shot(id: string, shotIndex?: number): GenerationCanvasNode {
  return { id, title: id, kind: 'image', categoryId: 'shots', position: { x: 0, y: 0 }, ...(shotIndex ? { shotIndex } : {}) }
}
function record(nodes: GenerationCanvasNode[]) {
  const store = useGenerationCanvasStore.getState()
  store.restoreSnapshot({ nodes, edges: [], groups: [] })
  const before = useGenerationCanvasStore.getState().readDocumentSnapshot()
  const events: CanvasShadowEvent[] = []
  setCanvasEventSinkForTests(batch => events.push(...batch))
  return { store, events, replay: () => events.reduce(applyCanvasEvent, before) }
}
afterEach(() => setCanvasEventSinkForTests(null))

describe('shot identity writes replay exactly', () => {
  it('replays a batch number exchange atomically, independent of patch order', () => {
    const { store, replay } = record([shot('a', 1), shot('b', 2)])
    store.updateNodes([{ nodeId: 'b', patch: { shotIndex: 1 } }, { nodeId: 'a', patch: { shotIndex: 2 } }])
    const expected = useGenerationCanvasStore.getState().nodes
    expect(expected.map(node => node.shotIndex)).toEqual([2, 1])
    expect(replay().nodes).toEqual(expected)
    store.undo()
    expect(useGenerationCanvasStore.getState().nodes.map(node => node.shotIndex)).toEqual([1, 2])
    store.redo()
    expect(useGenerationCanvasStore.getState().nodes).toEqual(expected)
  })
  it('records normalized identity after an explicit undefined deletion', () => {
    const { store, replay } = record([shot('a', 1), shot('b', 2)])
    store.updateNode('a', { shotIndex: undefined })
    const current = useGenerationCanvasStore.getState().nodes
    expect(current.map(node => node.shotIndex)).toEqual([3, 2])
    expect(replay().nodes).toEqual(current)
  })
  it.each(['referenceSheet', 'storyboardKeyframe'])('category move/copy preserves %s non-owner status', (marker) => {
    const source = { ...shot('source'), categoryId: 'scene' as const, meta: { [marker]: true } }
    const { store, replay } = record([source, shot('owner', 1)])
    store.reassignNodeCategory('source', 'shots')
    const copy = store.copyNodeToCategory('source', 'shots')!
    const current = useGenerationCanvasStore.getState().nodes
    expect(current.find(node => node.id === 'source')).not.toHaveProperty('shotIndex')
    expect(copy).not.toHaveProperty('shotIndex')
    expect(replay().nodes).toEqual(current)
    expect(store.addNode({ kind: 'video', categoryId: 'shots' }).shotIndex).toBe(2)
  })
  it('ordinary prompt batches retain compact patch events', () => {
    const { store, events, replay } = record([shot('a', 1), shot('b', 2)])
    store.updateNodes([{ nodeId: 'a', patch: { prompt: 'new text' } }])
    expect(events.map(event => event.type)).toEqual(['canvas.node.updated'])
    expect(replay().nodes).toEqual(useGenerationCanvasStore.getState().nodes)
  })
})
