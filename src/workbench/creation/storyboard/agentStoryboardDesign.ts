import { storyboardPlanSchema } from '../../../../electron/shared/storyboard/storyboardPlanSchema'
import { patchStoryboardSubject } from '../../../../electron/shared/storyboard/storyboardSubjectAdapter'
import type { StoryboardPlan } from '../../generationCanvas/agent/storyboardPlan'
import { withProjectAction } from '../../project/projectCanvasReadSurface'
import { useWorkbenchStore } from '../../workbenchStore'

/**
 * Agent 产出的分镜**落地点**：它写的就是用户手建方案住的那一份 `storyboardDesign`。
 *
 * 为什么由渲染层拥有：方案正本是项目记录的一部分（跟着项目导出、跟着 undo、跟着侧栏的改名/删除/复制）。
 * 主进程手里只有一次性的作者载荷，没有第二份分镜存储——那正是这一刀要消掉的东西。
 *
 * 身份：`designId` = 模型手里那个 draft id。模型指名哪一份，用户就看到哪一行被改，
 * 没有「当前打开的是哪份」这种隐式推断（推断错＝悄悄覆盖用户的另一份方案）。
 */

function targetDocument(projectId: unknown, documentId: unknown, designId: unknown): { documentId: string; designId: string } {
  if (typeof projectId !== 'string' || typeof documentId !== 'string' || typeof designId !== 'string'
    || !projectId || !documentId || !designId) throw new Error('storyboard_target_required')
  return { documentId, designId }
}

function assertProject(projectId: string): void {
  const project = withProjectAction(current => current, () => { throw new Error('storyboard_project_unavailable') })
  project.assertCurrent()
  if (project.binding.projectId !== projectId) throw new Error('storyboard_project_changed')
}

/** 建或整份替换一份 Agent 方案。替换只在模型**指名**了已有 id 时发生。 */
export function upsertAgentStoryboardDesign(data: Record<string, unknown>): { status: 'saved'; designId: string } {
  const { documentId, designId } = targetDocument(data.projectId, data.documentId, data.designId)
  assertProject(data.projectId as string)
  const plan = storyboardPlanSchema.parse(data.plan) as StoryboardPlan
  const store = useWorkbenchStore.getState()
  if (!store.workbenchDocuments.some(document => document.id === documentId)) throw new Error('storyboard_document_missing')
  const existing = (store.storyboardDesignsByDocumentId[documentId] ?? []).find(design => design.id === designId)
  const saved = existing
    ? store.setStoryboardPlan(plan, documentId, designId, true)
    : store.addStoryboardDesign(documentId, plan, { id: designId, title: plan.title })
  if (!saved || saved.id !== designId) throw new Error('storyboard_design_save_rejected')
  return { status: 'saved', designId }
}

/** 改一份 Agent 方案里的一镜。方案不存在就拒——绝不「顺手新建一份」。 */
export function patchAgentStoryboardDesign(data: Record<string, unknown>): { status: 'saved'; shotId: string } {
  const { documentId, designId } = targetDocument(data.projectId, data.documentId, data.designId)
  assertProject(data.projectId as string)
  const shotId = typeof data.shotId === 'string' && data.shotId.trim() ? data.shotId.trim() : ''
  if (!shotId) throw new Error('storyboard_shot_id_required')
  const patch = data.patch && typeof data.patch === 'object' && !Array.isArray(data.patch) ? data.patch as Record<string, unknown> : null
  if (!patch) throw new Error('Invalid generation patch')
  const store = useWorkbenchStore.getState()
  const design = (store.storyboardDesignsByDocumentId[documentId] ?? []).find(value => value.id === designId)
  if (!design) throw new Error('storyboard_design_missing')
  const references = data.references as Record<string, Array<{ url: string }>> | undefined
  const subject = patchStoryboardSubject(design.plan, shotId, patch, references)
  const next: StoryboardPlan = 'description' in subject
    ? { ...design.plan, anchors: design.plan.anchors.map(anchor => (anchor.id === shotId ? subject : anchor)) }
    : { ...design.plan, shots: design.plan.shots.map(shot => (shot.shotId === shotId ? subject : shot)) }
  if (!store.setStoryboardPlan(next, documentId, designId, true)) throw new Error('storyboard_design_save_rejected')
  return { status: 'saved', shotId }
}
