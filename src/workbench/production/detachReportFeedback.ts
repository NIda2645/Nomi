import i18n from '../../i18n'
import { logRendererWarn } from '../../desktop/rendererLog'
import { reportCanvasFeedback } from '../generationCanvas/components/canvasFeedback'

/**
 * 删节点的上报没落到 Run：被删的那一镜可能照样派发、照样扣费——这件事不许静默（以前这里是 `catch {}`）。
 *
 * 两件事都用现成的：原因进诊断日志（`logRendererWarn`，打包版也收得到）；用户这边走画布既有的「可操作通知」
 * （`reportCanvasFeedback`：带一个动作的提示，动作 = 打开任务面板，能在那里暂停或取消这次制作）。
 * 被删的节点已经不在了，没有节点可以挂就地提示，所以不是 inline。
 */
export function surfaceDetachReportFailure(projectId: string, runId: string, nodeCount: number, error: unknown): void {
  logRendererWarn('production-detach-report-failed', { runId, nodeCount }, error)
  reportCanvasFeedback(i18n.t('generationCommon.production.canvasLanding.detachFailed'), 'error', {
    identity: `production-detach:${runId}`,
    reason: 'production-detach-failed',
    projectId,
    taskCenter: true,
  })
}
