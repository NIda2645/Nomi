// 已批准行为（§2 第 3 条）：已提交的后台生成属于原项目，切项目不取消它。
// 这组测的是「身份在提交那一刻固定」：轮询期间用户切到别的项目，结果仍落回原项目（此时它不在前台，
// 所以写原项目的盘上副本），新项目的画布零副作用；任务查询只复述提交时的项目身份。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerationCanvasNode, GenerationNodeResult } from '../model/generationCanvasTypes'
import type { WorkbenchProjectRecordV1 } from '../../project/projectRecordSchema'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { useGenerationQueueStore } from './generationQueueStore'
import { runGenerationNodesBatch } from './generationRunController'
import { runCatalogGenerationTask } from './catalogTaskActions'
import { setCanvasEventSinkForTests } from '../events/canvasEventEmitter'
import { __resetCanvasUndoJournalForTests } from '../events/canvasUndoJournal'
import { resetModelHealthMemory } from './modelHealthMemory'
import { saveLocalProject } from '../../library/localProjectStore'
import { createProjectSessionTestHarness, type ProjectSessionTestHarness } from '../../project/projectSessionTestHarness'
import type { TaskRequestDto } from '../../api/taskApi'

const disk = vi.hoisted(() => new Map<string, unknown>())
vi.mock('../../library/localProjectStore', () => ({
  readLocalProjectAsync: vi.fn(async (projectId: string) => structuredClone(disk.get(projectId) ?? null)),
  saveLocalProject: vi.fn(async (projectId: string, payload: unknown, name?: string) => {
    const record = { id: projectId, name, version: 1, payload }
    disk.set(projectId, structuredClone(record))
    return record
  }),
}))
vi.mock('../../api/taskApi', () => ({ mintSpendGrant: vi.fn(async () => 'grant') }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const canvasBytes = () => {
  const state = useGenerationCanvasStore.getState()
  return JSON.stringify({ nodes: state.nodes, edges: state.edges, groups: state.groups })
}

/** 用户离开 A 前 A 已保存：它在盘上的样子就是此刻 store 的样子。 */
function persistOpenCanvasAs(projectId: string): void {
  const state = useGenerationCanvasStore.getState()
  disk.set(projectId, structuredClone({ id: projectId, name: projectId, version: 1,
    payload: { generationCanvas: { nodes: state.nodes, edges: state.edges, groups: state.groups, selectedNodeIds: [] } } }))
}

function diskNode(projectId: string, nodeId: string): GenerationCanvasNode | undefined {
  const record = disk.get(projectId) as WorkbenchProjectRecordV1 | undefined
  return record?.payload.generationCanvas.nodes.find((node) => node.id === nodeId)
}

let session: ProjectSessionTestHarness
beforeEach(() => {
  disk.clear()
  vi.mocked(saveLocalProject).mockClear()
  session = createProjectSessionTestHarness()
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], selectedNodeIds: [], groups: [] })
  useGenerationQueueStore.setState({ entries: [], batches: {} })
  __resetCanvasUndoJournalForTests()
  setCanvasEventSinkForTests(() => {})
  resetModelHealthMemory()
})
afterEach(() => {
  setCanvasEventSinkForTests(null)
  session.dispose()
})

describe('background generation keeps the project identity fixed at submission', () => {
  it('a project switch during polling lands the result in the original project and leaves the new project untouched', async () => {
    const projectA = await session.open('project-a')
    const node = useGenerationCanvasStore.getState().addNode({ kind: 'image', prompt: '镜头 1' })
    const polling = deferred<GenerationNodeResult>()
    const submitted = deferred<void>()
    const run = runGenerationNodesBatch([node.id], {
      target: projectA,
      assetUploadConsent: 'not-needed',
      retry: { maxAttempts: 1 },
      executor: async (_node, context) => {
        expect(context.projectTarget).toEqual(projectA)
        context.onProgress?.({ phase: 'generating', message: 'polling', taskId: 'task-a-1' })
        submitted.resolve()
        return polling.promise
      },
    })
    await submitted.promise

    persistOpenCanvasAs('project-a')
    await session.open('project-b')
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [{ id: 'b-node', kind: 'image', title: 'B', prompt: 'B', position: { x: 0, y: 0 } }], edges: [], selectedNodeIds: [], groups: [],
    })
    const projectBBefore = canvasBytes()

    polling.resolve({ id: 'result-a', type: 'image', url: 'nomi-local://asset/project-a/result.png', createdAt: 1 } as GenerationNodeResult)
    const outcome = await run

    expect(outcome.successes.map((success) => success.nodeId)).toEqual([node.id])
    expect(canvasBytes()).toBe(projectBBefore)
    expect(vi.mocked(saveLocalProject).mock.calls.map(([projectId]) => projectId)).toEqual(['project-a'])
    const landed = diskNode('project-a', node.id)
    expect(landed).toMatchObject({ status: 'success', result: { id: 'result-a', url: 'nomi-local://asset/project-a/result.png' } })
    expect(landed?.runs?.[0]).toMatchObject({ status: 'success', projectId: 'project-a', taskId: 'task-a-1' })
  })

  it('the catalog task names its submission project for submit and every poll, whatever is open when the poll runs', async () => {
    const projectA = await session.open('project-a')
    const submissions: Array<{ projectId: string | null; extras: TaskRequestDto['extras'] }> = []
    const polls: Array<string | null> = []
    const node: GenerationCanvasNode = { id: 'video-a', kind: 'video', title: '', prompt: 'walk', position: { x: 0, y: 0 },
      meta: { modelVendor: 'asyncv', modelKey: 'video-model' } }
    const result = runCatalogGenerationTask(node, {
      projectTarget: projectA,
      pollIntervalMs: 1,
      listCatalogVendors: async () => [{ key: 'asyncv', name: 'asyncv', enabled: true, hasApiKey: true, createdAt: '', updatedAt: '' }],
      listCatalogModels: async () => [{ modelKey: 'video-model', vendorKey: 'asyncv', labelZh: 'v', kind: 'video', enabled: true, published: true, availability: { usable: true }, createdAt: '', updatedAt: '' }],
      runTask: async (_vendor, request, projectId) => {
        submissions.push({ projectId, extras: request.extras })
        await session.open('project-b')
        return { id: 'up-task', kind: request.kind, status: 'queued', assets: [], raw: {} }
      },
      fetchTaskResult: async (payload) => {
        polls.push(payload.projectId)
        return { vendor: 'asyncv', result: { id: 'up-task', kind: 'text_to_video', status: 'succeeded', assets: [{ type: 'video', url: 'nomi-local://asset/project-a/v.mp4' }], raw: {} } }
      },
    })
    await expect(result).resolves.toMatchObject({ type: 'video', url: 'nomi-local://asset/project-a/v.mp4' })
    expect(submissions).toHaveLength(1)
    expect(submissions[0].projectId).toBe('project-a')
    expect(submissions[0].extras?.projectId).toBeUndefined()
    expect(polls).toEqual(['project-a'])
  })
})
