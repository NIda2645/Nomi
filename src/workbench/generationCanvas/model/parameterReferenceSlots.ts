import { parseModelParameterControls, type ModelParameterControl } from '../../../config/modelCatalogMeta'
import type { GenerationCanvasEdge, GenerationCanvasEdgeMode, GenerationCanvasNode } from './generationCanvasTypes'
import { getGenerationNodeDefinition, getGenerationNodeExecutionKind } from './generationNodeKinds'
import { sortEdgesByOrder } from './graphOps'

export type ImageUrlGroup = 'first_frame' | 'last_frame' | 'reference'
export type ImageUrlSlot = { key: string; label: string; group: ImageUrlGroup; mediaKind?: 'image' | 'video' }
export type ParameterReferenceAssignment = { slot: ImageUrlSlot; edge?: GenerationCanvasEdge }
const DECLARATION_KEY = 'parameterReferenceSlots'
const IMAGE_KEYS = ['imageurl', 'imgurl', 'imageurls', 'inputurl', 'inputurls', 'inputimage', 'inputimg', 'imageinput', 'referenceimage', 'refimage', 'initimage', 'sourceimage', 'sourceimg', 'startimage', 'endimage', 'firstframe', 'lastframe', 'frameurl', 'photourl']
const FIRST_KEYS = ['firstframe', 'firstimage', 'startframe', 'startimage', 'initialframe']
const LAST_KEYS = ['lastframe', 'lastimage', 'endframe', 'endimage', 'finalframe']

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function modelIdentity(meta: Record<string, unknown>): { modelKey: string; vendorKey: string } {
  return {
    modelKey: text(meta.modelKey) || text(meta.modelAlias) || text(meta.imageModel) || text(meta.videoModel),
    vendorKey: text(meta.modelVendor) || text(meta.vendor) || text(meta.imageModelVendor) || text(meta.videoModelVendor),
  }
}

export function looksLikeImageUrlControl(control: ModelParameterControl): boolean {
  if (control.type === 'image-url') return true
  if (control.type !== 'text') return false
  const key = control.key.toLowerCase().replace(/[-_]/g, '')
  return IMAGE_KEYS.some((fragment) => key.includes(fragment))
}

export function buildImageUrlSlots(meta: unknown): ImageUrlSlot[] {
  return parseModelParameterControls(meta).filter(looksLikeImageUrlControl).map((control): ImageUrlSlot => {
    const key = control.key.toLowerCase().replace(/[-_]/g, '')
    const mediaKind = control.mediaKind
    const group: ImageUrlGroup = mediaKind === 'video' ? 'reference'
      : FIRST_KEYS.some((fragment) => key.includes(fragment)) ? 'first_frame'
        : LAST_KEYS.some((fragment) => key.includes(fragment)) ? 'last_frame' : 'reference'
    return { key: control.key, label: control.label, group, ...(mediaKind ? { mediaKind } : {}) }
  }).filter((slot, index, slots) => slots.findIndex((candidate) => candidate.key === slot.key) === index)
}

/** The declaration is a catalog-derived contract, never a snapshot of source URLs. */
export function projectParameterReferenceSlots(meta: Record<string, unknown>, catalogMeta: unknown): Record<string, unknown> {
  const next = { ...meta }
  const previous = record(next[DECLARATION_KEY])
  const identity = modelIdentity(next)
  const slots = buildImageUrlSlots(catalogMeta)
  const slotsByKey = new Map(slots.map((slot) => [slot.key, slot]))
  const changedModel = previous.modelKey !== identity.modelKey || previous.vendorKey !== identity.vendorKey
  const previousSlots = (Array.isArray(previous.slots) ? previous.slots : []).map(record)
  for (const item of previousSlots) {
    const key = text(item.key)
    const mediaChanged = (item.mediaKind ?? 'image') !== (slotsByKey.get(key)?.mediaKind ?? 'image')
    if (key && (changedModel || !slotsByKey.has(key) || mediaChanged)) {
      const url = text(meta[key])
      if (url && ['first_frame', 'last_frame', 'reference'].includes(String(item.group))
        && previousSlots.filter((slot) => slot.group === item.group).length === 1) {
        const oldSlot: ImageUrlSlot = { key, label: key, group: item.group as ImageUrlGroup,
          ...(item.mediaKind === 'video' ? { mediaKind: 'video' } : {}) }
        // Only remove exact mirrors created by the unique old slot; independent values and current keys survive.
        for (const [alias, value] of Object.entries(parameterReferenceMetaPatch(oldSlot, [oldSlot], url))) {
          if (alias !== key && value !== null && !slotsByKey.has(alias) && JSON.stringify(next[alias]) === JSON.stringify(value)) delete next[alias]
        }
      }
      delete next[key]
      delete next[`${key}_nodeRef`]
    }
  }
  delete next[DECLARATION_KEY]
  if (slots.length && identity.modelKey) next[DECLARATION_KEY] = { ...identity, slots }
  return next
}

