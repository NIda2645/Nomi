import { validateAnchorModelFit, type AnchorModelFitIssue } from './storyboardAnchorPolicy'
import type { CanvasWriteInput } from '../../../../electron/shared/agentCapabilities/canvasWrite'
import type { PlanShot, StoryboardPlan } from './storyboardPlan'
import { updateShotAt, type PlanShotPatch } from './storyboardPlanEdits'

export type StoryboardPatchShotsInput = Extract<CanvasWriteInput, { operation: 'patch_shots' }>

export type StoryboardPatchShotsPreview = Readonly<{
  nextPlan: StoryboardPlan
  changedShotIndexes: number[]
  changedFields: string[]
  anchorIssues: AnchorModelFitIssue[]
}>

export class StoryboardPatchShotsError extends Error {
  readonly code: 'capability_input_invalid' | 'capability_target_stale'

  constructor(code: 'capability_input_invalid' | 'capability_target_stale', message: string) {
    super(message)
    this.name = 'StoryboardPatchShotsError'
    this.code = code
  }
}

function selectedPositions(plan: StoryboardPlan, input: StoryboardPatchShotsInput): number[] {
  const positions = input.select.kind === 'all'
    ? plan.shots.map((_shot, position) => position)
    : [...new Set(input.select.indexes)].map((index) => index - 1)
  if (positions.length === 0) {
    throw new StoryboardPatchShotsError(
      'capability_target_stale',
      '当前分镜方案没有可修改的镜头。请先生成至少一个镜头。',
    )
  }
  const outOfRange = positions.filter((position) => position < 0 || position >= plan.shots.length)
  if (outOfRange.length) {
    throw new StoryboardPatchShotsError(
      'capability_target_stale',
      `镜号 ${outOfRange.map((position) => position + 1).join('、')} 超出范围：当前方案共 ${plan.shots.length} 镜（镜号 1-${plan.shots.length}）。`,
    )
  }
  return positions
}

function patchShot(shot: PlanShot, patch: StoryboardPatchShotsInput['patch']): PlanShotPatch {
  const next: Omit<Partial<PlanShot>, 'modelKey' | 'modelVendor'> = {}
  if (patch.promptAppend !== undefined) {
    next.prompt = `${shot.prompt}${shot.prompt ? '，' : ''}${patch.promptAppend}`
    next.promptSegments = undefined
  }
  if (patch.prompt !== undefined) {
    next.prompt = patch.prompt
    next.promptSegments = undefined
  }
  if (patch.shotKind !== undefined) next.shotKind = patch.shotKind
  if (patch.durationSec !== undefined) next.durationSec = patch.durationSec
  if (patch.aspectRatio !== undefined) next.params = { ...(shot.params ?? {}), aspect_ratio: patch.aspectRatio }
  // The capability schema already requires modelKey and modelVendor together; the pair is written as one
  // value here too (PlanShotPatch forbids a lone half). A model identity change cannot reuse a mode chosen
  // for the previous model; params stay because aspectRatio may arrive in the same patch.
  if (patch.modelKey !== undefined) return { ...next, modelKey: patch.modelKey, modelVendor: patch.modelVendor, modeId: undefined }
  return next
}

/** Pure preview/apply calculation shared by the real renderer path and its tests. */
export function previewStoryboardPatchShots(
  plan: StoryboardPlan,
  input: StoryboardPatchShotsInput,
): StoryboardPatchShotsPreview {
  const positions = selectedPositions(plan, input)
  let nextPlan = plan
  const changedFields = new Set<string>()
  for (const position of positions) {
    const patch = patchShot(nextPlan.shots[position], input.patch)
    nextPlan = updateShotAt(nextPlan, position, patch)
    for (const field of Object.keys(input.patch)) changedFields.add(field === 'promptAppend' ? 'prompt' : field)
  }
  return {
    nextPlan,
    anchorIssues: validateAnchorModelFit(nextPlan),
    changedShotIndexes: positions.map((position) => position + 1).sort((a, b) => a - b),
    changedFields: [...changedFields],
  }
}
