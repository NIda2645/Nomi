import { describe, expect, it, vi } from 'vitest'
import { commitCanvasNodeDragStop } from './canvasDragWriteback'
import type { GenerationFlowNode } from './generationCanvasReactFlowAdapter'

vi.mock('../../../ui/toast', () => ({ toast: vi.fn() }))
vi.mock('../../adoption/adoptGenerationNode', () => ({ adoptGenerationNode: vi.fn() }))
vi.mock('../../adoption/adoptionReceipt', () => ({ reportAdoptionOutcome: vi.fn() }))
vi.mock('../../workbenchStore', () => ({ useWorkbenchStore: { getState: vi.fn() } }))
vi.mock('../store/generationCanvasStore', () => ({ useGenerationCanvasStore: { getState: vi.fn() } }))
vi.mock('../events/canvasEventEmitter', () => ({ emitCanvasGesture: vi.fn() }))

describe('cancelled canvas drag writeback', () => {
  it.each([{ readOnly: true, active: true }, { readOnly: false, active: false }])('clears temporary ownership without a successful move for %o', ({ readOnly, active }) => {
    const draggedNode = { id: 'shot', position: { x: 50, y: 20 }, data: {} } as GenerationFlowNode
    const draggingRef = { current: active }
    const dragStartPositionsRef = { current: new Map([['shot', { x: 0, y: 0 }]]) }
    const dragDraftNodesRef = { current: [draggedNode] }
    const moveNode = vi.fn(); const commitPersistedChange = vi.fn()
    commitCanvasNodeDragStop({ event: { clientX: 50, clientY: 20 } as MouseEvent, draggedNode, draggedNodes: [draggedNode], readOnly, t: vi.fn() as never, draggingRef, dragStartPositionsRef, dragDraftNodesRef, moveNode, commitPersistedChange })
    expect(draggingRef.current).toBe(false)
    expect(dragStartPositionsRef.current.size).toBe(0)
    expect(dragDraftNodesRef.current).toEqual([])
    expect(moveNode).not.toHaveBeenCalled()
    expect(commitPersistedChange).not.toHaveBeenCalled()
  })
})
