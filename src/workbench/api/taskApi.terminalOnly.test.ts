// 「查结果」第 2 道：没出结果不许当结果上报。
// 上报的唯一主人是 taskApi.ts 里的 trackGenerationOutcome（全仓只有它发 generation.completed）；
// 这里把任务的每一种状态都过一遍两条入口（提交、轮询），非终态一律不产出事件，终态各报一次。
// TASK_STATUS_PHASE 用 satisfies Record<TaskStatus,…> 写，新增状态不归类 = 编译红；这份测试再保证归类的行为对。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWorkbenchTaskResultByVendor, runWorkbenchTaskByVendor, TASK_STATUS_PHASE, type TaskStatus } from './taskApi'

const track = vi.fn(async () => ({ queued: true }))
const run = vi.fn()
const result = vi.fn()

function installDesktop(): void {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { nomiDesktop: { tasks: { run, result }, telemetry: { track } } } })
}
afterEach(() => { Reflect.deleteProperty(globalThis, 'window'); vi.clearAllMocks() })

const task = (id: string, status: string) => ({ id, kind: 'text_to_video', status, assets: [], raw: {} })
const completed = () => track.mock.calls.filter((call) => (call as unknown as [{ eventName: string }])[0].eventName === 'generation.completed')

const statuses = Object.keys(TASK_STATUS_PHASE) as TaskStatus[]
const inFlight = statuses.filter((status) => TASK_STATUS_PHASE[status] === 'in-flight')
const terminal = statuses.filter((status) => TASK_STATUS_PHASE[status] === 'terminal')

describe('非终态不产出 generation.completed', () => {
  it('状态表里有排队 / 运行两种非终态和成功 / 失败两种终态（有人改了表，这里要跟着看一眼）', () => {
    expect(inFlight.sort()).toEqual(['queued', 'running'])
    expect(terminal.sort()).toEqual(['failed', 'succeeded'])
  })

  it.each(inFlight)('提交返回 %s：不报', async (status) => {
    installDesktop()
    run.mockResolvedValue(task('t-submit', status))
    await runWorkbenchTaskByVendor('v', { kind: 'text_to_video', prompt: 'p', extras: {} }, null)
    expect(completed()).toHaveLength(0)
  })

  it.each(inFlight)('轮询返回 %s：不报，之后到终态才报一次', async (status) => {
    installDesktop()
    run.mockResolvedValue(task('t-poll', 'queued'))
    await runWorkbenchTaskByVendor('v', { kind: 'text_to_video', prompt: 'p', extras: {} }, null)
    result.mockResolvedValueOnce({ vendor: 'v', result: task('t-poll', status) })
    await fetchWorkbenchTaskResultByVendor({ taskId: 't-poll', vendor: 'v', projectId: null })
    expect(completed()).toHaveLength(0)
    result.mockResolvedValueOnce({ vendor: 'v', result: task('t-poll', 'succeeded') })
    await fetchWorkbenchTaskResultByVendor({ taskId: 't-poll', vendor: 'v', projectId: null })
    expect(completed()).toHaveLength(1)
  })

  it.each(terminal)('提交就返回终态 %s：报一次', async (status) => {
    installDesktop()
    run.mockResolvedValue(task('t-sync', status))
    await runWorkbenchTaskByVendor('v', { kind: 'text_to_image', prompt: 'p', extras: {} }, null)
    expect(completed()).toHaveLength(1)
  })

  it('不认识的状态（主进程以后多发一个、前端还没归类）：不报，宁可漏报也不把没结果的当结果', async () => {
    installDesktop()
    run.mockResolvedValue(task('t-unknown', 'paused'))
    await runWorkbenchTaskByVendor('v', { kind: 'text_to_video', prompt: 'p', extras: {} }, null)
    result.mockResolvedValueOnce({ vendor: 'v', result: task('t-unknown', 'paused') })
    await fetchWorkbenchTaskResultByVendor({ taskId: 't-unknown', vendor: 'v', projectId: null })
    expect(completed()).toHaveLength(0)
  })
})
