import type { ToastType } from '../../../ui/toast'
import i18n from '../../../i18n'
import { notify, revealNotificationTarget } from '../../../ui/notificationPolicy'

/** The frozen React Flow host cannot gain a new inline slot in this task.
 * Its command adapters retain one actionable notice, bound to the actual project
 * and target; editable node/panel hosts must use notify(level: 'inline') instead. */
export function reportCanvasFeedback(
  message: string,
  type: ToastType,
  context: { identity: string; reason: string; nodeIds?: string[]; /** 动作起点签发的项目（空串 = 当时没有打开项目）。 */ projectId: string; taskCenter?: boolean; workspaceMode?: 'preview' | 'generation' },
): void {
  const projectId = context.projectId
  notify({
    identity: `${projectId}:${context.identity}`,
    reason: context.reason,
    message,
    type,
    level: 'background',
    actionLabel: i18n.t(context.taskCenter ? 'taskCenter.title' : context.workspaceMode === 'preview' ? 'workspace.preview' : 'workspace.generation'),
    onAction: () => { void revealNotificationTarget({ projectId, workspaceMode: context.workspaceMode ?? 'generation', nodeIds: context.nodeIds, taskCenter: context.taskCenter }) },
  })
}
