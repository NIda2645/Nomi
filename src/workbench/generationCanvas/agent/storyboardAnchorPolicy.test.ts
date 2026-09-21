import { describe, expect, it } from 'vitest'
import { MODEL_ARCHETYPES } from '../../../../electron/shared/modelArchetypes'
import { anchorsConsumedBy } from '../../../../electron/shared/modelArchetypes/anchorPolicy'
import { validatePlan } from './storyboardPlanEdits'
import { validateAnchorModelFit } from './storyboardAnchorPolicy'
import { deriveAnchorCardRuntimes, deriveStoryboardRowRuntimes } from '../../creation/storyboard/exec/storyboardRowStatus'
import { useWorkbenchStore } from '../../workbenchStore'
import { applyCanvasToolCall } from './applyCanvasToolCall'
import type { StoryboardPlan } from './storyboardPlan'

const profile = MODEL_ARCHETYPES.find(profile => profile.kind === 'video' && profile.modes.some(mode => anchorsConsumedBy(mode).includes('none')) && profile.modes.some(mode => !anchorsConsumedBy(mode).includes('none')))!
const textMode = profile.modes.find(mode => anchorsConsumedBy(mode).includes('none'))!
const imageMode = profile.modes.find(mode => !anchorsConsumedBy(mode).includes('none'))!
const modelKey = profile.identifierPatterns[0]
const plan: StoryboardPlan = { title: '锚策略', anchors: [{ id: 'hero', kind: 'character', carrier: 'visual', name: '主角', description: '短发' }], shots: [
  { index: 1, prompt: '奔跑', durationSec: 5, anchorIds: ['hero'], modelKey, modeId: textMode.id },
  { index: 2, prompt: '回头', durationSec: 5, anchorIds: ['hero'], modelKey, modeId: imageMode.id },
] }

describe('visual anchors with explicit text-only mode', () => {
  it('advises a concrete same-model mode and preserves user input', () => {
    const original = structuredClone(plan)
    const issues = validateAnchorModelFit(plan)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: 'anchor-not-consumable', shotIndex: 1, ignoredAnchors: [{ anchorId: 'hero' }] })
    expect(issues[0].correction).toContain(imageMode.id)
    expect(validatePlan(plan)).toContainEqual(issues[0])
    expect(plan).toEqual(original)
  })
  it('counts actual image consumers and exposes ignored anchors on the row', () => {
    const rows = deriveStoryboardRowRuntimes({ plan, designId: 'd', nodes: [], imageModelOptions: [], videoModelOptions: [{ value: modelKey, label: profile.label }] })
    expect(rows[0].exec.status).toBe('anchor-ignored')
    expect(rows[0].exec.ignoredAnchors[0].anchorId).toBe('hero')
    const cards = deriveAnchorCardRuntimes({ plan, designId: 'd', nodes: [], rows })
    expect(cards[0]).toMatchObject({ referencedByCount: 2, consumedByShotCount: 1 })
  })
  it('loopback tool result returns actionable correction without rejecting t2v', async () => {
    useWorkbenchStore.getState().hydrateWorkbenchDocuments([{ id: 'policy-doc', version: 1, title: '测试', contentJson: { type: 'doc', content: [] }, updatedAt: 1 }], 'policy-doc')
    const result = await applyCanvasToolCall('propose_storyboard_plan', plan) as { status: string; message: string; anchorIssues: unknown[] }
    expect(result.status).toBe('applied')
    expect(result.message).toContain(imageMode.id)
    expect(result.anchorIssues).toHaveLength(1)
  })
})
