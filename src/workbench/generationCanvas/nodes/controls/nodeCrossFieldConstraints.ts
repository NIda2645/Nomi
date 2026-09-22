import { remainingReferenceCapacity } from '../../../../../electron/shared/videoCapabilities/crossFieldConstraints'
import type { ArchetypeMode } from '../../../../../electron/shared/modelArchetypes'
import type { GenerationCanvasNode, GenerationCanvasEdge } from '../../model/generationCanvasTypes'
import { resolveReferenceSlots } from '../../runner/referenceSlots'

/** Includes uploaded assets, connected assets and pending edges in the same budget. */
export function nodeReferenceCapacity(
  mode: ArchetypeMode,
  node: GenerationCanvasNode,
  nodes: GenerationCanvasNode[],
  edges: GenerationCanvasEdge[],
): number {
  return remainingReferenceCapacity(mode, Object.fromEntries(
    resolveReferenceSlots(node, nodes, edges).map(slot => [slot.slotKind, slot.fills.length]),
  ))
}
