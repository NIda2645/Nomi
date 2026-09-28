import { describe, expect, it } from 'vitest'
import { resolveSelectedGroupId } from './selectedGroup'
import { projectGroupConnectionPorts } from '../reactFlow/groupConnectionPorts'
import { readGroupPort } from './groupPort'
import type { GenerationCanvasNode, NodeGroup } from './generationCanvasTypes'
import type { CanvasGroupBox } from '../components/GroupFrame'

const groups = [
  { id: 'g', nodeIds: ['a', 'b'] },
  { id: 'empty', nodeIds: [] },
]
const existing = new Set(['a', 'b', 'c'])

describe('resolveSelectedGroupId — 编组「+」圈出不出的唯一判据', () => {
  it('选区恰好是某编组的全部成员（点框） → 这个编组', () => {
    expect(resolveSelectedGroupId({ selectedFrameId: null, selectedNodeIds: ['b', 'a'], groups, existingNodeIds: existing })).toBe('g')
  })

  it('只选了一个成员（单素材引用）或多选了组外的卡 → 不算选中编组', () => {
    expect(resolveSelectedGroupId({ selectedFrameId: null, selectedNodeIds: ['a'], groups, existingNodeIds: existing })).toBeNull()
    expect(resolveSelectedGroupId({ selectedFrameId: null, selectedNodeIds: ['a', 'b', 'c'], groups, existingNodeIds: existing })).toBeNull()
  })

  it('框本身是选区（空框 / 折叠卡） → 这个编组；已不存在的框 → null', () => {
    expect(resolveSelectedGroupId({ selectedFrameId: 'g', selectedNodeIds: [], groups, existingNodeIds: existing })).toBe('g')
    expect(resolveSelectedGroupId({ selectedFrameId: 'gone', selectedNodeIds: [], groups, existingNodeIds: existing })).toBeNull()
  })
})

describe('projectGroupConnectionPorts — 编组在画布内核里的端口节点', () => {
  const proxy = { id: 'c1', kind: 'image', title: 'c1', position: { x: 0, y: 0 }, size: { width: 280, height: 280 }, prompt: '' } as GenerationCanvasNode
  const box: CanvasGroupBox = {
    group: { id: 'g', name: '雨夜', categoryId: 'shots', nodeIds: ['a', 'b'] } as NodeGroup,
    left: 10, top: 20, width: 300, height: 400, memberCount: 2, empty: false,
  }

  it('折叠编组的 proxy 一直在，只有选中那一个带 selected', () => {
    const nodes = projectGroupConnectionPorts({
      visibleNodes: [], cards: [{ groupId: 'c1', name: 'c1', memberCount: 2, position: { x: 0, y: 0 } }],
      edgeNodeById: new Map([['c1', proxy]]), boxes: [], selectedGroupId: null,
    })
    expect(nodes.map((node) => readGroupPort(node))).toEqual([{ groupId: 'c1', selected: false }])
  })

  it('展开编组只在被选中时投影端口节点，位置 / 尺寸 = 框体', () => {
    expect(projectGroupConnectionPorts({ visibleNodes: [], cards: [], edgeNodeById: new Map(), boxes: [box], selectedGroupId: null })).toEqual([])
    const [port] = projectGroupConnectionPorts({ visibleNodes: [], cards: [], edgeNodeById: new Map(), boxes: [box], selectedGroupId: 'g' })
    expect(readGroupPort(port)).toEqual({ groupId: 'g', selected: true })
    expect(port.position).toEqual({ x: 10, y: 20 })
    expect(port.size).toEqual({ width: 300, height: 400 })
  })
})
