import { z } from 'zod'
import { spendReferenceInputSchema, type SpendReferenceInput } from '../../../../electron/shared/contracts/pendingSpendConfirm'
import { applySpendReferences, pendingReferenceInputs, referenceInputsFromNode } from './spendCardReferences'
// 付费确认卡上「用户改了什么」的**纯账本**（无 React、无 store、可裸测）。
//
// ── 它在解决哪个真实摩擦 ──
//
// 在 2026-09-11 之前，卡体直接绑着画布上那个草稿节点：卡上改一个字，画布节点当场就变了。
// 两件坏事跟着来：
//   ① 用户还没答应花钱，画布已经被改了——「我只是看看」变成了「我已经动过了」；
//   ② 落地链在候选每前进一版时都会按候选重画那个节点，于是「节点写候选」和「候选写节点」
//      两个方向同时开着，每改一个参数就是一场拉锯（实测：计划连推三版、最后弹回参数默认值）。
//      那场拉锯正是上一轮「改参数不能实时重算价格」的根因（docs/plan/2026-09-11 已知缺口 1）。
//
// 这个文件把编辑意图从画布上**摘下来**，放进一份自己的账本：
//   · 改动只落在这里，画布节点在按下「生成」之前一个字都不动；
//   · 因为不再回写节点，落地链那一侧永远是单向的（候选 → 节点），拉锯没有了；
//   · 价格随时可以按这份账本**本地**重算（`spendCardEstimate.ts`），不必等一个来回。
//
// ── 两层覆写：全部 / 逐镜 ──
//
// 「全部」模式下改的是**这一批的公共值**，「逐镜」模式下改的是**这一镜自己的值**。
// 逐镜层压在全部层上面（2026-09-11 用户拍板：逐镜覆写优先于全部），两层各自留着，
// 来回切模式谁也不会被抹掉。
//
// 卡体显示的是**正在编辑的那一层**：「全部」模式显示 `镜 ⊕ 全部层`，「逐镜」模式显示
// `镜 ⊕ 全部层 ⊕ 这一镜层`。不这么分会出一个很坏的手感——在「全部」模式下改一个
// 已经有逐镜覆写的字段，按优先级它改了也看不见，用户读到的是「改了又弹回去」。
// 价格与最终落盘一律按**优先级后的有效值**算，显示层的分层只影响「你此刻在编哪一层」。
import { resolveArchetypeForModel } from '../../../config/modelArchetypes'
import { resolveRenderedControls } from '../../generationCanvas/nodes/nodeModelArchetype'
import type { ModelOption } from '../../../config/models'
import { isGenerationNodeKind } from '../../generationCanvas/model/generationNodeKinds'
import type { PendingSpendConfirm, PendingSpendShot } from '../../../desktop/productionRunBridgeTypes'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'

/** 候选里用户能在卡上改的那几件（就是「供应商会收到的那份载荷」的可编辑面）。 */
const spendCandidatePatchSchema = z.object({
  prompt: z.string().optional(),
  modelId: z.string().optional(),
  providerId: z.string().optional(),
  modeId: z.string().optional(),
  parameters: z.record(z.unknown()).readonly().optional(),
  referenceInputs: z.array(spendReferenceInputSchema).readonly().optional(),
}).strict().readonly()
export type SpendCandidatePatch = z.infer<typeof spendCandidatePatchSchema>

/** Both editable layers share the same persistence contract. Parameter values remain model-owned. */
const spendDraftSchema = z.object({
  all: spendCandidatePatchSchema,
  perShot: z.record(spendCandidatePatchSchema).readonly(),
}).strict().readonly()
export type SpendDraft = z.infer<typeof spendDraftSchema>

export const EMPTY_SPEND_DRAFT: SpendDraft = Object.freeze({ all: Object.freeze({}), perShot: Object.freeze({}) })

export type SpendScope = 'each' | 'all'

/** 这一镜的有效候选（参数逐键浅合并；后者赢）。 */
export function mergeCandidatePatch(
  base: SpendCandidatePatch,
  overlay: SpendCandidatePatch,
): SpendCandidatePatch {
  const merged: Record<string, unknown> = { ...base, ...overlay }
  if (base.parameters || overlay.parameters) {
    merged.parameters = { ...(base.parameters ?? {}), ...(overlay.parameters ?? {}) }
  }
  return merged as SpendCandidatePatch
}

/**
 * 这一镜最终会被封印的那一份（逐镜层压全部层）。`view` 给的是**卡体此刻该显示哪一层**：
 * `'all'` 只叠公共层，`'each'`（默认）叠到逐镜层。
 */
