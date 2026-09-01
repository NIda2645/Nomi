import { applyNodeChanges, type NodeChange } from '@xyflow/react'
import type { GenerationFlowNode } from './generationCanvasReactFlowAdapter'

/**
 * Keeps high-frequency node geometry in React Flow's interaction layer.
 * The domain nodes are never passed to applyNodeChanges.
 */
export function applyCanvasDragPositionChanges(
  nodes: readonly GenerationFlowNode[],
  changes: readonly NodeChange<GenerationFlowNode>[],
): GenerationFlowNode[] {
  const positionChanges = changes.filter((change) => change.type === 'position' && change.position)
  if (positionChanges.length === 0) return nodes as GenerationFlowNode[]
  return applyNodeChanges(positionChanges, [...nodes])
}

/**
 * Reuses the latest projection for every node except the nodes whose draft
 * position changed. This keeps the React Flow controlled list identity stable
 * for the rest of the canvas while edges continue to read Flow's live geometry.
 */
export function overlayCanvasDragDraft(
  projectedNodes: readonly GenerationFlowNode[],
  draftNodes: readonly GenerationFlowNode[],
): GenerationFlowNode[] {
  const draftById = new Map(draftNodes.map((node) => [node.id, node]))
  return projectedNodes.map((node) => {
    const draft = draftById.get(node.id)
    if (!draft || (draft.position.x === node.position.x && draft.position.y === node.position.y)) return node
    return {
      ...node,
      position: { ...draft.position },
    }
  })
}
