import type { StoryboardAuthorFields } from '../agentCapabilities/generationPlanSchemas'
import { generationShotEnvelopeOf } from '../generationShotEnvelope'
import { stableProjectAgentJson } from '../legacyAgentJson'
import { modelKindForTaskKind } from '../capabilityModeManifest'
import type { PlanCandidate } from '../../capabilityCore/executionContract'
import type { ProductionGenerationPlan, ProductionGenerationShot, ProductionRun } from '../../productionRun/productionRunTypes'
import type { PlanAnchor, PlanShot, StoryboardPlan } from './storyboardPlan'
import { planAnchorSchema, planShotSchema, storyboardPlanSchema } from './storyboardPlanSchema'

/** The original editor contract is the sole mutable author body. */
export type GenerationPlanEditorial = StoryboardPlan
export type StoryboardGenerationSource = {
  generationPlan?: Pick<ProductionGenerationPlan, 'candidate' | 'editorial'> & { shots?: ReadonlyArray<Pick<ProductionGenerationShot, 'shotId' | 'role' | 'title' | 'candidate'>> }
  storyboardReferenceUrls?: StoryboardReferenceUrls
  authoring?: ProductionRun['authoring']
}
export type StoryboardReferenceUrls = Readonly<Record<string, string>>

function shotKindOf(candidate: PlanCandidate): Pick<PlanShot, 'shotKind'> {
  const kind = modelKindForTaskKind(candidate.mode)
  return kind === 'image' || kind === 'video' ? { shotKind: kind } : {}
}

function candidateFields(candidate: PlanCandidate) {
  return {
    ...(candidate.modelId ? { modelKey: candidate.modelId } : {}),
    ...(candidate.providerId ? { modelVendor: candidate.providerId } : {}),
    ...(candidate.modeId ? { modeId: candidate.modeId } : {}),
    ...(Object.keys(candidate.parameters).length ? { params: structuredClone(candidate.parameters) } : {}),
  }
}

/** A read projection, never a second plan owner or a canvas-derived recovery path. */
export function storyboardPlanFromGeneration(run: StoryboardGenerationSource, referenceUrls: StoryboardReferenceUrls = run.storyboardReferenceUrls ?? {}): StoryboardPlan {
  const generation = run.generationPlan
  if (!generation) throw new Error('Storyboard generation plan missing')
  if (generation.editorial) return structuredClone(storyboardPlanSchema.parse(generation.editorial))
  const subjects = generation.shots?.length ? generation.shots : [{shotId:generation.candidate.candidateId,candidate:generation.candidate}]
  const anchors: PlanAnchor[] = []
  const shots: PlanShot[] = []
  for (const subject of subjects) {
    const authored=storyboardSubjectFromCandidate(subject,shots.length+1,undefined,referenceUrls)
    if ('description' in authored) anchors.push(authored); else shots.push(authored)
  }
  return {title:run.authoring?.title ?? '',anchors,shots}
}

/** Saving author content never rewrites a submitted or pending execution snapshot. */
export function generationDraftFromStoryboard(raw: StoryboardPlan, existing: ProductionGenerationPlan, now = existing.updatedAt): ProductionGenerationPlan {
  const editorial = storyboardPlanSchema.parse(raw)
  const ids = [...editorial.anchors.map(anchor => anchor.id), ...editorial.shots.map(shot => shot.shotId)]
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Invalid or duplicate storyboard shot identity')
  return { ...existing, editorial: structuredClone(editorial), updatedAt: now }
}

/** Content comparison excludes job progress, placement bindings and payment selection.
 * This is an opaque canonical token, not a persisted second version database. */
export function storyboardContentToken(run: StoryboardGenerationSource): string {
  const generation = run.generationPlan
  if (!generation) throw new Error('Storyboard generation plan missing')
  if (generation.editorial) return stableProjectAgentJson(JSON.parse(JSON.stringify(generation.editorial)))
  const content = (candidate: PlanCandidate) => ({
    candidateId: candidate.candidateId, prompt: candidate.prompt,
    providerId: candidate.providerId, modelId: candidate.modelId,
    modeId: candidate.modeId, variantId: candidate.variantId,
    mode: candidate.mode, moduleId: candidate.moduleId,
    parameters: candidate.parameters, references: candidate.references,
  })
  return stableProjectAgentJson(JSON.parse(JSON.stringify({
    title: run.authoring?.title ?? '', editorial: generation.editorial,
    subjects: generation.shots?.length
      ? generation.shots.map(shot => {
        const {included:_paymentSelection,...envelope}=generationShotEnvelopeOf(shot)
        return {...envelope,role:shot.role ?? 'shot',candidate:content(shot.candidate)}
      })
      : [{...generationShotEnvelopeOf({shotId:generation.candidate.candidateId}),role:'shot',candidate:content(generation.candidate)}],
  })))
}

