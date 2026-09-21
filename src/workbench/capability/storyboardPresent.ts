import { resolveGenerationShotScope } from '../../../electron/shared/agentCapabilities/generationShotScope'
import { stableProjectAgentJson } from '../../../electron/shared/legacyAgentJson'
import { preloadModelOptions } from '../../config/useModelOptions'
import { withProjectAction } from '../project/projectCanvasReadSurface'
import { useWorkbenchStore } from '../workbenchStore'
import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { deriveStoryboardBatch, deriveStoryboardRowRuntimes, deriveAnchorCardRuntimes } from '../creation/storyboard/exec/storyboardRowStatus'
import { getDesktopBridge } from '../../desktop/bridge'
import { resolveGeneratableGate } from '../creation/storyboard/strategyGate'
import { generateAnchorCard, runStoryboardBatch } from '../creation/storyboard/exec/storyboardRowActions'

/** 方案正本住在项目记录里；本地内容 token 与编辑器自己的所有权闸用的是同一套比对。 */
function readDesign(documentId: string, designId: string) {
  const design = (useWorkbenchStore.getState().storyboardDesignsByDocumentId[documentId] ?? [])
    .find(value => value.id === designId)
  if (!design) throw new Error('storyboard_design_missing')
  return design
}

function contentOf(documentId: string, designId: string): string {
  return stableProjectAgentJson(JSON.parse(JSON.stringify(readDesign(documentId, designId).plan)))
}

/** The existing renderer bridge supplies identity; original actions still own all paid behavior. */
export async function presentStoryboard(data: Record<string, unknown>) {
  const { projectId, designId, sourceDocumentId } = data
  if (typeof projectId !== 'string' || typeof designId !== 'string' || typeof sourceDocumentId !== 'string') {
    throw new Error('storyboard_target_required')
  }
  return withProjectAction(async project => {
    project.assertCurrent()
    if (project.binding.projectId !== projectId) throw new Error('storyboard_project_changed')
    const plan = readDesign(sourceDocumentId, designId).plan
    const captured = contentOf(sourceDocumentId, designId)
    const ids = [...plan.anchors.map(anchor => anchor.id), ...plan.shots.map(shot => shot.shotId!)]
    const scope = resolveGenerationShotScope(ids, data.shotIds)
    const [imageModelOptions, videoModelOptions] = await Promise.all([preloadModelOptions('image', 'any-published'), preloadModelOptions('video', 'any-published')])
    project.assertCurrent()
    const assertAuthorCurrent = async () => {
      if (contentOf(sourceDocumentId, designId) !== captured) throw new Error('storyboard_content_conflict')
    }
    const assertCurrent = async () => { project.assertCurrent(); await assertAuthorCurrent(); project.assertCurrent() }
    await assertCurrent()
    const canvas = useGenerationCanvasStore.getState()
    const context = { documentId: sourceDocumentId, designId, plan, assertCurrent, assertAuthorCurrent,
      gesture: { source: 'agent' as const, txnId: crypto.randomUUID(), canWrite: () => { project.assertCurrent(); return !project.signal.aborted } } }
    const runtimes = () => deriveStoryboardRowRuntimes({ plan, designId,
      nodes: useGenerationCanvasStore.getState().nodes, imageModelOptions, videoModelOptions })
    const anchors = deriveAnchorCardRuntimes({ plan, designId, nodes: canvas.nodes, rows: runtimes() })
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
    return { status: 'presented' as const, designId, shotIds: scope }
  }, () => { throw new Error('storyboard_project_unavailable') })
}
