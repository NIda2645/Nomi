import { beforeEach, describe, expect, it } from 'vitest'

import { ownedSpendNodeIds, rollBackDiscardedSpendNodes } from './spendCardRollback'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { getHistoryFlags, __resetCanvasUndoJournalForTests } from '../../generationCanvas/events/canvasUndoJournal'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'

// 2026-09-21 用户原话：「我不生成，我的所有节点卡片都没了。」
// 这一组测试钉的就是「× 到底该撤谁」——判据是**来源章**，不是「卡引用了谁」。

const RUN = 'run-1'

function node(id: string, meta: Record<string, unknown> = {}): GenerationCanvasNode {
  return { id, kind: 'image', title: id, position: { x: 0, y: 0 }, prompt: id, meta }
}
/** 这次落地真的造出来的那种节点（`multiShotCanvasLanding` 打的那几个章）。 */
function landed(id: string, shotId: string, runId = RUN): GenerationCanvasNode {
  return node(id, {
    materializationOperationId: `canvas-landing:${runId}`,
    materializationClientId: shotId,
    productionRunId: runId,
    productionShotId: shotId,
  })
}
function card(shots: readonly { shotId: string; nodeId?: string }[], runId = RUN) {
  return {
    runId,
    operationId: 'op-1',
    shots: shots.map((shot, index) => ({
      ...shot, index: index + 1, prompt: '', providerId: 'v', modelId: 'm',
      parameters: {}, price: { known: true as const, amount: 1 },
    })),
  }
}

describe('ownedSpendNodeIds', () => {
  it('takes only nodes this run materialised, intersected with what the card shows', () => {
    const nodes = [landed('n1', 's1'), landed('n2', 's2'), landed('n3', 's3')]
    expect(ownedSpendNodeIds(nodes, card([{ shotId: 's1', nodeId: 'n1' }, { shotId: 's2', nodeId: 'n2' }])))
      .toEqual(['n1', 'n2'])
  })

  it('never touches a node the user built by hand, even when the card references it', () => {
    // 这正是根因那一条：`shots[].nodeId` 是**引用**，落地链允许它指向一个早就在画布上的节点。
    const nodes = [node('mine'), landed('n1', 's1')]
    expect(ownedSpendNodeIds(nodes, card([{ shotId: 'mine', nodeId: 'mine' }, { shotId: 's1', nodeId: 'n1' }])))
      .toEqual(['n1'])
  })

  it.each([
    ['另一个 Run 落的节点', [node('x', { materializationOperationId: 'canvas-landing:other', materializationClientId: 's1', productionRunId: 'other-run', productionShotId: 's1' })]],
    ['章缺了一半（只有 Run 没有物化章）', [node('x', { productionRunId: RUN, productionShotId: 's1' })]],
    ['镜身份对不上（同 Run 的另一镜）', [landed('x', 's9')]],
  ])('leaves %s alone', (_label, nodes) => {
    expect(ownedSpendNodeIds(nodes as GenerationCanvasNode[], card([{ shotId: 's1', nodeId: 'x' }]))).toEqual([])
  })

  it('never removes a node that already holds a generated result — × withdraws a request, not a paid image', () => {
    // 同一镜「再来一次」的那张卡被 × 掉：第一次已经出了图、花了钱，那个节点不是「这次请求造的占位」。
    const paid = { ...landed('n1', 's1'), result: { id: 'r1', url: 'nomi-local://x.png', kind: 'image' } } as unknown as GenerationCanvasNode
    const placeholder = landed('n2', 's2')
    expect(ownedSpendNodeIds([paid, placeholder], card([{ shotId: 's1', nodeId: 'n1' }, { shotId: 's2', nodeId: 'n2' }]))).toEqual(['n2'])
  })

  it('ignores shots whose node is gone or never bound', () => {
    expect(ownedSpendNodeIds([landed('n1', 's1')], card([{ shotId: 's1' }, { shotId: 's2', nodeId: 'missing' }]))).toEqual([])
  })
})

describe('rollBackDiscardedSpendNodes', () => {
  beforeEach(() => {
    __resetCanvasUndoJournalForTests()
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [] })
  })

  it('removes this operation’s own shots in a single undo step and keeps the user’s node', () => {
    const nodes = [node('mine'), landed('n1', 's1'), landed('n2', 's2')]
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes, edges: [], groups: [] })
    const removed = rollBackDiscardedSpendNodes(card([
      { shotId: 's1', nodeId: 'n1' }, { shotId: 's2', nodeId: 'n2' }, { shotId: 'mine', nodeId: 'mine' },
    ]))
    expect(removed).toBe(2)
    expect(useGenerationCanvasStore.getState().nodes.map(entry => entry.id)).toEqual(['mine'])
    // 建的时候一个 Cmd+Z，撤的时候也必须是一个 —— 不是两个。
    expect(getHistoryFlags().canUndo).toBe(true)
    useGenerationCanvasStore.getState().undo()
    expect(useGenerationCanvasStore.getState().nodes.map(entry => entry.id).sort()).toEqual(['mine', 'n1', 'n2'])
  })

  it('does not push an undo step when nothing belongs to this operation', () => {
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [node('mine')], edges: [], groups: [] })
    const before = getHistoryFlags().canUndo
    expect(rollBackDiscardedSpendNodes(card([{ shotId: 'mine', nodeId: 'mine' }]))).toBe(0)
    expect(useGenerationCanvasStore.getState().nodes.map(entry => entry.id)).toEqual(['mine'])
    expect(getHistoryFlags().canUndo).toBe(before)
  })
})