export function readParameterReferenceSlots(meta: Record<string, unknown> | undefined): ImageUrlSlot[] {
  if (!meta) return []
  const declaration = record(meta[DECLARATION_KEY])
  const identity = modelIdentity(meta)
  if (declaration.modelKey !== identity.modelKey || declaration.vendorKey !== identity.vendorKey) return []
  if (!Array.isArray(declaration.slots)) return []
  const seen = new Set<string>()
  return declaration.slots.flatMap((value): ImageUrlSlot[] => {
    const slot = record(value)
    const key = text(slot.key)
    if (!key || seen.has(key) || !['reference', 'first_frame', 'last_frame'].includes(String(slot.group))) return []
    seen.add(key)
    return [{ key, label: text(slot.label) || key, group: slot.group as ImageUrlGroup,
      ...(slot.mediaKind === 'image' || slot.mediaKind === 'video' ? { mediaKind: slot.mediaKind } : {}),
    }]
  })
}

export function edgeModeForGroup(group: ImageUrlGroup): GenerationCanvasEdgeMode { return group }

export function acceptsParameterReferenceSource(slot: ImageUrlSlot, source: GenerationCanvasNode | undefined, mode?: GenerationCanvasEdgeMode): boolean {
  if (!source) return false
  const execution = getGenerationNodeExecutionKind(source.kind)
  const kind = execution === 'video' || source.result?.type === 'video' ? 'video'
    : execution === 'image' || getGenerationNodeDefinition(source.kind).providesImageReference ? 'image' : null
  if (slot.mediaKind !== 'video' && kind === 'video'
    && (slot.group === 'first_frame' || (slot.group === 'reference' && mode === 'first_frame'))) return true
  if (slot.mediaKind) return kind === slot.mediaKind
  return kind === 'image'
}

/** Explicit keys reserve their slot first. Each legacy edge then occupies exactly one free compatible slot. */
export function resolveParameterReferenceAssignments(
  target: GenerationCanvasNode,
  nodes: readonly GenerationCanvasNode[],
  edges: readonly GenerationCanvasEdge[],
  slots: readonly ImageUrlSlot[] = readParameterReferenceSlots(target.meta),
): ParameterReferenceAssignment[] {
  if (!slots.length) return []
  return resolveIndexedParameterReferenceAssignments(target, slots, new Map(nodes.map((node) => [node.id, node])),
    sortEdgesByOrder(edges.filter((edge) => edge.target === target.id)))
}

