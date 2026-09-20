import { storyboardContentToken, storyboardPlanFromGeneration } from '../../../electron/shared/storyboard/generationPlanEditorial'
import { resolveGenerationShotScope } from '../../../electron/shared/agentCapabilities/generationShotScope'
import { preloadModelOptions } from '../../config/useModelOptions'
import { productionRunApi } from '../production/productionRunApi'
import { withProjectAction } from '../project/projectCanvasReadSurface'
import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { storyboardRunBindings } from '../creation/storyboard/exec/storyboardNodeBinding'
import { deriveStoryboardBatch, deriveStoryboardRowRuntimes, deriveAnchorCardRuntimes } from '../creation/storyboard/exec/storyboardRowStatus'
import { getDesktopBridge } from '../../desktop/bridge'
import { resolveGeneratableGate } from '../creation/storyboard/strategyGate'
import { generateAnchorCard, runStoryboardBatch } from '../creation/storyboard/exec/storyboardRowActions'

/** The existing renderer bridge supplies identity; original actions still own all paid behavior. */
export async function presentStoryboard(data: Record<string, unknown>) {
  const { projectId, runId, sourceDocumentId, expectedContentToken } = data
  if (typeof projectId !== 'string' || typeof runId !== 'string' || typeof sourceDocumentId !== 'string'
    || typeof expectedContentToken !== 'string') throw new Error('storyboard_target_required')
  return withProjectAction(async project => {
    project.assertCurrent()
    if (project.binding.projectId !== projectId) throw new Error('storyboard_project_changed')
    const run = await productionRunApi.read(projectId, runId)
    project.assertCurrent()
    if (!run || run.runId !== runId || run.projectId !== projectId
      || run.origin.sourceDocument?.documentId !== sourceDocumentId
      || storyboardContentToken(run) !== expectedContentToken) throw new Error('storyboard_content_conflict')
    const plan = storyboardPlanFromGeneration(run)
    const ids = [...plan.anchors.map(anchor => anchor.id), ...plan.shots.map(shot => shot.shotId!)]
    const scope = resolveGenerationShotScope(ids, data.shotIds)
    const [imageModelOptions, videoModelOptions] = await Promise.all([preloadModelOptions('image', 'any-published'), preloadModelOptions('video', 'any-published')])
    project.assertCurrent()
    const assertAuthorCurrent = async () => {
      const latest = await productionRunApi.read(projectId, runId)
      if (!latest || latest.runId !== runId || latest.projectId !== projectId
        || latest.origin.sourceDocument?.documentId !== sourceDocumentId
        || storyboardContentToken(latest) !== expectedContentToken) throw new Error('storyboard_content_conflict')
    }
    const assertCurrent = async () => { project.assertCurrent(); await assertAuthorCurrent(); project.assertCurrent() }
    await assertCurrent()
    const canvas = useGenerationCanvasStore.getState()
    const bindings = storyboardRunBindings(run.generationPlan, canvas.edges)
    const context = { documentId: sourceDocumentId, designId: runId, plan, bindings, assertCurrent, assertAuthorCurrent,
      gesture: { source: 'agent' as const, txnId: crypto.randomUUID(), canWrite: () => { project.assertCurrent(); return !project.signal.aborted } } }
    const runtimes = () => deriveStoryboardRowRuntimes({ plan, designId: runId,
      nodes: useGenerationCanvasStore.getState().nodes, imageModelOptions, videoModelOptions, bindings })
    const anchors = deriveAnchorCardRuntimes({ plan, designId: runId,
      nodes: canvas.nodes, rows: runtimes(), bindings })
    for (const entry of anchors.filter(value => scope.includes(value.anchor.id))) {
      if (!entry.visual || entry.locked || entry.resultUrl || entry.generating || entry.recoverable) continue
      await assertCurrent()
      await generateAnchorCard(context, entry.anchor)
    }
    const rows = deriveStoryboardBatch(runtimes().filter(row => scope.includes(row.shot.shotId!))).runnable
    const blocker = await resolveGeneratableGate(plan, projectId, getDesktopBridge()?.generationStrategy,
      rows.map(row => row.shot.shotId!))
    if (blocker) throw new Error('storyboard_strategy_blocked')
    await assertCurrent()
    if (rows.length) await runStoryboardBatch(context, rows)
    // Original confirmation returns void for both acceptance and cancellation. Never claim a paid submission.
    return { status: 'presented' as const, runId, shotIds: scope }
  }, () => { throw new Error('storyboard_project_unavailable') })
}