/** Adapt an admitted Agent subject into the existing editor contract exactly once, at author creation. */
export function storyboardSubjectFromCandidate(input: {shotId: string; role?: 'anchor' | 'shot'; title?: string; candidate: PlanCandidate}, index: number,
  authored?: StoryboardAuthorFields, referenceUrls: Readonly<Record<string, string>> = {}): PlanAnchor | PlanShot {
  const candidate = input.candidate
  const fields = candidateFields(candidate)
  const referenceBindings: Record<string, Array<{url:string}>> = {}
  for (const reference of candidate.references) {
    const url = referenceUrls[reference.assetId]
    if (!url) throw new Error('storyboard_reference_preview_unavailable')
    ;(referenceBindings[storyboardReferenceSlot(reference)] ??= []).push({url})
  }
  if (authored?.referenceBindings && candidate.references.length) throw new Error('storyboard_author_reference_fields_conflict')
  const common = {...fields,...(candidate.references.length ? {referenceBindings} : {})}
  if (input.role === 'anchor') {
    if (!authored?.kind || !authored.carrier) throw new Error('storyboard_anchor_editorial_required: provide storyboard.kind and storyboard.carrier')
    return planAnchorSchema.parse({...authored,...common,id:input.shotId,kind:authored.kind,carrier:authored.carrier,name:input.title ?? candidate.prompt,description:candidate.prompt})
  }
  if (authored?.kind || authored?.carrier) throw new Error('storyboard_subject_role_mismatch')
  return planShotSchema.parse({durationSec:typeof candidate.parameters.duration === 'number' ? candidate.parameters.duration : 0,anchorIds:[],prompt:candidate.prompt,...shotKindOf(candidate),...authored,...common,shotId:input.shotId,index})

}

export function patchStoryboardSubject(plan: StoryboardPlan, shotId: string, patch: Record<string, unknown>, references?: Record<string, Array<{url: string}>>): PlanAnchor | PlanShot {
  const subject = plan.anchors.find(anchor => anchor.id === shotId) ?? plan.shots.find(shot => shot.shotId === shotId)
  if (!subject) throw new Error('Storyboard shot not found')
  const authored=patch.storyboard as StoryboardAuthorFields | undefined
  const duration = (patch.parameters as Record<string, unknown> | undefined)?.duration
  const merged = {...subject,...authored,
    ...(!('description' in subject) && patch.prompt !== undefined && patch.prompt !== subject.prompt
      && authored?.promptSegments === undefined ? {promptSegments:undefined} : {}),
    // Match creation: an explicit author duration overrides the candidate parameter.
    ...(!('description' in subject) && authored?.durationSec === undefined && typeof duration === 'number'
      ? {durationSec:duration} : {}),
    ...(!('description' in subject) && authored?.keyframe ? {keyframe:{...subject.keyframe,...authored.keyframe,
      ...(authored.keyframe.params ? {params:{...subject.keyframe?.params,...authored.keyframe.params}} : {})}} : {}),
    ...(patch.prompt !== undefined ? {['description' in subject ? 'description' : 'prompt']:patch.prompt} : {}),
    ...(patch.modelId !== undefined ? {modelKey:patch.modelId} : {}),
    ...(patch.providerId !== undefined ? {modelVendor:patch.providerId} : {}),
    ...(patch.modeId !== undefined ? {modeId:patch.modeId} : {}),
    ...(patch.parameters !== undefined ? {params:patch.parameters} : {}),
    ...(references ? {referenceBindings:references} : {}),
  } as PlanAnchor | PlanShot
  if (patch.taskKind !== undefined && !('description' in merged)) merged.shotKind = String(patch.taskKind).includes('video') ? 'video' : 'image'
  return 'description' in subject ? planAnchorSchema.parse(merged) : planShotSchema.parse(merged)
}

/** Map pinned execution reference roles to the original storyboard slot vocabulary. */
export function storyboardReferenceSlot(reference: PlanCandidate['references'][number]): string {
  switch (reference.role) {
    case 'first_frame': case 'last_frame': return reference.role
    case 'character': return 'image_ref'
    case 'audio': return 'audio_ref'
    case 'reference': case undefined:
      return reference.kind === 'video' ? 'video_ref' : reference.kind === 'audio' ? 'audio_ref' : 'image_ref'
    default: throw new Error('storyboard_reference_role_invalid')
  }
}