/** Consumers that already index the graph reuse their index; only this function assigns slots. */
export function resolveIndexedParameterReferenceAssignments(
  target: GenerationCanvasNode,
  slots: readonly ImageUrlSlot[],
  nodesById: ReadonlyMap<string, GenerationCanvasNode>,
  incoming: readonly GenerationCanvasEdge[],
): ParameterReferenceAssignment[] {
  const assignments: ParameterReferenceAssignment[] = slots.map((slot) => ({ slot }))
  for (const edge of incoming) {
    if (!edge.targetParamKey) continue
    const assignment = assignments.find(({ slot }) => slot.key === edge.targetParamKey)
    if (assignment && !assignment.edge && acceptsParameterReferenceSource(assignment.slot, nodesById.get(edge.source), edge.mode)) assignment.edge = edge
  }
  const hasReference = slots.some((slot) => slot.group === 'reference')
  for (const edge of incoming) {
    if (edge.targetParamKey) continue
    const available = ({ slot, edge: assigned }: ParameterReferenceAssignment) =>
      !assigned && !text(target.meta?.[slot.key]) && acceptsParameterReferenceSource(slot, nodesById.get(edge.source), edge.mode)
    const assignment = edge.mode === 'first_frame'
      ? assignments.find((candidate) => candidate.slot.group === 'first_frame' && available(candidate))
        ?? assignments.find((candidate) => candidate.slot.group === 'reference' && candidate.slot.mediaKind !== 'video' && available(candidate))
      : assignments.find((candidate) => available(candidate) && (edge.mode === 'last_frame'
        ? candidate.slot.group === 'last_frame' : candidate.slot.group === 'reference' || !hasReference))
    if (assignment) assignment.edge = edge
  }
  return assignments
}

/** Persist the derived identity once so removing a middle slot never shifts surviving references. */
export function normalizeParameterEdges(nodes: readonly GenerationCanvasNode[], edges: GenerationCanvasEdge[]): GenerationCanvasEdge[] {
  const pendingTargets = new Set(edges.filter((edge) => !edge.targetParamKey).map((edge) => edge.target))
  if (!pendingTargets.size) return edges
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const slotsByTarget = new Map([...pendingTargets].flatMap((id) => {
    const slots = readParameterReferenceSlots(nodesById.get(id)?.meta)
    return slots.length ? [[id, slots] as const] : []
  }))
  if (!slotsByTarget.size) return edges
  const incomingByTarget = new Map<string, GenerationCanvasEdge[]>()
  for (const edge of sortEdgesByOrder(edges)) {
    const targetId = edge.target
    if (!slotsByTarget.has(targetId)) continue
    const incoming = incomingByTarget.get(targetId)
    if (incoming) incoming.push(edge)
    else incomingByTarget.set(targetId, [edge])
  }
  const keyByEdge = new Map<string, string>()
  for (const [targetId, slots] of slotsByTarget) {
    for (const { slot, edge } of resolveIndexedParameterReferenceAssignments(nodesById.get(targetId)!, slots, nodesById, incomingByTarget.get(targetId) || [])) {
      if (edge && !edge.targetParamKey) keyByEdge.set(edge.id, slot.key)
    }
  }
  if (!keyByEdge.size) return edges
  return edges.map((edge) => keyByEdge.has(edge.id) ? { ...edge, targetParamKey: keyByEdge.get(edge.id)! } : edge)
}

export function nextParameterReferenceKey(
  target: GenerationCanvasNode,
  nodes: readonly GenerationCanvasNode[],
  edges: readonly GenerationCanvasEdge[],
  source: string,
  mode: GenerationCanvasEdgeMode = 'reference',
): string | undefined {
  const candidate: GenerationCanvasEdge = { id: '__new_parameter_reference__', source, target: target.id, mode }
  return resolveParameterReferenceAssignments(target, nodes, [...edges, candidate])
    .find((assignment) => assignment.edge === candidate)?.slot.key
}

/** Upload/removal touches one parameter; legacy aliases are safe only for a unique semantic slot. */
export function parameterReferenceMetaPatch(slot: ImageUrlSlot, slots: readonly ImageUrlSlot[], url: string | null): Record<string, unknown> {
  const patch: Record<string, unknown> = { [slot.key]: url, [`${slot.key}_nodeRef`]: null }
  if (slot.mediaKind === 'video' || slots.filter((candidate) => candidate.group === slot.group).length !== 1) return patch
  if (slot.group === 'first_frame') Object.assign(patch, { firstFrameUrl: url, firstFrameRef: null })
  else if (slot.group === 'last_frame') Object.assign(patch, { lastFrameUrl: url, lastFrameRef: null })
  else Object.assign(patch, { referenceImages: url ? [url] : [], referenceImageUrl: url, referenceImageRef: null })
  return patch
}
