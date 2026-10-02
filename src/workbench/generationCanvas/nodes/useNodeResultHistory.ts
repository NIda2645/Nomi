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
    setOpenedFor(previous => valid && previous === identity ? previous : null)
  }, [valid, identity])
  // The trigger selects this node in the same event; selection here is the previous render.
  const setOpen = React.useCallback((next: boolean) => setOpenedFor(next && available ? identity : null), [identity, available])
  return [open, setOpen]
}

export function nodeHasResultStack(node: GenerationCanvasNode): boolean {
  if (isCardRenderKind(resolveNodeRenderKind(node)) || node.kind === 'text' || node.kind === 'panorama') return false
  if (!node.result?.url || (node.result.type !== 'image' && node.result.type !== 'video')) return false
  const count = listStableNodeMediaResults(node).length
  // 「N 版」角标只在 ≥2 版时出现。制作流程的单版镜头也不再借它当入口：重拍住在节点浮条里（一功能一个家）。
  return count >= 2
}
