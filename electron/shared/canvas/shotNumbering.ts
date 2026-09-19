/** Shot numbers are stable domain identities, shared by renderer, headless writes and Agent reads. */
export type ShotNumberedNode = {
  id: string
  kind: string
  categoryId?: string
  meta?: Record<string, unknown>
  shotIndex?: number
  position?: { x: number; y: number }
}
type ShotEdge = { source: string; target: string; mode?: string }
export type ShotIdentity = {
  shotIndex?: number
  shotRole?: 'first_frame' | 'video' | 'image'
  shotOwnerNodeIds?: string[]
}
const SHOT_NUMBERED_KINDS = new Set(['image', 'video', 'shot', 'keyframe'])

export function isValidShotIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function isShotNumberedNode(node: Pick<ShotNumberedNode, 'kind' | 'categoryId' | 'meta'>): boolean {
  return (node.categoryId ?? 'shots') === 'shots' && SHOT_NUMBERED_KINDS.has(node.kind)
    && node.meta?.referenceSheet !== true && node.meta?.storyboardKeyframe !== true
}

export function nextShotIndex(nodes: readonly { shotIndex?: number }[]): number {
  const max = nodes.reduce((value, node) => isValidShotIndex(node.shotIndex) ? Math.max(value, node.shotIndex) : value, 0)
  if (max === Number.MAX_SAFE_INTEGER) throw new RangeError('Shot number space exhausted')
  return max + 1
}

/** Preserve the first valid owner; repair missing/invalid/conflicting identities deterministically. */
export function backfillShotIndexes<T extends ShotNumberedNode>(nodes: readonly T[]): { nodes: T[]; changed: boolean } {
  const used = new Set<number>()
  const pending: T[] = []
  const owners = nodes.filter(isShotNumberedNode)
  for (const node of owners) {
    if (isValidShotIndex(node.shotIndex) && !used.has(node.shotIndex)) used.add(node.shotIndex)
    else pending.push(node)
  }
  const assigned = new Map<string, number>()
  if (pending.length) {
    let next = nextShotIndex(owners)
    pending.sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0) ||
      (a.position?.x ?? 0) - (b.position?.x ?? 0) || a.id.localeCompare(b.id))
    for (const node of pending) {
      if (!Number.isSafeInteger(next)) throw new RangeError('Shot number space exhausted')
      assigned.set(node.id, next++)
    }
  }
  let changed = false
  const result = nodes.map(node => {
    const number = isShotNumberedNode(node) ? assigned.get(node.id) ?? node.shotIndex : undefined
    if (node.shotIndex === number) return node
    changed = true
    if (number !== undefined) return { ...node, shotIndex: number }
    const { shotIndex: _removed, ...rest } = node
    return rest as T
  })
  return { nodes: result, changed }
}

/** A clone is a new owner, even if the old owner was deleted. Paired frames derive their label from edges. */
export function assignClonedShotIndexes<T extends ShotNumberedNode>(existing: readonly T[], incoming: readonly T[]): T[] {
  let next = nextShotIndex(existing)
  return incoming.map(node => {
    const { shotIndex: _old, ...rest } = node
    if (!isShotNumberedNode(node)) return rest as T
    if (!Number.isSafeInteger(next)) throw new RangeError('Shot number space exhausted')
    return { ...rest, shotIndex: next++ } as T
  })
}

/** No numbering side effects in a reader. Multiple frame owners stay explicit, never guessed. */
export function resolveShotIdentities(nodes: readonly ShotNumberedNode[], edges: readonly ShotEdge[]): Map<string, ShotIdentity> {
  const identities = new Map<string, ShotIdentity>()
  const owners = new Map(nodes.filter(node => isShotNumberedNode(node) && isValidShotIndex(node.shotIndex)).map(node => [node.id, node]))
  const frameTargets = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (edge.mode !== 'first_frame' || owners.get(edge.target)?.kind !== 'video') continue
    const targets = frameTargets.get(edge.source) ?? new Set<string>()
    targets.add(edge.target)
    frameTargets.set(edge.source, targets)
  }
  for (const node of nodes) {
    if ((node.categoryId ?? 'shots') !== 'shots' || node.meta?.referenceSheet === true) continue
    if (node.meta?.storyboardKeyframe === true && (node.kind === 'image' || node.kind === 'keyframe')) {
      const ids = [...(frameTargets.get(node.id) ?? [])]
      identities.set(node.id, { shotRole: 'first_frame', shotOwnerNodeIds: ids,
        ...(ids.length === 1 ? { shotIndex: owners.get(ids[0])!.shotIndex } : {}) })
    } else if (owners.has(node.id)) {
      identities.set(node.id, { shotIndex: node.shotIndex, shotRole: node.kind === 'video' ? 'video' : 'image' })
    }
  }
  return identities
}

/** Only identity edits need whole-batch numbering; prompt/runtime edits retain compact events. */
export function changesShotIdentity(node: Pick<ShotNumberedNode, 'meta'>, patch: Partial<ShotNumberedNode>): boolean {
  return 'shotIndex' in patch || 'kind' in patch || 'categoryId' in patch ||
    ('meta' in patch && (patch.meta?.referenceSheet !== node.meta?.referenceSheet || patch.meta?.storyboardKeyframe !== node.meta?.storyboardKeyframe))
}

