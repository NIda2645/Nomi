// A4 run 控制（plan 2026-08-11-mcp-conversation-native-p0）：pause/resume/cancel 单一收口，
// MCP（dispatcher production.control）与渲染端（run.control 白名单）走同一条路径。
// 从 productionRunService 抽出成独立层（R9 ≤800 行 + 控制语义独立可测；状态机合法性仍由
// productionRunState 的 transitionRun 在 repository.execute 内兜底）。

import type { ProductionRunRepository } from './productionRunRepository'
import type { ProductionRun, RunCommand, RunCommandResult } from './productionRunTypes'

/** 已提交给供应商、还没收尾的任务状态（此时暂停停在 pausing，由收尾流程转 paused）。 */
const ACTIVE_JOB_STATUSES = ['submitting', 'provider_accepted', 'polling', 'retry_wait', 'downloading', 'validating_technical', 'validating_content']

/**
 * 应用一次控制命令。幂等近似：已在目标态 → 原样返回不写事件（对话里连说两次「停」不该炸）；
 * 非法操作抛人话错误（错误契约 A6 会带给 agent 转述）。
 */
export function applyRunControl(
  repository: Pick<ProductionRunRepository, 'execute'>,
  projectId: string,
  runId: string,
  current: ProductionRun,
  runCommand: RunCommand,
): RunCommandResult {
  const action = typeof runCommand.payload.action === 'string' ? runCommand.payload.action : ''
  const actionLabel = action === 'pause' ? '暂停' : action === 'resume' ? '继续' : '取消'
  const illegal = () => new Error(`无法${actionLabel}：制作当前状态是 ${current.status}，不允许这个操作`)
  if (action === 'pause') {
    if (['pausing', 'paused'].includes(current.status)) return { run: current, events: [] }
    if (current.status !== 'running') throw illegal()
    let result = repository.execute(projectId, runId, { ...runCommand, type: 'run.status', payload: { status: 'pausing' } })
    // 没有在途任务就直接落停；有则停在 pausing，由收尾流程转 paused。
    if (!result.run.jobs.some((job) => ACTIVE_JOB_STATUSES.includes(job.status))) {
      result = repository.execute(projectId, runId, {
        ...runCommand,
        commandId: `${runCommand.commandId}:settle`,
        expectedRevision: result.run.revision,
        type: 'run.status',
        payload: { status: 'paused' },
      })
    }
    return result
  }
  if (action === 'resume') {
    if (current.status === 'running') return { run: current, events: [] }
    if (!['paused', 'needs_attention'].includes(current.status)) throw illegal()
    return repository.execute(projectId, runId, { ...runCommand, type: 'run.status', payload: { status: 'running' } })
  }
  if (action === 'cancel') {
    if (current.status === 'cancelled') return { run: current, events: [] }
    if (current.status === 'completed') throw illegal()
    return repository.execute(projectId, runId, { ...runCommand, type: 'run.status', payload: { status: 'cancelled' } })
  }
  throw new Error('Invalid production control action')
}
