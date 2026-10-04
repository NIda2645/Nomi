/**
 * [INPUT]: 依赖 electron/shared/director 的 planPatch / directorPlanSchema、electron/shared/agentCapabilities/directorWrite 的输入类型、
 *          ../model/compiler/directorPlanCompiler 的 compileDirectorPlan、../model/directorShotSummaries 的 summarizeDirectorShots、
 *          ../model/directorPreviewState、../model/directorNodeMeta、../directorSessionRegistry、画布 store / create_nodes / 布局
 * [OUTPUT]: 对外提供 applyDirectorWrite（director.write 在渲染端的领域执行体）、DirectorWriteDomainResult
 * [POS]: 3D-BOX `stage_shot` 的执行那一半。只被 applyCanvasToolCall 在提议事务里调用（审批、收据、changeId、撤销都在外面那层）。
 *        新建：编译 → 建导演节点（工程 + 计划 + 修订号 + 预演标志）；修订：比修订号 → 应用补丁 → 没变化就一个字不写（unchanged）→
 *        重编译 → 编辑器开着走 3a 的唯一外部写口、关着写节点 meta。领域拒绝（过期 / 补丁不成立 / 编译不过 / 目标不在）
 *        不写画布，原样交回，由 lane 翻成模型读得懂的失败。永不花钱。
 *        3c 之前：整份重编译，不叠覆盖层（`reorderedOverrides` / `changedEntities` 恒为空）。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import i18n from '../../../../../i18n'
import { parseDirectorPlan, type DirectorPlan } from '../../../../../../electron/shared/director/directorPlanSchema'
import { applyDirectorPlanEdits, canonicalDirectorPlan, directorPlanRevision } from '../../../../../../electron/shared/director/planPatch'
import type { DirectorWriteInput } from '../../../../../../electron/shared/agentCapabilities/directorWrite'
import { generationCanvasTools, readGenerationCanvasSnapshot } from '../../../agent/generationCanvasTools'
import { layoutPlannedNodes } from '../../../agent/trajectoryLayout'
import { getDefaultCategoryForNodeKind, isVideoLikeGenerationNodeKind } from '../../../model/generationNodeKinds'
import type { GenerationNodeKind } from '../../../model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../../../store/generationCanvasStore'
import { hasDirectorSession, writeExternalDirectorProject } from '../directorSessionRegistry'
import { compileDirectorPlan, type DirectorCompileIssue } from '../model/compiler/directorPlanCompiler'
import { DIRECTOR_NODE_KIND, DIRECTOR_PLAN_META_KEY, DIRECTOR_PREVIEW_META_KEY, DIRECTOR_PROJECT_META_KEY } from '../model/directorNodeMeta'
import { DIRECTOR_PREVIEW_MAX_SECONDS, readDirectorPlanMeta, readDirectorPreview, type DirectorPreviewMeta } from '../model/directorPreviewState'
import { summarizeDirectorShots } from '../model/directorShotSummaries'
import type { DirectorProject } from '../model/directorTypes'

type Issue = { kind: string; message: string; time?: number; ref?: string }
type Cut = { shot: string | null; start: number; end: number; shotSize: string | null; move: string }
type Preview = { status: 'none' | 'rendering' | 'ready' | 'failed'; targetNodeId?: string; attach?: 'video_ref' | 'prompt_only'; reason?: string }

export type DirectorWriteDomainResult =
  | {
      applied: true
      directorNodeId: string
      revision: string
      unchanged: boolean
      plan: DirectorPlan
      issues: Issue[]
      cuts: Cut[]
      touched: string[]
      reorderedOverrides: string[]
      changedEntities: string[]
      preview: Preview
    }
  | { applied: false; rejected: 'stale_revision' | 'invalid_patch' | 'compile_failed' | 'target_missing'; messages: string[]; currentRevision?: string }

export type ApplyDirectorWriteContext = Readonly<{
  inCtx: <T>(fn: () => T) => T
  resolveNodeId: (id: string) => string
  /** 这笔提议的身份：写进预演标志，Host 事后挂接沿用它，撤销把挂接当成同一笔改动。 */
  proposalId?: string
}>

function issuesOf(issues: readonly DirectorCompileIssue[]): Issue[] {
  return issues.map((issue) => {
    const ref = issue.objectId ?? issue.actorId ?? issue.assetId
    return { kind: issue.kind, message: issue.message, ...(issue.time !== undefined ? { time: issue.time } : {}), ...(ref ? { ref } : {}) }
  })
}

