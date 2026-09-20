import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ProductionRunProjection } from '../../../desktop/productionRunBridgeTypes'
import { storyboardContentToken, storyboardPlanFromGeneration } from '../../../../electron/shared/storyboard/generationPlanEditorial'
import type { StoryboardPlan } from '../../generationCanvas/agent/storyboardPlan'
import { productionRunApi } from '../../production/productionRunApi'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { createStoryboardRunDraftSession } from './storyboardRunDraftSession'
import { withProjectAction, isProjectExecutionContextCurrent } from '../../project/projectCanvasReadSurface'
import { projectStoryboardDesign } from './exec/storyboardProjection'
import { refreshCreationRunPlans, useCreationRunPlans } from './useCreationRunPlans'
import type { StoryboardEditorHost } from './storyboardEditorHost'
import type { StoryboardNodeBindings } from './exec/storyboardRowStatus'
import { storyboardRunBindings } from './exec/storyboardNodeBinding'

// Input buffers survive view switches; the repository remains the only persisted owner.
const sessions = new Map<string, ReturnType<typeof createStoryboardRunDraftSession<ProductionRunProjection>>>()
function sessionFor(projectId: string, documentId: string, runId: string) {
  const key = JSON.stringify([projectId, documentId, runId])
  const existing = sessions.get(key)
  if (existing) return existing
  const session = createStoryboardRunDraftSession<ProductionRunProjection>({
    read: async () => {
      const run = await productionRunApi.read(projectId, runId)
      if (!run || run.projectId !== projectId || run.runId !== runId || run.origin.sourceDocument?.documentId !== documentId) throw new Error('Storyboard target unavailable')
      return run
    },
    plan: storyboardPlanFromGeneration,
    write: async (plan, run) => {
      const project = withProjectAction(current => current)
      const source = run.origin.sourceDocument!
      const result = await productionRunApi.command(projectId, runId, {
        commandId: crypto.randomUUID(), expectedRevision: run.revision, type: 'generation.save_storyboard',
        payload: { projectId, runId, operationId: run.generationPlan!.operationId, sourceDocumentId: documentId,
          sourceDocumentRevision: source.revision, sourceDocumentHash: source.contentHash, expectedContentToken: storyboardContentToken(run), plan },
        issuedAt: new Date().toISOString(), humanGesture: true,
      })
      if (project?.binding.projectId === projectId && isProjectExecutionContextCurrent(project)) {
        const canvas = useGenerationCanvasStore.getState()
        projectStoryboardDesign({ id: runId, plan: storyboardPlanFromGeneration(result.run) }, canvas,
          storyboardRunBindings(result.run.generationPlan, canvas.edges))
      }
      void refreshCreationRunPlans(projectId)
      return result.run
    },
  })
  sessions.set(key, session)
  return session
}
function assignNewShotIds(plan: StoryboardPlan): StoryboardPlan {
  const seen = new Set<string>()
  return { ...plan, shots: plan.shots.map(shot => {
    const shotId = shot.shotId && !seen.has(shot.shotId) ? shot.shotId : crypto.randomUUID()
    seen.add(shotId)
    return shotId === shot.shotId ? shot : { ...shot, shotId }
  }) }
}
export function useStoryboardRunHost(projectId: string, documentId: string, runId: string): StoryboardEditorHost {
  const session = useMemo(() => sessionFor(projectId, documentId, runId), [projectId, documentId, runId])
  const value = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const { runs } = useCreationRunPlans(projectId)
  const revision = runs.find(run => run.runId === runId)?.revision
  useEffect(() => { void session.read() }, [session, revision])
  const edges = useGenerationCanvasStore(state => state.edges)
  const bindings = useMemo<StoryboardNodeBindings>(() => storyboardRunBindings(value.receipt?.generationPlan, edges), [value.receipt, edges])
  const assertCurrent = async () => {
    const receipt = session.getSnapshot().receipt
    const latest = await productionRunApi.read(projectId, runId)
    if (!receipt || !latest || latest.projectId !== projectId || latest.runId !== runId
      || latest.origin.sourceDocument?.documentId !== documentId
      || !value.plan || storyboardContentToken(latest) !== storyboardContentToken({ generationPlan: { ...receipt.generationPlan!, editorial: value.plan } })
      || session.getSnapshot().dirty || storyboardContentToken(latest) !== storyboardContentToken(receipt)) throw new Error('Storyboard target changed')
  }
  return { designId: runId, documentId, plan: value.plan, bindings, saving: value.saving, error: Boolean(value.error),
    recover: () => session.saveLocalAgainstLatest(),
    change: plan => session.change(assignNewShotIds(plan)), assertCurrent,
    flush: async () => { await session.flush(); await assertCurrent() } }
}
