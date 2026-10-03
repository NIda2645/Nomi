import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 删节点的上报是「被删的那一镜别再扣钱」的唯一通道。这里钉宿主那一层：删了谁就只报谁、报给它自己的 Run，
// 报不上去一定留痕并告诉用户（以前宿主里是 `catch {}`，命令号被 IPC 拒掉也没人知道）。
const mocks = vi.hoisted(() => ({ warn: vi.fn(), feedback: vi.fn() }))
vi.mock('../../desktop/rendererLog', () => ({ logRendererWarn: mocks.warn }))
vi.mock('../generationCanvas/components/canvasFeedback', () => ({ reportCanvasFeedback: mocks.feedback }))

import type { DesktopProductionRunBridge, ProductionRunProjection } from '../../desktop/productionRunBridgeTypes'
import { isProductionRunIdentifier } from '../../../electron/shared/productionRunCommandId'
import type { GenerationCanvasNode } from '../generationCanvas/model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { watchDeletedProductionNodes } from './watchDeletedProductionNodes'
import { releaseWorkbenchProjectRuntimeState } from '../project/releaseWorkbenchProjectSession'

type RunCommand = Parameters<DesktopProductionRunBridge['command']>[2]

const node = (id: string, productionRunId?: string) => ({
  id, kind: 'video', title: id, position: { x: 0, y: 0 }, categoryId: 'shots',
  ...(productionRunId ? { meta: { productionRunId } } : {}),
}) as GenerationCanvasNode

const run = { revision: 7, generationPlan: { state: 'running' } } as unknown as ProductionRunProjection

let stop: (() => void) | undefined

function start(command: DesktopProductionRunBridge['command']) {
  const api = { read: vi.fn(async () => run), command: vi.fn(command) }
  stop = watchDeletedProductionNodes('project-1', api)
  return api
}

beforeEach(() => {
  vi.clearAllMocks()
  // 一个已经打开的项目画布（isReady = 项目文档已装载；用户只可能在这种画布上删节点）。
  useGenerationCanvasStore.setState({
    isReady: true,
    nodes: [node('gen-shot-1', 'op-1'), node('gen-shot-2', 'op-1'), node('gen-other', 'op-2'), node('plain')],
    edges: [],
  })
})

afterEach(() => {
  stop?.()
  stop = undefined
})

describe('deleting production placeholders from the canvas', () => {
  it('reports only the deleted node, to its own Run, with a command id the IPC accepts', async () => {
    const api = start(async () => ({ run, events: [] }))
    useGenerationCanvasStore.setState({ nodes: useGenerationCanvasStore.getState().nodes.filter((n) => n.id !== 'gen-shot-2' && n.id !== 'plain') })

    await vi.waitFor(() => expect(api.command).toHaveBeenCalledTimes(1))
    const [projectId, runId, command] = api.command.mock.calls[0] as [string, string, RunCommand]
    expect([projectId, runId]).toEqual(['project-1', 'op-1'])
    expect(command).toMatchObject({ type: 'plan.detach-shot-nodes', expectedRevision: 7, payload: { nodeIds: ['gen-shot-2'] } })
    expect(isProductionRunIdentifier(command.commandId), `${command.commandId} must pass the production IPC id rule`).toBe(true)
    expect(mocks.feedback).not.toHaveBeenCalled()
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  it('a report the main process rejects is logged and shown to the user, never swallowed', async () => {
    const rejection = new Error('Invalid command id')
    start(async () => { throw rejection })
    useGenerationCanvasStore.setState({ nodes: useGenerationCanvasStore.getState().nodes.filter((n) => n.id !== 'gen-shot-2') })

    await vi.waitFor(() => expect(mocks.feedback).toHaveBeenCalledTimes(1))
    expect(mocks.feedback.mock.calls[0][2]).toMatchObject({ identity: 'production-detach:op-1', taskCenter: true, projectId: 'project-1' })
    expect(mocks.warn).toHaveBeenCalledWith('production-detach-report-failed', { runId: 'op-1', nodeCount: 1 }, rejection)
  })
})

// S1-5（2026-10-03 搞破坏线）：生成途中「返回项目库」再切回来，那一镜永远落不了图。
// 直接原因：离开项目时 releaseWorkbenchProjectRuntimeState 同步清空画布 store，而这个观察者要等 React 下一次提交
// 才卸载——清空的那一拍它还挂着，把「项目卸下」当成「用户把所有制作节点删了」上报 detach。
// Run 于是记下 canvasDetached、清掉 nodeId，之后的落地投影把这一镜当成用户删掉的，图永远落不到节点上。
describe('leaving a project is not deleting its placeholders (S1-5)', () => {
  it('reported case: back to the library while the watcher is still mounted, then reopen — nothing is reported', async () => {
    const before = useGenerationCanvasStore.getState().nodes
    const api = start(async () => ({ run, events: [] }))

    releaseWorkbenchProjectRuntimeState() // leaveProject 里的那一下（宿主组件此刻还没卸载）
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: before, edges: [], groups: [] }) // 切回来：同一个项目重新装载
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(api.read).not.toHaveBeenCalled()
    expect(api.command).not.toHaveBeenCalled()
  })

  it('class: after the project is reloaded, a real deletion on that canvas is still reported', async () => {
    const before = useGenerationCanvasStore.getState().nodes
    const api = start(async () => ({ run, events: [] }))
    releaseWorkbenchProjectRuntimeState()
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: before, edges: [], groups: [] })

    useGenerationCanvasStore.getState().deleteNode('gen-shot-1')

    await vi.waitFor(() => expect(api.command).toHaveBeenCalledTimes(1))
    expect(api.command.mock.calls[0][2]).toMatchObject({ type: 'plan.detach-shot-nodes', payload: { nodeIds: ['gen-shot-1'] } })
  })
})