/** 逐 cut 实测（测量模块对工程的实测，不读计划值）；cut 名按编译器的稳定机位 id `shot:<name>/camera` 认回计划镜头。 */
function cutsOf(project: DirectorProject): Cut[] {
  return summarizeDirectorShots(project).map((summary) => ({
    shot: summary.cameraId?.match(/^shot:(.+)\/camera$/)?.[1] ?? null,
    start: summary.start,
    end: summary.end,
    shotSize: summary.shotSize,
    move: summary.move,
  }))
}

/** 动作库缺的细节动作（方案拍板 8）：按计划里的角色名 + 语义动作 + 时间窗写成一句，挂接时进视频节点提示词。 */
function missingActionNotes(plan: DirectorPlan, issues: readonly DirectorCompileIssue[]): string[] {
  const notes: string[] = []
  for (const issue of issues) {
    if (issue.kind !== 'missing_asset' || !issue.actorId || !issue.assetId) continue
    const actor = plan.actors.find((candidate) => candidate.id === issue.actorId)
    const action = plan.blocking.find((item) => item.actor === issue.actorId && item.action === issue.assetId)
    const window = action ? `${action.window[0]}–${action.window[1]} 秒` : ''
    const note = `${actor?.desc ?? issue.actorId}${window ? ` ${window}` : ''}：${issue.assetId.replace(/_/g, ' ')}`
    if (!notes.includes(note)) notes.push(note)
  }
  return notes
}

function previewMetaFor(targetNodeId: string | undefined, revision: string, duration: number, proposalId: string | undefined, notes: readonly string[]): DirectorPreviewMeta | undefined {
  if (!targetNodeId) return undefined
  const tooLong = duration > DIRECTOR_PREVIEW_MAX_SECONDS + 1e-6
  return {
    status: tooLong ? 'failed' : 'rendering',
    targetNodeId,
    revision,
    ...(notes.length ? { notes: [...notes] } : {}),
    ...(proposalId ? { proposalId } : {}),
    ...(tooLong ? { reason: 'too_long' as const } : {}),
    updatedAt: Date.now(),
  }
}

function previewView(meta: DirectorPreviewMeta | null | undefined): Preview {
  if (!meta) return { status: 'none' }
  return {
    status: meta.status,
    ...(meta.targetNodeId ? { targetNodeId: meta.targetNodeId } : {}),
    ...(meta.attach ? { attach: meta.attach } : {}),
    ...(meta.reason ? { reason: meta.reason === 'too_long' ? `longer than ${DIRECTOR_PREVIEW_MAX_SECONDS}s` : meta.reason } : {}),
  }
}

function compileOrReject(plan: DirectorPlan) {
  const compiled = compileDirectorPlan(plan)
  return compiled.ok ? compiled : { ok: false as const, rejection: { applied: false as const, rejected: 'compile_failed' as const, messages: compiled.errors.length ? compiled.errors : ['the compiler rejected this plan'] } }
}

function createPlan(input: Extract<DirectorWriteInput, { operation: 'create_director_plan' }>, context: ApplyDirectorWriteContext): DirectorWriteDomainResult {
  const nodes = readGenerationCanvasSnapshot().nodes
  let targetNodeId: string | undefined
  if (input.shotNodeId) {
    targetNodeId = context.resolveNodeId(input.shotNodeId)
    const target = nodes.find((node) => node.id === targetNodeId)
    if (!target) return { applied: false, rejected: 'target_missing', messages: [`no canvas node ${input.shotNodeId}`] }
    if (!isVideoLikeGenerationNodeKind(target.kind as GenerationNodeKind)) {
      return { applied: false, rejected: 'target_missing', messages: [`${input.shotNodeId} is a ${target.kind} node; a 3D-BOX preview can only become the reference video of a video shot (omit target for a standalone preview)`] }
    }
  }
  const plan = canonicalDirectorPlan(input.plan)
  const compiled = compileOrReject(plan)
  if (!compiled.ok) return compiled.rejection
  const revision = directorPlanRevision(plan)
  const preview = previewMetaFor(targetNodeId, revision, compiled.duration, context.proposalId, missingActionNotes(plan, compiled.issues))
  const position = layoutPlannedNodes(['image'], nodes)[0]
  const created = context.inCtx(() => generationCanvasTools.create_nodes([{
    kind: DIRECTOR_NODE_KIND,
    categoryId: getDefaultCategoryForNodeKind(DIRECTOR_NODE_KIND),
    title: i18n.t('director.agent.boxPreview'),
    prompt: '',
    position,
    meta: {
      [DIRECTOR_PROJECT_META_KEY]: compiled.project,
      [DIRECTOR_PLAN_META_KEY]: { plan, revision, issueCount: compiled.issues.length },
      ...(preview ? { [DIRECTOR_PREVIEW_META_KEY]: preview } : {}),
    },
  }]))
  const directorNodeId = created[0]?.id
  if (!directorNodeId) throw new Error('director node was not created')
  return {
    applied: true, directorNodeId, revision, unchanged: false, plan,
    issues: issuesOf(compiled.issues), cuts: cutsOf(compiled.project),
    touched: [...plan.shots.map((shot) => `shot:${shot.id}`), ...plan.actors.map((actor) => `actor:${actor.id}`), ...plan.scene.setPieces.map((piece) => `setPiece:${piece.id}`)],
    reorderedOverrides: [], changedEntities: [], preview: previewView(preview),
  }
}