export function effectivePatchForShot(
  draft: SpendDraft,
  shotId: string,
  view: SpendScope = 'each',
): SpendCandidatePatch {
  if (view === 'all') return draft.all
  return mergeCandidatePatch(draft.all, draft.perShot[shotId] ?? {})
}

/** 有效候选 = 宿主投影的那一镜 ⊕ 覆写。只回算价与落盘认识的那几个字段。 */
export function effectiveCandidate(
  shot: PendingSpendShot,
  patch: SpendCandidatePatch,
): Readonly<{ providerId: string; modelId: string; parameters: Record<string, unknown> }> {
  return Object.freeze({
    providerId: patch.providerId ?? shot.providerId,
    modelId: patch.modelId ?? shot.modelId,
    parameters: { ...shot.parameters, ...(patch.parameters ?? {}) },
  })
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function archetypeOf(meta: Record<string, unknown>): Record<string, unknown> {
  return meta.archetype && typeof meta.archetype === 'object' && !Array.isArray(meta.archetype)
    ? (meta.archetype as Record<string, unknown>)
    : {}
}

/**
 * 覆写 → 节点（卡体绑的那份草稿节点）。**不写 store**：这个节点对象只活在卡里。
 *
 * 字段对照就是候选与节点 meta 之间那张唯一的映射表，与 {@link candidatePatchFromNode} 互为逆向；
 * 两个方向写在同一个文件里，才不会有一天一边加了字段另一边忘了（那正是「双账本」的长法）。
 */
export function applyPatchToNode(node: GenerationCanvasNode, patch: SpendCandidatePatch): GenerationCanvasNode {
  const meta = { ...((node.meta ?? {}) as Record<string, unknown>) }
  if (patch.modelId) meta.modelKey = patch.modelId
  if (patch.providerId) meta.modelVendor = patch.providerId
  if (patch.modeId) meta.archetype = { ...archetypeOf(meta), modeId: patch.modeId }
  for (const [key, value] of Object.entries(patch.parameters ?? {})) meta[key] = value
  const referencedNode = patch.referenceInputs ? applySpendReferences({ ...node, meta }, patch.referenceInputs) : { ...node, meta }
  return {
    ...referencedNode,
    ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
    meta: referencedNode.meta,
  }
}

/**
 * 节点现在的样子 → 候选补丁。复用参数条的控件解析，保留原候选字段并收集新声明字段。
 */
export function candidatePatchFromNode(
  node: GenerationCanvasNode,
  shot: PendingSpendShot,
  option?: ModelOption,
  baselineReferenceInputs?: readonly SpendReferenceInput[],
): SpendCandidatePatch | undefined {
  const meta = (node.meta ?? {}) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  const prompt = typeof node.prompt === 'string' ? node.prompt : ''
  if (prompt !== shot.prompt) patch.prompt = prompt
  const modelId = text(meta.modelKey)
  if (modelId && modelId !== shot.modelId) patch.modelId = modelId
  const providerId = text(meta.modelVendor) || text(meta.vendor)
  if (providerId && providerId !== shot.providerId) patch.providerId = providerId
  const modeId = text(archetypeOf(meta).modeId)
  if (modeId && modeId !== (shot.modeId ?? '')) patch.modeId = modeId
  const referenceInputs = referenceInputsFromNode(node, shot)
  const baselineReferences = referenceInputsFromNode(applySpendReferences(node, baselineReferenceInputs ?? pendingReferenceInputs(shot)), shot)
  if (JSON.stringify(referenceInputs) !== JSON.stringify(baselineReferences)) patch.referenceInputs = referenceInputs
  const parameters: Record<string, unknown> = {}
  let parametersChanged = false
  const selected = option ?? { modelKey: text(meta.modelKey), vendor: text(meta.modelVendor), value: text(meta.modelKey), label: text(meta.modelKey), kind: node.kind }
  const controls = resolveRenderedControls(selected as ModelOption, meta, node.kind === 'image', node.kind === 'video')
  const keys = new Set([...Object.keys(shot.parameters), ...controls.map(control => control.binding === 'parameter' ? control.key : control.binding)])
  for (const key of keys) {
    const next = meta[key]
    parameters[key] = next === undefined ? shot.parameters[key] : next
    if (next !== undefined && next !== shot.parameters[key]) parametersChanged = true
  }
  if (parametersChanged) patch.parameters = parameters
  return Object.keys(patch).length > 0 ? (patch as SpendCandidatePatch) : undefined
}

/**
 * 用户在卡上动了一下之后的新账本。
 *
 * `scope` 决定这一下落到哪一层：「全部」落公共层、「逐镜」落这一镜层——**另一层原样留着**
 * （切模式不丢覆写）。每层相对下层计算：全部对宿主，逐镜对「宿主＋全部」。
 * 因此逐镜改回宿主原值时，仍能明确盖过全部层的不同值。
 */
export function draftAfterNodeEdit(
  draft: SpendDraft,
  shot: PendingSpendShot,
  node: GenerationCanvasNode,
  scope: SpendScope,
  option?: ModelOption,
): SpendDraft {
  if (scope === 'all') return { all: candidatePatchFromNode(node, shot, option) ?? {}, perShot: draft.perShot }
  const inherited = { ...shot, ...draft.all, parameters: { ...shot.parameters, ...draft.all.parameters } }
  const patch = candidatePatchFromNode(node, inherited, option, draft.all.referenceInputs) ?? {}
  return { all: draft.all, perShot: { ...draft.perShot, [shot.shotId]: patch } }
}

/** 这一批到底有没有被改过（没有 → 确认那一刻不必先发 `generation.revise`）。 */
export function draftIsEmpty(draft: SpendDraft): boolean {
  if (Object.keys(draft.all).length > 0) return false
  return Object.values(draft.perShot).every((patch) => Object.keys(patch).length === 0)
}

/**
 * 确认那一刻要发给主进程的改稿清单：每一镜一条（有改动的才发）。
 *
 * 这就是**回写画布草稿节点**的唯一时机——主进程落完补丁会把计划投影回画布
 * （`notifyPlanChanged` → 落地链），节点跟着变。卡这边从头到尾没碰过画布，
 * 所以「候选 → 节点」始终是单向的。
 */
export function revisionsForConfirm(
  shots: readonly PendingSpendShot[],
  draft: SpendDraft,
  targetShotIds?: readonly string[],
): readonly Readonly<{ shotId: string; patch: SpendCandidatePatch }>[] {
  const wanted = targetShotIds ? new Set(targetShotIds) : undefined
  return shots
    .filter((shot) => !wanted || wanted.has(shot.shotId))
    .map((shot) => {
      const patch = effectivePatchForShot(draft, shot.shotId)
      if (!patch.referenceInputs) return { shotId: shot.shotId, patch }
      // The 'all' layer may carry the visible shot's pinned reference. Other shots
      // request the same media by URL; they cannot claim that identity was theirs.
      const referenceInputs = patch.referenceInputs.map(input => {
        if (!('reference' in input) || !input.url || !input.reference.kind) return input
        const retained = shot.references?.some(reference => reference.assetId === input.reference.assetId
          && reference.contentHash === input.reference.contentHash && reference.version === input.reference.version
          && reference.kind === input.reference.kind && reference.role === input.reference.role)
        return retained ? input : { url: input.url, kind: input.reference.kind,
          ...(input.reference.role ? { role: input.reference.role } : {}) }
      })
      return { shotId: shot.shotId, patch: { ...patch, referenceInputs } }
    })
    .filter((entry) => Object.keys(entry.patch).length > 0)
}

/** Candidate data is the editor input; a placed canvas node supplies geometry only. */
export function projectSpendNode(shot: PendingSpendShot, placed?: GenerationCanvasNode, option?: ModelOption): GenerationCanvasNode | undefined {
  const archetype = resolveArchetypeForModel({ modelKey: shot.modelId, vendorKey: shot.providerId, meta: option?.meta })
  const kind = option?.kind ?? archetype?.kind ?? placed?.kind
  if (!isGenerationNodeKind(kind)) return undefined
  return applySpendReferences({
    id: shot.nodeId ?? `spend:${shot.shotId}`,
    kind,
    title: placed?.title ?? '',
    position: placed?.position ?? { x: 0, y: 0 },
    prompt: shot.prompt,
    meta: {
      ...shot.parameters,
      modelKey: shot.modelId,
      modelVendor: shot.providerId,
      ...(option ? { modelLabel: option.label } : {}),
      ...(archetype ? { archetype: { id: archetype.id, modeId: shot.modeId ?? archetype.defaultModeId } } : {}),
    },
  }, pendingReferenceInputs(shot))
}

/** Card-local unapproved edits, bound to the exact displayed request. Never a plan write. */
export function spendDraftKey(pending: { projectId: string; runId: string; operationId: string; quoteId: string; planVersion: number; candidateRevision: number }): string {
  return 'nomi:spend-draft:' + JSON.stringify([pending.projectId, pending.runId, pending.operationId, pending.quoteId, pending.planVersion, pending.candidateRevision])
}
export function readSpendDraft(key: string): SpendDraft {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return EMPTY_SPEND_DRAFT
    const value: unknown = JSON.parse(raw)
    // Validate without applying reference-schema transforms to saved user input.
    return spendDraftSchema.safeParse(value).success ? value as SpendDraft : EMPTY_SPEND_DRAFT
  } catch { return EMPTY_SPEND_DRAFT }
}
export function retainSpendDraft(key: string, draft: SpendDraft, pending?: PendingSpendConfirm): void {
  if (draftIsEmpty(draft)) localStorage.removeItem(key)
  else localStorage.setItem(key, JSON.stringify(draft))
  // Keep existing partial-recovery entries current when the user edits again.
  // Ordinary dismissed drafts retain their original whole-scope recovery policy.
  for (const shot of pending?.shots ?? []) {
    const recoveryKey = dismissedSpendDraftKey({ ...pending!, shots: [shot] })
    if (draftIsEmpty(readSpendDraft(recoveryKey))) continue
    const patch = effectivePatchForShot(draft, shot.shotId)
    retainSpendDraft(recoveryKey, { all: {}, perShot: { [shot.shotId]: patch } })
  }
}

