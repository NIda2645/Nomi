import type { GenerationCanvasNode } from './generationCanvasTypes'

export type ProductionMeta = { runId: string; shotId?: string }

/** Read the durable production binding stamped on a canvas node. */
export function productionMetaOf(node: Pick<GenerationCanvasNode, 'meta'>): ProductionMeta | null {
  const meta = node.meta as Record<string, unknown> | undefined
  const runId = typeof meta?.productionRunId === 'string' ? meta.productionRunId.trim() : ''
  if (!runId) return null
  const shotId = typeof meta?.productionShotId === 'string' ? meta.productionShotId.trim() : ''
  return { runId, ...(shotId ? { shotId } : {}) }
}
