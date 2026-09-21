import { beforeEach, expect, it, vi } from 'vitest'
import { presentStoryboard } from './storyboardPresent'
import { useWorkbenchStore } from '../workbenchStore'
import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { withCanvasGestureContext, type CanvasGestureContext } from '../generationCanvas/events/canvasGestureContext'
import type { StoryboardPlan } from '../generationCanvas/agent/storyboardPlan'

const calls = vi.hoisted(() => ({ preload: vi.fn(), defaults: vi.fn(), confirm: vi.fn(), single: vi.fn(), current: true }))
vi.mock('../../config/useModelOptions', () => ({ preloadModelOptions: calls.preload }))
vi.mock('../project/projectCanvasReadSurface', () => ({ withProjectAction: (action: (value: unknown) => unknown) => action({ binding: { projectId: 'p' }, signal: new AbortController().signal, assertCurrent: () => { if (!calls.current) throw new Error('changed project') } }) }))
vi.mock('../generationCanvas/components/batchPlanPreview', () => ({ confirmAndRunPlan: calls.confirm }))
vi.mock('../generationCanvas/runner/generationRunController', () => ({ confirmAndRunNode: calls.single, confirmAndRunNodeVariants: vi.fn(), regenerateNodeInPlace: vi.fn() }))
vi.mock('../generationCanvas/agent/availableModels', async importOriginal => ({
  ...await importOriginal<typeof import('../generationCanvas/agent/availableModels')>(),
  resolveStoryboardImageDefault: async () => { calls.defaults(); return {} }, resolveStoryboardVideoDefault: async () => ({}), listAvailableModelsForAgent: async () => [],
}))
vi.mock('../generationCanvas/agent/applyCanvasToolCall', () => ({
  applyCanvasToolCall: async (_tool: string, args: { nodes: { clientId: string; kind?: string; metadata?: Record<string, unknown> }[] }, gesture?: CanvasGestureContext) => {
    const write = () => {
      const clientIdToNodeId: Record<string, string> = {}
      for (const node of args.nodes) clientIdToNodeId[node.clientId] = useGenerationCanvasStore.getState().addNode({ kind: 'image', meta: node.metadata }).id
      return { clientIdToNodeId }
    }
    return gesture ? withCanvasGestureContext(gesture, write) : write()
  },
}))
const plan: StoryboardPlan = { title: 'Original editor', anchors: [], shots: [1, 2].map(index => ({ index, shotId: `shot-${index}`, shotKind: 'image', durationSec: 2, anchorIds: [], prompt: `Prompt ${index}` })) }
/** 方案正本住在项目记录里：这里改的就是用户侧栏那一行背后的那份，没有第二份可以改。 */
function design() {
  return useWorkbenchStore.getState().storyboardDesignsByDocumentId['doc'][0]
}
function editPlan(mutate: (plan: StoryboardPlan) => void) {
  const next = structuredClone(design().plan)
  mutate(next)
  useWorkbenchStore.getState().setStoryboardPlan(next, 'doc', 'run')
}
function input(shotIds = ['shot-1']) { return { projectId: 'p', designId: 'run', sourceDocumentId: 'doc', shotIds } }
/** 方案写入会顺带建它的分镜表视图（与手建方案同一条路）；这里数的是生成类节点。 */
const shotNodes = () => useGenerationCanvasStore.getState().nodes.filter(node => node.kind !== 'shot_table')
beforeEach(() => {
  vi.clearAllMocks(); calls.current = true; calls.defaults.mockReset()
  calls.preload.mockResolvedValue([])
  calls.confirm.mockResolvedValue(undefined); calls.single.mockResolvedValue(undefined)
  const store = useWorkbenchStore.getState()
  store.hydrateWorkbenchDocuments([{ id: 'doc', version: 1, title: 'Doc', updatedAt: 1, contentJson: { type: 'doc', content: [] } }], 'doc')
  store.hydrateStoryboardDesigns({})
  store.addStoryboardDesign('doc', structuredClone(plan), { id: 'run', title: plan.title })
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] })
})
it('executes the original materializer and batch action for exact scope; cancellation is only presented', async () => {
  const result = await presentStoryboard(input())
  expect(result).toEqual({ status: 'presented', designId: 'run', shotIds: ['shot-1'] })
  expect(shotNodes().map(node => node.meta?.shotId)).toEqual(['shot-1'])
  expect(calls.confirm).toHaveBeenCalledOnce()
  expect(calls.confirm.mock.calls[0][0].waves.flat()).toEqual(shotNodes().map(node => node.id))
})
it('rejects a changed target after model preload before any original action writes', async () => {
  calls.preload.mockImplementationOnce(async () => { editPlan(next => { next.title = 'Edited' }); return [] })
  await expect(presentStoryboard(input())).rejects.toThrow('storyboard_content_conflict')
  expect(shotNodes()).toHaveLength(0)
  expect(calls.confirm).not.toHaveBeenCalled()
})
it('preserves project isolation while the original materializer awaits model defaults', async () => {
  calls.defaults.mockImplementationOnce(() => { calls.current = false })
  await expect(presentStoryboard(input())).rejects.toThrow('changed project')
  expect(shotNodes()).toHaveLength(0)
  expect(calls.confirm).not.toHaveBeenCalled()
})
it('must not include a locked completed shot in the Agent batch', async () => {
  const node = useGenerationCanvasStore.getState().addNode({ kind: 'image', meta: { storyboardDesignId: 'run', shotId: 'shot-1', frozen: { at: 1, by: 'user' } } })
  useGenerationCanvasStore.getState().updateNode(node.id, { result: { id: 'result', createdAt: 1, type: 'image', url: 'https://fixture.invalid/result.png' } })
  await presentStoryboard(input())
  expect(calls.confirm.mock.calls.flatMap(call => call[0].waves.flat())).not.toContain(node.id)
})
it('must stop when the plan changes during original materializer awaits', async () => {
  calls.defaults.mockImplementationOnce(() => { editPlan(next => { next.title = 'Changed after last read' }) })
  await expect(presentStoryboard(input())).rejects.toThrow()
  expect(calls.confirm).not.toHaveBeenCalled()
})

it('passes a persistent source check separately from the foreground materialization guard', async () => {
  await presentStoryboard(input())
  const guards = calls.confirm.mock.calls[0][1]
  calls.current = false
  await expect(guards.assertCurrent()).rejects.toThrow('changed project')
  await expect(guards.assertAuthorCurrent()).resolves.toBeUndefined()
  editPlan(next => { next.shots[0].prompt = 'changed source after approval' })
  await expect(guards.assertAuthorCurrent()).rejects.toThrow('storyboard_content_conflict')
})
