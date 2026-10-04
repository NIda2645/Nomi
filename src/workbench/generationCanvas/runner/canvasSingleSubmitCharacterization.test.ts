// 特征测试：画布单节点 ↑ 今天的用户可见行为（发动机收敛第一刀 第 1–2 步动手前先钉住）。
// 设计卡：docs/plan/2026-10-05-engine-convergence-cut1-step12-design-card.md §特征测试。
//
// 走真实的控制器（confirmAndRunNode / regenerateNodeInPlace）+ 真实的执行器（generationNodeExecutor →
// runCatalogGenerationTask），只在渲染层 ↔ 主进程那条边上换成假的（taskApi）。收敛以后这条边换成
// 「单镜 Run」的口子，下面断言的节点状态、结果落地、任务队列、取消的样子都不许变；
// 标了「今天：」的几条是有意要随拍板改的（设计卡岔路 F3），改的时候改断言、写清为什么。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmAndRunNode, regenerateNodeInPlace } from './generationRunController'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { useGenerationQueueStore } from './generationQueueStore'
import { useSpendConfirmStore } from '../spend/spendConfirm'
import { requestTaskCancel } from './localTaskControl'
import { createProjectSessionTestHarness, type ProjectSessionTestHarness } from '../../project/projectSessionTestHarness'
import type { WorkbenchProjectRecordV1 } from '../../project/projectRecordSchema'
import type { TaskRequestDto, TaskResultDto } from '../../api/taskApi'

const calls = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  mint: vi.fn(),
  runTask: vi.fn(),
  fetchResult: vi.fn(),
  confirm: vi.fn(),
}))
vi.mock('../../library/localProjectStore', () => ({
  readLocalProjectAsync: async (id: string) => structuredClone(calls.disk.get(id) ?? null),
  saveLocalProject: async (id: string, payload: WorkbenchProjectRecordV1['payload'], name: string) => {
    const record = { ...(calls.disk.get(id) as object | undefined), id, name, version: 1 as const, payload }
    calls.disk.set(id, structuredClone(record))
    return record
  },
}))
vi.mock('../../api/taskApi', async (original) => ({
  ...await original<typeof import('../../api/taskApi')>(),
  mintSpendGrant: calls.mint,
  runWorkbenchTaskByVendor: calls.runTask,
  fetchWorkbenchTaskResultByVendor: calls.fetchResult,
}))
// 目录解析不是这里要钉的东西：拿不到目录 = 信任节点上钉的供应商（catalogTaskResolve 的既有退路）。
vi.mock('../../api/modelCatalogApi', async (original) => ({
  ...await original<typeof import('../../api/modelCatalogApi')>(),
  listWorkbenchModelCatalogVendors: async () => { throw new Error('no catalog bridge in tests') },
}))
vi.mock('./assetUploadConsent', async (original) => ({
  ...await original<typeof import('./assetUploadConsent')>(),
  resolveAssetUploadConsent: async () => ({ allowed: true, needsConfirmation: false }),
}))

const IMAGE_META = { modelKey: 'img-model', modelVendor: 'acme', vendor: 'acme' }
const LOCAL_URL = 'nomi-local://asset/project-a/out.png'

function succeeded(request: TaskRequestDto, id = 'task-sync'): TaskResultDto {
  return { id, kind: request.kind, status: 'succeeded', assets: [{ type: 'image', url: LOCAL_URL }], raw: {} }
}

let session: ProjectSessionTestHarness
beforeEach(async () => {
  calls.disk.clear()
  calls.mint.mockReset().mockImplementation(async () => `grant-${calls.mint.mock.calls.length}`)
  calls.runTask.mockReset()
  calls.fetchResult.mockReset()
  calls.confirm.mockReset().mockResolvedValue(true)
  vi.spyOn(useSpendConfirmStore.getState(), 'requestConfirm').mockImplementation(calls.confirm)
  session = createProjectSessionTestHarness()
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] })
  useGenerationQueueStore.setState({ entries: [], batches: {} })
  await session.open('project-a')
})
afterEach(() => { session.dispose(); vi.restoreAllMocks() })

function addImageNode(prompt = 'a red cube') {
  const node = useGenerationCanvasStore.getState().addNode({ kind: 'image', prompt })
  useGenerationCanvasStore.getState().updateNode(node.id, { meta: { ...IMAGE_META } })
  return node.id
}

const nodeOf = (id: string) => useGenerationCanvasStore.getState().nodes.find((node) => node.id === id)!
const queueOf = (id: string) => useGenerationQueueStore.getState().entries.filter((entry) => entry.nodeId === id)