function patchPlan(input: Extract<DirectorWriteInput, { operation: 'patch_director_plan' }>, context: ApplyDirectorWriteContext): DirectorWriteDomainResult {
  const directorNodeId = context.resolveNodeId(input.directorNodeId)
  const node = readGenerationCanvasSnapshot().nodes.find((candidate) => candidate.id === directorNodeId)
  if (!node || node.kind !== DIRECTOR_NODE_KIND) return { applied: false, rejected: 'target_missing', messages: [`no 3D-BOX node ${input.directorNodeId} on the canvas`] }
  const planMeta = readDirectorPlanMeta(node)
  const base = planMeta ? parseDirectorPlan(planMeta.plan) : null
  if (!planMeta || !base?.success) {
    return { applied: false, rejected: 'target_missing', messages: [`${input.directorNodeId} has no 3D-BOX plan (it was made with the older director tools); create a new preview with a whole plan instead`] }
  }
  if (planMeta.revision !== input.baseRevision) {
    return { applied: false, rejected: 'stale_revision', messages: [`baseRevision ${input.baseRevision} is not the current plan`], currentRevision: planMeta.revision }
  }
  const currentPreview = readDirectorPreview(node)
  const patched = applyDirectorPlanEdits(canonicalDirectorPlan(base.data), input.edits)
  if (!patched.ok) return { applied: false, rejected: 'invalid_patch', messages: [...patched.errors] }
  if (patched.unchanged) {
    const project = node.meta?.[DIRECTOR_PROJECT_META_KEY] as DirectorProject | undefined
    return {
      applied: true, directorNodeId, revision: planMeta.revision, unchanged: true, plan: patched.plan,
      issues: [], cuts: project ? cutsOf(project) : [], touched: [], reorderedOverrides: [], changedEntities: [],
      preview: previewView(currentPreview),
    }
  }
  const compiled = compileOrReject(patched.plan)
  if (!compiled.ok) return compiled.rejection
  const revision = directorPlanRevision(patched.plan)
  const preview = previewMetaFor(currentPreview?.targetNodeId, revision, compiled.duration, context.proposalId, missingActionNotes(patched.plan, compiled.issues))
  context.inCtx(() => {
    // 一个写者（方案 §3）：编辑器开着 → 进编辑器 store（3a 的唯一外部写口会立刻落到节点 meta）；关着 → 直接写节点 meta。
    const mounted = hasDirectorSession(directorNodeId) && writeExternalDirectorProject(directorNodeId, compiled.project)
    const store = useGenerationCanvasStore.getState()
    const fresh = store.nodes.find((candidate) => candidate.id === directorNodeId)
    const meta: Record<string, unknown> = { ...(fresh?.meta ?? node.meta ?? {}) }
    if (!mounted) meta[DIRECTOR_PROJECT_META_KEY] = compiled.project
    meta[DIRECTOR_PLAN_META_KEY] = { plan: patched.plan, revision, issueCount: compiled.issues.length }
    if (preview) meta[DIRECTOR_PREVIEW_META_KEY] = preview
    else delete meta[DIRECTOR_PREVIEW_META_KEY]
    store.updateNode(directorNodeId, { meta })
  })
  return {
    applied: true, directorNodeId, revision, unchanged: false, plan: patched.plan,
    issues: issuesOf(compiled.issues), cuts: cutsOf(compiled.project), touched: [...patched.touched],
    reorderedOverrides: [], changedEntities: [], preview: previewView(preview),
  }
}

export function applyDirectorWrite(input: DirectorWriteInput, context: ApplyDirectorWriteContext): DirectorWriteDomainResult {
  return input.operation === 'create_director_plan' ? createPlan(input, context) : patchPlan(input, context)
}
