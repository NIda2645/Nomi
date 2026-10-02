import type { PendingSpendShot } from '../../../desktop/productionRunBridgeTypes'
import type { SpendReferenceInput } from '../../../../electron/shared/contracts/pendingSpendConfirm'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import { resolveReferenceSlots } from '../../generationCanvas/runner/referenceSlots'
import { applyArchetypeModeSwitch, referenceSlotAccept, referenceSlotStorage } from '../../generationCanvas/nodes/controls/archetypeMeta'
import { archetypeForNode, resolveModeForConnectedReferences } from '../../generationCanvas/agent/referenceEdgeCapability'
import { readParameterReferenceSlots, parameterReferenceMetaPatch } from '../../generationCanvas/model/parameterReferenceSlots'

type ReferenceRole = NonNullable<Extract<SpendReferenceInput, { kind: unknown }>['role']>
function slotRole(kind: string, numbered: boolean): ReferenceRole {
  return kind === 'first_frame' || kind === 'last_frame' ? kind
    : kind === 'audio_ref' ? 'audio' : numbered ? 'character' : 'reference'
}
export function pendingReferenceInputs(shot: PendingSpendShot): SpendReferenceInput[] {
  return (shot.references ?? []).map(({ url, ...reference }) => ({ reference, ...(url ? { url } : {}) }))
}

/** 画布那一份图（只读）：卡上这一镜的占位节点此刻连着什么。 */
export type SpendCanvasGraph = Readonly<{ nodes: readonly GenerationCanvasNode[]; edges: readonly GenerationCanvasEdge[] }>

/**
 * 画布上连到这一镜的参考图（付费卡第 4 条：卡上所见即所发）。`target` 是卡上那张框（id 就是占位节点的 id），
 * 按它此刻的生成方式读画布自己那一份槽位解析（`resolveReferenceSlots`，和节点生成时同一个），只读、不写画布。
 * 只收已经能用的（有 url）：连了线但源还没出图的，此刻发不出去，卡上也不说它会被发出去。
 */
export function canvasReferenceInputs(
  target: GenerationCanvasNode,
  nodes: readonly GenerationCanvasNode[],
  edges: readonly GenerationCanvasEdge[],
): SpendReferenceInput[] {
  const inputs: SpendReferenceInput[] = []
  for (const slot of resolveReferenceSlots(target, nodes as GenerationCanvasNode[], edges as GenerationCanvasEdge[])) {
    for (const fill of slot.fills) {
      if (fill.origin.type !== 'edge' || !fill.url) continue
      inputs.push({ url: fill.url, kind: referenceSlotAccept(slot.slotKind), role: slotRole(slot.slotKind, slot.numbered) })
    }
  }
  return inputs
}

/**
 * 卡上这一镜默认摆出来的参考 = 宿主那一镜自己的 ∪ 画布上连到它占位节点的（同一张图不重复放）。
 *
 * 生成方式按画布那一条规则对齐活边：宿主那一镜可能停在没有参考槽的模式上（文生图），画布上连着的参考图就摆不进卡、
 * 也发不出去（2026-10-02 pb02：卡上写「文生图」，供应商收到 0 张）。画布自己在连线、换模型、提交三处都用
 * `resolveModeForConnectedReferences` 把节点切到收得下这几条边的模式（`applyArchetypeModeSwitch` 顺带把越界的参数夹回）；
 * 卡读同一对函数，不另写一条规则。卡上之后的改动（含拿掉这张、改回文生图）都相对这一份记，见 `candidatePatchFromNode`。
 */
export function placeSpendReferences(
  node: GenerationCanvasNode,
  own: readonly SpendReferenceInput[],
  canvas?: SpendCanvasGraph,
): GenerationCanvasNode {
  if (!canvas) return applySpendReferences(node, own)
  const modeId = resolveModeForConnectedReferences(node, canvas.nodes, canvas.edges)
  const archetype = modeId ? archetypeForNode(node) : null
  const moded = modeId && archetype ? { ...node, meta: applyArchetypeModeSwitch({ ...(node.meta ?? {}) }, archetype, modeId) } : node
  const urls = new Set(own.map((input) => input.url).filter((url): url is string => Boolean(url)))
  const fromCanvas = canvasReferenceInputs(moded, canvas.nodes, canvas.edges).filter((input) => !input.url || !urls.has(input.url))
  return applySpendReferences(moded, [...own, ...fromCanvas])
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
