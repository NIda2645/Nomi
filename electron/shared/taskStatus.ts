/**
 * 任务状态是不是「有结果了」——全仓唯一一份（主进程轮询、渲染层轮询、遥测上报都引用它）。
 *
 * TASK_STATUS_PHASE 用 `satisfies Record<TaskStatus, …>` 写：给 TaskStatus 加新成员而不在这里归类，
 * 编译就红（`generation.completed` 只在终态上报，新状态默认不许被当成结果）。
 *
 * 供应商原始状态（`processing` / `in_progress` / `generating` 等）在 `electron/tasks/responseParsing.ts`
 * 就被收成这四种之一；还没收的（任何不在表里的字符串）一律当「还在路上」：轮询继续、遥测不报。
 */
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export const TASK_STATUS_PHASE = {
  queued: 'in-flight',
  running: 'in-flight',
  succeeded: 'terminal',
  failed: 'terminal',
} as const satisfies Record<TaskStatus, 'in-flight' | 'terminal'>

export function isTerminalTaskStatus(status: string | undefined | null): status is 'succeeded' | 'failed' {
  return typeof status === 'string' && Object.prototype.hasOwnProperty.call(TASK_STATUS_PHASE, status)
    && TASK_STATUS_PHASE[status as TaskStatus] === 'terminal'
}