describe('画布单节点 ↑ —— 今天用户看得见的样子', () => {
  it('用户点 ↑：不弹卡，只发一笔，结果落在节点上，任务队列记成功', async () => {
    const id = addImageNode()
    calls.runTask.mockImplementation(async (_vendor: string, request: TaskRequestDto) => succeeded(request))

    await expect(confirmAndRunNode(id, { initiator: 'user' })).resolves.toBe('started')

    expect(calls.confirm).not.toHaveBeenCalled()
    expect(calls.runTask).toHaveBeenCalledOnce()
    const [vendor, request, projectId] = calls.runTask.mock.calls[0] as [string, TaskRequestDto, string]
    expect(vendor).toBe('acme')
    expect(projectId).toBe('project-a')
    expect(request.extras).toMatchObject({ nodeId: id, grantId: 'grant-1' })
    // 同一次意图的幂等键 = 节点这一次的运行记录号（重试不二次下单靠它）。
    expect(request.extras?.idempotencyKey).toBe(nodeOf(id).runs?.[0]?.id)
    const node = nodeOf(id)
    expect(node.status).toBe('success')
    expect(node.result).toMatchObject({ type: 'image', url: LOCAL_URL })
    expect(node.runs?.[0]?.status).toBe('success')
    expect(queueOf(id).map((entry) => entry.state)).toEqual(['success'])
  })

  it('受理后轮询：等待期间节点挂着任务号（重开能找回），出片后落节点', async () => {
    const id = addImageNode()
    calls.runTask.mockImplementation(async (_vendor: string, request: TaskRequestDto) => ({ id: 'task-async', kind: request.kind, status: 'queued', assets: [], raw: {} }))
    let progressTaskIdWhileWaiting = ''
    calls.fetchResult.mockImplementation(async (input: { taskId: string; taskKind: TaskRequestDto['kind'] }) => {
      progressTaskIdWhileWaiting = nodeOf(id).progress?.taskId ?? ''
      return { vendor: 'acme', result: succeeded({ kind: input.taskKind } as TaskRequestDto, input.taskId) }
    })

    await confirmAndRunNode(id, { initiator: 'user' })

    expect(calls.runTask).toHaveBeenCalledOnce()
    expect(calls.fetchResult).toHaveBeenCalledOnce()
    expect(calls.fetchResult.mock.calls[0]?.[0]).toMatchObject({ taskId: 'task-async', vendor: 'acme', projectId: 'project-a' })
    expect(progressTaskIdWhileWaiting).toBe('task-async')
    expect(nodeOf(id)).toMatchObject({ status: 'success', result: { url: LOCAL_URL } })
    expect(queueOf(id).map((entry) => entry.state)).toEqual(['success'])
  })

  it('供应商当场拒绝：节点失败带原话，任务队列记失败；用户改了再点 ↑ 能重新发（今天：F3）', async () => {
    const id = addImageNode()
    calls.runTask.mockRejectedValueOnce(new Error('acme rejected the request: prompt violates content policy'))

    await expect(confirmAndRunNode(id, { initiator: 'user' })).resolves.toBe('started')

    expect(calls.runTask).toHaveBeenCalledOnce()
    expect(nodeOf(id).status).toBe('error')
    expect(nodeOf(id).runs?.[0]).toMatchObject({ status: 'error', error: expect.stringContaining('content policy') })
    expect(queueOf(id).map((entry) => entry.state)).toEqual(['error'])

    calls.runTask.mockImplementation(async (_vendor: string, request: TaskRequestDto) => succeeded(request))
    useGenerationCanvasStore.getState().updateNode(id, { prompt: 'a blue cube' })
    await confirmAndRunNode(id, { initiator: 'user' })

    expect(calls.mint).toHaveBeenCalledTimes(2)
    expect(calls.runTask).toHaveBeenCalledTimes(2)
    const second = calls.runTask.mock.calls[1]?.[1] as TaskRequestDto
    expect(second.extras?.grantId).toBe('grant-2')
    expect(nodeOf(id)).toMatchObject({ status: 'success', result: { url: LOCAL_URL } })
  })

  it('写出去之后连接断了：今天按「失败」处理、可以再点 ↑（今天：F3；收敛后应是「结果没法确认」）', async () => {
    const id = addImageNode()
    // 主进程的同键合并器会把同一次意图的重试重放成同一个失败：这里照样回同一个错。
    calls.runTask.mockRejectedValue(new Error('acme create failed: socket hang up'))

    await confirmAndRunNode(id, { initiator: 'user' })

    // 「socket」算可重试：控制器用同一个幂等键再交两次（主进程合并成同一笔）。
    const keys = calls.runTask.mock.calls.map((call) => (call[1] as TaskRequestDto).extras?.idempotencyKey)
    expect(keys).toHaveLength(3)
    expect(new Set(keys).size).toBe(1)
    expect(nodeOf(id).status).toBe('error')
    expect(queueOf(id).map((entry) => entry.state)).toEqual(['error'])
  })

  it('供应商任务在轮询中失败：节点失败，任务队列记失败', async () => {
    const id = addImageNode()
    calls.runTask.mockImplementation(async (_vendor: string, request: TaskRequestDto) => ({ id: 'task-async', kind: request.kind, status: 'queued', assets: [], raw: {} }))
    calls.fetchResult.mockImplementation(async (input: { taskId: string; taskKind: TaskRequestDto['kind'] }) => ({
      vendor: 'acme', result: { id: input.taskId, kind: input.taskKind, status: 'failed', assets: [], raw: {}, error: 'upstream render failed' },
    }))

    await confirmAndRunNode(id, { initiator: 'user' })

    expect(nodeOf(id).status).toBe('error')
    expect(queueOf(id).map((entry) => entry.state)).toEqual(['error'])
    expect(nodeOf(id).result).toBeUndefined()
  })

  it('等结果时用户点停：节点回空闲，任务队列记取消，不再查结果，结果不落', async () => {
    const id = addImageNode()
    calls.runTask.mockImplementation(async (_vendor: string, request: TaskRequestDto) => ({ id: 'task-async', kind: request.kind, status: 'queued', assets: [], raw: {} }))
    calls.fetchResult.mockImplementation(async (input: { taskId: string; taskKind: TaskRequestDto['kind'] }) => {
      requestTaskCancel(nodeOf(id), () => undefined)
      return { vendor: 'acme', result: succeeded({ kind: input.taskKind } as TaskRequestDto, input.taskId) }
    })

    await confirmAndRunNode(id, { initiator: 'user' })

    expect(calls.fetchResult).toHaveBeenCalledOnce()
    expect(nodeOf(id).status).toBe('idle')
    expect(nodeOf(id).result).toBeUndefined()
    expect(queueOf(id).map((entry) => entry.state)).toEqual(['cancelled'])
  })

  it('提交还在路上时用户点停：节点回空闲，不进轮询，任务队列记取消', async () => {
    const id = addImageNode()
    calls.runTask.mockImplementation(async (_vendor: string, request: TaskRequestDto) => {
      requestTaskCancel(nodeOf(id), () => undefined)
      return { id: 'task-async', kind: request.kind, status: 'queued', assets: [], raw: {} }
    })

    await confirmAndRunNode(id, { initiator: 'user' })

    expect(calls.fetchResult).not.toHaveBeenCalled()
    expect(nodeOf(id).status).toBe('idle')
    expect(queueOf(id).map((entry) => entry.state)).toEqual(['cancelled'])
  })

  it('原地重新生成：同一个节点、结果进版本历史，旧结果不丢', async () => {
    const id = addImageNode()
    calls.runTask.mockImplementation(async (_vendor: string, request: TaskRequestDto) => succeeded(request, `task-${calls.runTask.mock.calls.length}`))
    await confirmAndRunNode(id, { initiator: 'user' })
    const first = nodeOf(id).result

    await expect(regenerateNodeInPlace(id, { initiator: 'user' })).resolves.toBe('started')

    expect(calls.confirm).not.toHaveBeenCalled()
    expect(calls.mint).toHaveBeenLastCalledWith([id], undefined, undefined)
    expect(useGenerationCanvasStore.getState().nodes).toHaveLength(1)
    const node = nodeOf(id)
    expect(node.result?.id).not.toBe(first?.id)
    expect((node.history ?? []).some((entry) => entry.id === first?.id)).toBe(true)
  })

  it('Agent 发起的单节点生成：先弹卡，用户点取消就一笔都不发', async () => {
    const id = addImageNode()
    calls.confirm.mockResolvedValueOnce(false)

    await expect(confirmAndRunNode(id, { initiator: 'agent' })).resolves.toBe('declined')

    expect(calls.confirm).toHaveBeenCalledOnce()
    expect(calls.mint).not.toHaveBeenCalled()
    expect(calls.runTask).not.toHaveBeenCalled()
    expect(nodeOf(id).status ?? 'idle').toBe('idle')
  })
})
