import { afterEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from './generationCanvasStore'
import { parameterReferenceMetaPatch, projectParameterReferenceSlots, readParameterReferenceSlots } from '../model/parameterReferenceSlots'
import type { GenerationCanvasNode, NodeGroup } from '../model/generationCanvasTypes'
import { applyCanvasEvent, type CanvasProjection } from '../events/canvasEventReducer'
import { setCanvasEventSinkForTests, type CanvasShadowEvent } from '../events/canvasEventEmitter'

const catalog = { parameters: ['a', 'b', 'c'].map((key) => ({ key, label: key, type: 'image-url' })) }
function image(id: string): GenerationCanvasNode {
  return { id, kind: 'image', title: id, categoryId: 'shots', position: { x: 0, y: 0 }, meta: {} }
}
function target(id: string): GenerationCanvasNode {
  return { ...image(id), kind: 'video', meta: projectParameterReferenceSlots({ modelKey: 'multi', modelVendor: 'custom' }, catalog) }
}
function projection(): CanvasProjection {
  const { nodes, edges, groups } = useGenerationCanvasStore.getState()
  return structuredClone({ nodes, edges, groups })
}
function setup(direction: 'input' | 'output' = 'output') {
  const nodes = direction === 'output'
    ? [target('target'), ...['one', 'two', 'three', 'four'].map(image)]
    : [image('source'), ...['one', 'two', 'three'].map(target)]
  const group: NodeGroup = { id: 'group', name: 'group', categoryId: 'shots', nodeIds: ['one', 'two', 'three'], createdAt: 1, updatedAt: 1 }
  const store = useGenerationCanvasStore.getState()
  store.restoreSnapshot({ nodes, edges: [], groups: [group] })
  store.startConnection(direction === 'output' ? 'target' : 'source', direction === 'output' ? 'left' : 'right')
  expect(store.connectToGroup('group').connected).toBe(3)
  return store
}
afterEach(() => setCanvasEventSinkForTests(null))

describe('editing a parameter slot inherited from a group connection', () => {
  it.each(['remove', 'upload', 'replace'] as const)('%s changes only the middle slot and is replayable/undoable as one edit', (operation) => {
    const store = setup()
    const base = projection()
    const middle = base.edges.find((edge) => edge.targetParamKey === 'b')!
    const events: CanvasShadowEvent[] = []
    setCanvasEventSinkForTests((batch) => events.push(...batch))
    store.disconnectEdge(middle.id, { scope: 'parameter' })
    if (operation === 'replace') store.connectNodes('one', 'target', 'reference', 'b')
    else {
      const node = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === 'target')!
      const slots = readParameterReferenceSlots(node.meta)
      store.updateNode(node.id, { meta: { ...node.meta, ...parameterReferenceMetaPatch(slots[1], slots, operation === 'upload' ? 'https://upload.test/b.png' : null) } }, { history: false })
    }
    const post = projection()
    expect(post.edges.filter((edge) => edge.targetParamKey !== 'b').map((edge) => [edge.id, edge.source, edge.targetParamKey]))
      .toEqual(base.edges.filter((edge) => edge.targetParamKey !== 'b').map((edge) => [edge.id, edge.source, edge.targetParamKey]))
    expect(post.edges.every((edge) => !edge.viaGroupId)).toBe(true)
    expect(post.groups[0].outputLinks).toBeUndefined()
    expect(post.edges.filter((edge) => edge.targetParamKey === 'b')).toHaveLength(operation === 'replace' ? 1 : 0)
    expect(events.reduce((state, event) => applyCanvasEvent(state, event), base)).toEqual(post)
    store.undo()
    expect(projection()).toEqual(base)
    store.redo()
    expect(projection()).toEqual(post)
    store.moveNodeToGroup('four', 'group')
    expect(projection().edges).toEqual(post.edges)
  })

  it('detaches only the edited input-link scope while preserving references on the other group members', () => {
    const store = setup('input')
    const base = projection()
    const middle = base.edges.find((edge) => edge.target === 'two')!
    store.disconnectEdge(middle.id, { scope: 'parameter' })
    const post = projection()
    expect(post.edges.map((edge) => [edge.target, edge.targetParamKey])).toEqual([['one', 'a'], ['three', 'a']])
    expect(post.edges.every((edge) => !edge.viaGroupId)).toBe(true)
    expect(post.groups[0].inputLinks).toBeUndefined()
    store.undo()
    expect(projection()).toEqual(base)
  })

  it('keeps the existing line-menu behavior: disconnecting a group edge without parameter scope removes the whole link', () => {
    const store = setup()
    store.disconnectEdge(projection().edges[1].id)
    expect(projection().edges).toEqual([])
    expect(projection().groups[0].outputLinks).toBeUndefined()
  })
})
