import type { PendingSpendShot } from '../../../desktop/productionRunBridgeTypes'
import type { SpendReferenceInput } from '../../../../electron/shared/contracts/pendingSpendConfirm'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import { resolveReferenceSlots } from '../../generationCanvas/runner/referenceSlots'
import { referenceSlotAccept, referenceSlotStorage } from '../../generationCanvas/nodes/controls/archetypeMeta'
import { readParameterReferenceSlots, parameterReferenceMetaPatch } from '../../generationCanvas/model/parameterReferenceSlots'

type ReferenceRole = NonNullable<Extract<SpendReferenceInput, { kind: unknown }>['role']>
function slotRole(kind: string, numbered: boolean): ReferenceRole {
  return kind === 'first_frame' || kind === 'last_frame' ? kind
    : kind === 'audio_ref' ? 'audio' : numbered ? 'character' : 'reference'
}
export function pendingReferenceInputs(shot: PendingSpendShot): SpendReferenceInput[] {
  return (shot.references ?? []).map(({ url, ...reference }) => ({ reference, ...(url ? { url } : {}) }))
}

/**
 * 画布上连到这一镜占位节点的参考图（付费卡第 4 条：卡上所见即所发）。读的是画布自己那一份槽位解析
 * （`resolveReferenceSlots`，和节点生成时同一个），只读、不写画布。只收已经能用的（有 url）：连了线但源还没出图的，
 * 此刻发不出去，卡上也不说它会被发出去。
 */
export function canvasReferenceInputs(
  placed: GenerationCanvasNode | undefined,
  nodes: readonly GenerationCanvasNode[],
  edges: readonly GenerationCanvasEdge[],
): SpendReferenceInput[] {
  if (!placed) return []
  const inputs: SpendReferenceInput[] = []
  for (const slot of resolveReferenceSlots(placed, nodes as GenerationCanvasNode[], edges as GenerationCanvasEdge[])) {
    for (const fill of slot.fills) {
      if (fill.origin.type !== 'edge' || !fill.url) continue
      inputs.push({ url: fill.url, kind: referenceSlotAccept(slot.slotKind), role: slotRole(slot.slotKind, slot.numbered) })
    }
  }
  return inputs
}

/** Bidirectional presentation adapter over the existing slot resolver, never a second graph. */
export function applySpendReferences(node: GenerationCanvasNode, inputs: readonly SpendReferenceInput[]): GenerationCanvasNode {
  const meta = { ...node.meta }
  const slots = resolveReferenceSlots(node, [], [])
  const parameters = readParameterReferenceSlots(meta)
  for (const slot of slots) {
    const storage = referenceSlotStorage({ kind: slot.slotKind })
    if (storage) meta[storage.metaKey] = storage.isArray ? [] : null
  }
  for (const parameter of parameters) Object.assign(meta, parameterReferenceMetaPatch(parameter, parameters, null))
  for (const input of inputs) {
    if (!input.url) continue
    const reference = 'reference' in input ? input.reference : input
    const kind = reference.kind ?? 'image'
    const slot = slots.find(slot => slot.accept.includes(kind) && slotRole(slot.slotKind, slot.numbered) === (reference.role ?? 'reference'))
      ?? slots.find(slot => slot.accept.includes(kind) && ['character', 'reference'].includes(reference.role ?? 'reference') && ['character', 'reference'].includes(slotRole(slot.slotKind, slot.numbered)))
    const storage = slot && referenceSlotStorage({ kind: slot.slotKind })
    if (storage) {
      if (storage.isArray) meta[storage.metaKey] = [...(Array.isArray(meta[storage.metaKey]) ? meta[storage.metaKey] as string[] : []), input.url]
      else meta[storage.metaKey] = input.url
    } else {
      const parameter = parameters.find(slot => (slot.mediaKind ?? 'image') === kind && slot.group === (reference.role === 'first_frame' || reference.role === 'last_frame' ? reference.role : 'reference') && !meta[slot.key])
      if (parameter) Object.assign(meta, parameterReferenceMetaPatch(parameter, parameters, input.url))
    }
  }
  return { ...node, meta }
}

export function referenceInputsFromNode(node: GenerationCanvasNode, shot: PendingSpendShot): SpendReferenceInput[] {
  const original = pendingReferenceInputs(shot)
  const inputs: SpendReferenceInput[] = []
  const append = (url: string, kind: 'image' | 'video' | 'audio', role: ReferenceRole) => {
    const retained = original.find(input => input.url === url && 'reference' in input && (input.reference.kind ?? kind) === kind
      && ((input.reference.role ?? role) === role || (['character', 'reference'].includes(role) && ['character', 'reference'].includes(input.reference.role ?? 'reference'))))
    const next = retained ?? { url, kind, role }
    if (!inputs.some(input => JSON.stringify(input) === JSON.stringify(next))) inputs.push(next)
  }
  for (const slot of resolveReferenceSlots(node, [], [])) {
    for (const fill of slot.fills) if (fill.url) append(fill.url, referenceSlotAccept(slot.slotKind), slotRole(slot.slotKind, slot.numbered))
  }
  for (const parameter of readParameterReferenceSlots(node.meta)) {
    const url = node.meta?.[parameter.key]
    if (typeof url === 'string' && url) append(url, parameter.mediaKind ?? 'image', parameter.group)
  }
  // Unavailable previews cannot be implicitly deleted by an unrelated parameter edit.
  const slots = resolveReferenceSlots(node, [], [])
  const parameters = readParameterReferenceSlots(node.meta)
  inputs.push(...original.filter(input => {
    if (!input.url) return true
    const reference = 'reference' in input ? input.reference : input
    const role = reference.role ?? 'reference'
    const kind = reference.kind ?? 'image'
    const matches = (candidate: string) => candidate === role || (['character', 'reference'].includes(role) && ['character', 'reference'].includes(candidate))
    return !slots.some(slot => slot.accept.includes(kind) && matches(slotRole(slot.slotKind, slot.numbered)))
      && !parameters.some(parameter => (parameter.mediaKind ?? 'image') === kind && matches(parameter.group))
  }))
  return inputs
}
