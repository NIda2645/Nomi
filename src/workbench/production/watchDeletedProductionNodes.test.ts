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
  useGenerationCanvasStore.setState({
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
