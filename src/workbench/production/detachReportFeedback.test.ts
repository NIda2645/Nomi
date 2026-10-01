import { beforeEach, describe, expect, it, vi } from 'vitest'

// 删节点的上报没落到 Run = 被删的那一镜可能照样扣费。这里钉的是「失败一定被看见」：
// 原因进诊断日志，用户那边一条带动作（打开任务面板）的通知。以前这一处是 `catch {}`。
const mocks = vi.hoisted(() => ({ warn: vi.fn(), feedback: vi.fn() }))
vi.mock('../../desktop/rendererLog', () => ({ logRendererWarn: mocks.warn }))
vi.mock('../generationCanvas/components/canvasFeedback', () => ({ reportCanvasFeedback: mocks.feedback }))

import i18n from '../../i18n'
import { surfaceDetachReportFailure } from './detachReportFeedback'

describe('a failed canvas detach report is never silent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('logs the cause and raises an actionable notice that opens the task center', () => {
    const error = new Error('Invalid command id')
    surfaceDetachReportFailure('project-1', 'op-1', 2, error)

    expect(mocks.warn).toHaveBeenCalledWith('production-detach-report-failed', { runId: 'op-1', nodeCount: 2 }, error)
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    const [message, type, context] = mocks.feedback.mock.calls[0]
    expect(type).toBe('error')
    expect(context).toEqual({ identity: 'production-detach:op-1', reason: 'production-detach-failed', projectId: 'project-1', taskCenter: true })
    expect(message).toBe(i18n.t('generationCommon.production.canvasLanding.detachFailed'))
    expect(message, 'a real sentence, not a raw i18n key').not.toBe('generationCommon.production.canvasLanding.detachFailed')
  })
})
