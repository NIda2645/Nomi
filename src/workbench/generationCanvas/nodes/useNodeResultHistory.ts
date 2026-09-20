import React from 'react'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { listStableNodeMediaResults } from '../model/nodeResultLifecycle'
import { resolveNodeRenderKind, isCardRenderKind } from './resolveRenderKind'

/** The parent owns history. Availability changes invalidate intent, never prompt data. */
export function useNodeResultHistory({ id, kind, selected, available }: {
  id: string; kind: string; selected: boolean; available: boolean
}): [boolean, (open: boolean) => void] {
  const identity = `${id}:${kind}`
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const valid = selected && available
  const open = valid && openedFor === identity
  React.useEffect(() => {
    if (!valid || (openedFor !== null && openedFor !== identity)) setOpenedFor(null)
  }, [valid, identity, openedFor])
  // The trigger selects this node in the same event; selection here is the previous render.
  const setOpen = React.useCallback((next: boolean) => setOpenedFor(next && available ? identity : null), [identity, available])
  return [open, setOpen]
}

export function productionMetaOf(node: GenerationCanvasNode): { runId: string; shotId?: string } | null {
  const meta = node.meta as Record<string, unknown> | undefined
  const runId = typeof meta?.productionRunId === 'string' ? meta.productionRunId.trim() : ''
  if (!runId) return null
  const shotId = typeof meta?.productionShotId === 'string' ? meta.productionShotId.trim() : ''
  return { runId, ...(shotId ? { shotId } : {}) }
}

export function nodeHasResultStack(node: GenerationCanvasNode): boolean {
  if (isCardRenderKind(resolveNodeRenderKind(node)) || node.kind === 'text' || node.kind === 'panorama') return false
  if (!node.result?.url || (node.result.type !== 'image' && node.result.type !== 'video')) return false
  const count = listStableNodeMediaResults(node).length
  return count >= 2 || (count === 1 && Boolean(productionMetaOf(node)))
}
