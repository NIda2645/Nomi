import { describe, expect, it } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { GENERATION_NODE_KINDS } from '../model/generationNodeKinds'
import { resolveGenerationFlowConnectionAffordance } from './generationCanvasReactFlowVisualContract'

function node(kind: GenerationCanvasNode['kind'], meta?: Record<string, unknown>): GenerationCanvasNode {
  return {
    id: `${kind}-node`,
    kind,
    title: kind,
    position: { x: 0, y: 0 },
    size: { width: 240, height: 160 },
    ...(meta ? { meta } : {}),
  }
}

describe('React Flow canvas connection affordance contract', () => {
  // 2026-09-21 拍板：所有能起线的卡同一种「+」拉环。枚举全表，而不是抽几种——新加一种节点自动被这条测到。
  it.each(GENERATION_NODE_KINDS)('gives the sole selected %s card the magnetic plus ring', (kind) => {
    expect(resolveGenerationFlowConnectionAffordance(node(kind), true, '')).toBe('magnetic')
  })

  it.each(GENERATION_NODE_KINDS)('keeps an unselected (or multi-selected) %s card on the compact dot', (kind) => {
    // primarySelection=false 同时覆盖「没选中」与「多选中的一张」——多选退化为点（2026-09-11 拍板）。
    expect(resolveGenerationFlowConnectionAffordance(node(kind), false, '')).toBe('dot')
  })

  it('keeps the source card on the compact dot while its own connection is in progress', () => {
    const image = node('image')
    expect(resolveGenerationFlowConnectionAffordance(image, true, image.id)).toBe('dot')
    expect(resolveGenerationFlowConnectionAffordance(image, true, 'another-node')).toBe('magnetic')
  })

  it('renders no handle on the collapsed-group proxy node (the collapsed card owns its handles)', () => {
    expect(resolveGenerationFlowConnectionAffordance(node('image', { collapsedGroupProxy: true }), true, '')).toBe('hidden')
    expect(resolveGenerationFlowConnectionAffordance(node('image', { collapsedGroupProxy: true }), false, '')).toBe('hidden')
  })
})
