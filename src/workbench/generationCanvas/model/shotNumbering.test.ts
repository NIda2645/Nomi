import { describe, expect, it } from 'vitest'
import { backfillShotIndexes, isShotNumberedNode, nextShotIndex, resolveShotIdentities } from './shotNumbering'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { GenerationCanvasNode, GenerationNodeKind } from './generationCanvasTypes'

function makeNode(input: {
  id: string
  kind: GenerationNodeKind
  categoryId?: string
  x?: number
  y?: number
  shotIndex?: number
}): GenerationCanvasNode {
  return {
    id: input.id,
    kind: input.kind,
    title: input.id,
    position: { x: input.x ?? 0, y: input.y ?? 0 },
    prompt: '',
    references: [],
    history: [],
    status: 'idle',
    meta: {},
    categoryId: input.categoryId ?? 'shots',
    ...(input.shotIndex != null ? { shotIndex: input.shotIndex } : {}),
  } as GenerationCanvasNode
}

describe('shotNumbering（镜头编号 = 存储身份，审计 A2）', () => {
  it('只有分镜分类里的镜头内容 kind 参与编号；text/panorama/director/output 永不编号', () => {
    for (const kind of ['image', 'video', 'shot', 'keyframe'] as const) {
      expect(isShotNumberedNode(makeNode({ id: kind, kind }))).toBe(true)
    }
    for (const kind of ['text', 'panorama', 'director', 'output', 'character', 'scene'] as const) {
      expect(isShotNumberedNode(makeNode({ id: kind, kind }))).toBe(false)
    }
    // 同 kind 不在分镜分类 → 不编号
    expect(isShotNumberedNode(makeNode({ id: 'img', kind: 'image', categoryId: 'scene' }))).toBe(false)
  })

  it('身份标记不占号：referenceSheet（参考卡）与 storyboardKeyframe（图片+视频首帧图）都跳过', () => {
    const ref = { ...makeNode({ id: 'ref', kind: 'image' }), meta: { referenceSheet: true } }
    const keyframe = { ...makeNode({ id: 'kf', kind: 'image' }), meta: { storyboardKeyframe: true } }
    expect(isShotNumberedNode(ref)).toBe(false)
    expect(isShotNumberedNode(keyframe)).toBe(false)
  })

  it('nextShotIndex = 现存最大编号 + 1，删除留空号不复用', () => {
    expect(nextShotIndex([])).toBe(1)
    const nodes = [
      makeNode({ id: 'a', kind: 'image', shotIndex: 1 }),
      makeNode({ id: 'c', kind: 'video', shotIndex: 7 }),
    ]
    expect(nextShotIndex(nodes)).toBe(8)
  })

  it('backfill 幂等：已有编号原样保留，缺号按 (y,x,id) 确定性续编', () => {
    const nodes = [
      makeNode({ id: 'kept', kind: 'image', shotIndex: 3, x: 999, y: 999 }),
      makeNode({ id: 'b-row2', kind: 'video', x: 0, y: 100 }),
      makeNode({ id: 'a-row1-right', kind: 'image', x: 200, y: 0 }),
      makeNode({ id: 'a-row1-left', kind: 'image', x: 0, y: 0 }),
      makeNode({ id: 'txt', kind: 'text' }),
    ]
    const first = backfillShotIndexes(nodes)
    expect(first.changed).toBe(true)
    const byId = new Map(first.nodes.map((node) => [node.id, node.shotIndex]))
    expect(byId.get('kept')).toBe(3)
    expect(byId.get('a-row1-left')).toBe(4)
    expect(byId.get('a-row1-right')).toBe(5)
    expect(byId.get('b-row2')).toBe(6)
    expect(byId.get('txt')).toBeUndefined()

    const second = backfillShotIndexes(first.nodes)
    expect(second.changed).toBe(false)
  })

  it('store：加无关节点（text/panorama）不改写既有镜头编号——A2 的核心症状', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], selectedNodeIds: [], groups: [] })

    const shot1 = useGenerationCanvasStore.getState().addNode({ kind: 'image', categoryId: 'shots' })
    const shot2 = useGenerationCanvasStore.getState().addNode({ kind: 'video', categoryId: 'shots' })
    expect(shot1.shotIndex).toBe(1)
    expect(shot2.shotIndex).toBe(2)

    // 加 text 和 panorama（旧实现里它们会挤进编号序列并把既有编号顶后）
    useGenerationCanvasStore.getState().addNode({ kind: 'text', categoryId: 'shots' })
    useGenerationCanvasStore.getState().addNode({ kind: 'panorama' })

    const nodes = useGenerationCanvasStore.getState().nodes
    expect(nodes.find((n) => n.id === shot1.id)?.shotIndex).toBe(1)
    expect(nodes.find((n) => n.id === shot2.id)?.shotIndex).toBe(2)
    // 后续镜头继续顺延，不受无关节点影响
    const shot3 = useGenerationCanvasStore.getState().addNode({ kind: 'image', categoryId: 'shots' })
    expect(shot3.shotIndex).toBe(3)
  })
})

