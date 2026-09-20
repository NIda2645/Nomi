import type { TFunction } from 'i18next'
import type { MutableRefObject } from 'react'
import type { OnNodeDrag } from '@xyflow/react'
import { toast } from '../../../ui/toast'
import { useWorkbenchStore } from '../../workbenchStore'
import { clientXToFrame } from '../../timeline/timelineEdit'
import { adoptGenerationNode } from '../../adoption/adoptGenerationNode'
import { reportAdoptionOutcome } from '../../adoption/adoptionReceipt'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { findTimelineDropTarget } from '../nodes/nodeSizing'
import { emitCanvasGesture } from '../events/canvasEventEmitter'
import type { GenerationFlowNode } from './generationCanvasReactFlowAdapter'

type DragPosition = { x: number; y: number }

/** RF owns keyboard movement. Only its synchronous key dispatch may commit outside a drag. */
export function commitCanvasKeyboardPositions(
  positions: readonly { nodeId: string; position: DragPosition }[],
  canWrite: boolean,
): boolean {
  if (!canWrite) return false
  const state = useGenerationCanvasStore.getState()
  const moved = positions.filter(change => {
    const node = state.nodes.find(candidate => candidate.id === change.nodeId)
    return node && (node.position.x !== change.position.x || node.position.y !== change.position.y)
  })
  if (moved.length) {
    state.captureHistory()
    for (const change of moved) state.moveNode(change.nodeId, change.position, { persist: false, emit: false })
    emitCanvasGesture(moved.map(change => ({ type: 'canvas.node.moved', payload: { nodeId: change.nodeId, position: change.position } })))
    state.commitPersistedChange()
  }
  return true
}

type CanvasDragWritebackContext = {
  event: Parameters<OnNodeDrag<GenerationFlowNode>>[0]
  draggedNode: Parameters<OnNodeDrag<GenerationFlowNode>>[1]
  draggedNodes: Parameters<OnNodeDrag<GenerationFlowNode>>[2]
  readOnly: boolean
  t: TFunction
  draggingRef: MutableRefObject<boolean>
  dragStartPositionsRef: MutableRefObject<Map<string, DragPosition>>
  dragDraftNodesRef: MutableRefObject<GenerationFlowNode[]>
  moveNode: ReturnType<typeof useGenerationCanvasStore.getState>['moveNode']
  commitPersistedChange: ReturnType<typeof useGenerationCanvasStore.getState>['commitPersistedChange']
}

export function commitCanvasNodeDragStop({
  event,
  draggedNode,
  draggedNodes,
  readOnly,
  t,
  draggingRef,
  dragStartPositionsRef,
  dragDraftNodesRef,
  moveNode,
  commitPersistedChange,
}: CanvasDragWritebackContext): void {
  const wasDragging = draggingRef.current
  draggingRef.current = false
  if (readOnly || !wasDragging) {
    dragStartPositionsRef.current.clear()
    dragDraftNodesRef.current = []
    return
  }
  const pointer = 'changedTouches' in event ? event.changedTouches[0] : event
  const timelineDropTarget = pointer ? findTimelineDropTarget(pointer.clientX, pointer.clientY) : null
  if (timelineDropTarget) {
    const liveNode = useGenerationCanvasStore.getState().nodes.find((node) => node.id === draggedNode.id)
    if (liveNode?.result?.url) {
      const timeline = useWorkbenchStore.getState().timeline
      const rect = timelineDropTarget.getBoundingClientRect()
      const startFrame = clientXToFrame(pointer.clientX, rect.left, timeline.scale)
      void adoptGenerationNode(liveNode, { placement: { kind: 'frame', startFrame } }).then((outcome) => {
        reportAdoptionOutcome(outcome, { revealTimeline: false })
      })
      commitPersistedChange()
      dragStartPositionsRef.current.clear()
      dragDraftNodesRef.current = []
      return
    }
    toast(t('generationCommon.node.generateBeforeTimeline'), 'info')
  }
  for (const flowNode of draggedNodes) {
    const originalPosition = dragStartPositionsRef.current.get(flowNode.id)
    if (!originalPosition) continue
    if (originalPosition.x === flowNode.position.x && originalPosition.y === flowNode.position.y) continue
    moveNode(flowNode.id, flowNode.position, { persist: false, emit: false })
  }
  const state = useGenerationCanvasStore.getState()
  const movedEvents = draggedNodes
    .map((flowNode) => state.nodes.find((node) => node.id === flowNode.id))
    .filter((node): node is GenerationCanvasNode => Boolean(node))
    .map((node) => ({ type: 'canvas.node.moved' as const, payload: { nodeId: node.id, position: node.position } }))
  if (movedEvents.length) emitCanvasGesture(movedEvents)
  commitPersistedChange()
  dragStartPositionsRef.current.clear()
  dragDraftNodesRef.current = []
}
