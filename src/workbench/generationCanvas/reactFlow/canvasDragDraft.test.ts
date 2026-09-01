import { describe, expect, it, vi } from 'vitest'
import type { NodeChange } from '@xyflow/react'
import type { GenerationFlowNode } from './generationCanvasReactFlowAdapter'
import { applyCanvasDragPositionChanges, overlayCanvasDragDraft } from './canvasDragDraft'

function flowNode(id: string, x: number, y = 0): GenerationFlowNode {
  return {
    id,
    type: 'generation',
    position: { x, y },
    data: {
      generationNode: {
        id,
        kind: 'image',
        title: id,
        position: { x, y },
        size: { width: 240, height: 120 },
      },
      readOnly: false,
      primarySelection: false,
      appear: false,
      focusFlash: false,
    },
    selected: false,
    draggable: true,
    selectable: true,
    connectable: true,
    focusable: true,
  }
}

describe('canvas drag draft', () => {
  it('keeps the domain nodes and moveNode untouched during position ticks', () => {
    const storeNodes = [flowNode('a', 10), flowNode('b', 200)]
    const moveNode = vi.fn()
    const changes = [{
      type: 'position',
      id: 'a',
      position: { x: 42, y: 18 },
      dragging: true,
    }] as NodeChange<GenerationFlowNode>[]

    const draftNodes = applyCanvasDragPositionChanges(storeNodes, changes)

    expect(storeNodes[0].position).toEqual({ x: 10, y: 0 })
    expect(storeNodes).toEqual([flowNode('a', 10), flowNode('b', 200)])
    expect(draftNodes[0].position).toEqual({ x: 42, y: 18 })
    expect(draftNodes[1]).toBe(storeNodes[1])
    expect(moveNode).not.toHaveBeenCalled()
  })

  it('overlays only draft node geometry and preserves the other projection identities', () => {
    const projected = [flowNode('a', 10), flowNode('b', 200), flowNode('c', 400)]
    const draft = applyCanvasDragPositionChanges(projected, [{
      type: 'position',
      id: 'b',
      position: { x: 230, y: 12 },
      dragging: true,
    }] as NodeChange<GenerationFlowNode>[])

    const rendered = overlayCanvasDragDraft(projected, draft)

    expect(rendered[0]).toBe(projected[0])
    expect(rendered[1]).not.toBe(projected[1])
    expect(rendered[1].position).toEqual({ x: 230, y: 12 })
    expect(rendered[2]).toBe(projected[2])
  })
})