it('repairs duplicate and invalid owner numbers while preserving valid identities', () => {
  const input = [makeNode({ id: 'kept', kind: 'video', shotIndex: 2 }), makeNode({ id: 'dup', kind: 'image', shotIndex: 2 }),
    makeNode({ id: 'zero', kind: 'image', shotIndex: 0 }), makeNode({ id: 'bad', kind: 'video', shotIndex: Infinity })]
  const fixed = backfillShotIndexes(input)
  expect(fixed.nodes[0].shotIndex).toBe(2)
  expect(new Set(fixed.nodes.map(n => n.shotIndex)).size).toBe(4)
  expect(fixed.nodes.every(n => Number.isSafeInteger(n.shotIndex) && n.shotIndex! > 0)).toBe(true)
  expect(backfillShotIndexes(fixed.nodes).changed).toBe(false)
})

it('repeated workflow insertion creates new shot identities, not copies of the source number', () => {
  const store = useGenerationCanvasStore.getState()
  store.restoreSnapshot({ nodes: [makeNode({ id: 'original', kind: 'image', shotIndex: 1 })], edges: [], groups: [] })
  store.selectNode('original')
  const template = store.saveSelectedAsWorkflowTemplate('reuse')!
  store.instantiateWorkflowTemplate(template.id, { x: 500, y: 0 })
  store.instantiateWorkflowTemplate(template.id, { x: 1000, y: 0 })
  expect(useGenerationCanvasStore.getState().nodes.map(n => n.shotIndex)).toEqual([1, 2, 3])
})

it('restoring a deleted owner after its number was reused repairs only the arriving conflict', () => {
  const store = useGenerationCanvasStore.getState()
  store.restoreSnapshot({ nodes: [makeNode({ id: 'live', kind: 'image', shotIndex: 1 })], edges: [], groups: [] })
  store.restoreGraph([makeNode({ id: 'deleted', kind: 'video', shotIndex: 1 })], [])
  expect(useGenerationCanvasStore.getState().nodes.map(n => n.shotIndex)).toEqual([1, 2])
})

it('clipboard pairs share the new video identity in projection without storing a second number', () => {
  const frame = { ...makeNode({ id: 'frame', kind: 'image', shotIndex: 1 }), meta: { storyboardKeyframe: true } }
  const video = makeNode({ id: 'video', kind: 'video', shotIndex: 1 })
  const store = useGenerationCanvasStore.getState()
  store.restoreSnapshot({ nodes: [frame, video], edges: [{ id: 'pair', source: 'frame', target: 'video', mode: 'first_frame' }], groups: [] })
  store.selectNodes(['frame', 'video'])
  store.copySelectedNodes()
  store.pasteNodes({ x: 900, y: 0 })
  const state = useGenerationCanvasStore.getState()
  const copies = state.nodes.filter(n => !['frame', 'video'].includes(n.id))
  expect(copies.find(n => n.kind === 'video')?.shotIndex).toBe(2)
  expect(copies.find(n => n.kind === 'image')?.shotIndex).toBeUndefined()
  const identities = resolveShotIdentities(state.nodes, state.edges)
  expect(copies.map(n => identities.get(n.id)?.shotIndex)).toEqual([2, 2])
  expect(copies.map(n => identities.get(n.id)?.shotRole)).toEqual(['first_frame', 'video'])
  store.undo()
  expect(useGenerationCanvasStore.getState().nodes).toHaveLength(2)
  store.redo()
  const redone = useGenerationCanvasStore.getState()
  expect([...resolveShotIdentities(redone.nodes, redone.edges).values()].map(n => n.shotIndex)).toEqual([1, 1, 2, 2])
})

it('single frame copying cannot retain a false relationship to the old video', () => {
  const store = useGenerationCanvasStore.getState()
  store.restoreSnapshot({ nodes: [{ ...makeNode({ id: 'frame', kind: 'image', shotIndex: 3 }), meta: { storyboardKeyframe: true } }, makeNode({ id: 'video', kind: 'video', shotIndex: 3 })], edges: [{ id: 'pair', source: 'frame', target: 'video', mode: 'first_frame' }], groups: [] })
  store.selectNode('frame'); store.copySelectedNodes(); store.pasteNodes()
  const state = useGenerationCanvasStore.getState()
  const copy = state.nodes.find(n => !['frame', 'video'].includes(n.id))!
  expect(resolveShotIdentities(state.nodes, state.edges).get(copy.id)).toEqual({ shotRole: 'first_frame', shotOwnerNodeIds: [] })
})

it('event recovery repairs conflicting numbered writes and never changes numbers on movement', async () => {
  const { applyCanvasEvent, emptyCanvasProjection } = await import('../events/canvasEventReducer')
  let projection = applyCanvasEvent(emptyCanvasProjection(), { type: 'canvas.snapshot.restored', payload: { snapshot: { nodes: [makeNode({ id: 'a', kind: 'video', shotIndex: 1 }), makeNode({ id: 'b', kind: 'image', shotIndex: 1 })], edges: [], groups: [] } } })
  expect(projection.nodes.map(n => n.shotIndex)).toEqual([1, 2])
  projection = applyCanvasEvent(projection, { type: 'canvas.node.moved', payload: { nodeId: 'a', position: { x: 500, y: 1000 } } })
  expect(projection.nodes.map(n => n.shotIndex)).toEqual([1, 2])
})