/** Recovery is input-bound, never price/quote-bound; the live writer remains quote-bound. */
function dismissedSpendDraftKey(pending: PendingSpendConfirm): string {
  const shots = pending.shots.map(({ shotId, modelId, providerId, mode, modeId, prompt, parameters, references }) => ({
    shotId, modelId, providerId, mode, modeId, prompt, parameters,
    references: references?.map(({ url: _url, ...identity }) => identity) ?? [],
  }))
  return 'nomi:dismissed-spend-draft:' + JSON.stringify([pending.projectId, pending.runId, pending.operationId, shots])
}
export function retainDismissedSpendDraft(pending: PendingSpendConfirm, draft: SpendDraft): void {
  retainSpendDraft(dismissedSpendDraftKey(pending), draft, pending)
  retainSpendDraft(spendDraftKey(pending), EMPTY_SPEND_DRAFT)
}
export function restoreSpendDraft(pending: PendingSpendConfirm): SpendDraft {
  const exact = readSpendDraft(spendDraftKey(pending))
  if (!draftIsEmpty(exact)) return exact
  const key = dismissedSpendDraftKey(pending)
  const recovered = readSpendDraft(key)
  if (!draftIsEmpty(recovered)) {
    retainSpendDraft(spendDraftKey(pending), recovered)
    retainSpendDraft(key, EMPTY_SPEND_DRAFT)
  }
  if (!draftIsEmpty(recovered)) return recovered
  // Partial consumption keeps only unsubmitted shots under this same input-bound
  // key. A later batch can have a different scope, but each shot must still match.
  const perShot: Record<string, SpendCandidatePatch> = {}
  for (const shot of pending.shots) {
    const saved = readSpendDraft(dismissedSpendDraftKey({ ...pending, shots: [shot] }))
    const patch = effectivePatchForShot(saved, shot.shotId)
    if (Object.keys(patch).length) perShot[shot.shotId] = patch
  }
  const remaining = { all: {}, perShot }
  retainSpendDraft(spendDraftKey(pending), remaining)
  return remaining
}
export function clearConsumedSpendDraft(pending: PendingSpendConfirm): void {
  retainSpendDraft(spendDraftKey(pending), EMPTY_SPEND_DRAFT)
  retainSpendDraft(dismissedSpendDraftKey(pending), EMPTY_SPEND_DRAFT)
  for (const shot of pending.shots) retainSpendDraft(dismissedSpendDraftKey({ ...pending, shots: [shot] }), EMPTY_SPEND_DRAFT)
}

/** Consume exactly the durable/approved set, retaining all other input in this ledger. */
export function consumeSpendDraft(
  pending: PendingSpendConfirm, draft: SpendDraft, shotIds?: readonly string[],
  successor: PendingSpendConfirm = pending,
): SpendDraft {
  const consumed = new Set(shotIds ?? pending.shots.map(shot => shot.shotId))
  const perShot: Record<string, SpendCandidatePatch> = {}
  clearConsumedSpendDraft(pending)
  for (const shot of pending.shots) {
    if (consumed.has(shot.shotId)) continue
    const patch = effectivePatchForShot(draft, shot.shotId)
    if (!Object.keys(patch).length) continue
    perShot[shot.shotId] = patch
    retainSpendDraft(dismissedSpendDraftKey({ ...pending, shots: [shot] }), { all: {}, perShot: { [shot.shotId]: patch } })
  }
  const remaining = { all: {}, perShot }
  retainSpendDraft(spendDraftKey(successor), remaining)
  return remaining
}
