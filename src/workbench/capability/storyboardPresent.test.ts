import { beforeEach, expect, it, vi } from 'vitest'
import { handleMultiShotCanvasLandingOp } from './multiShotCanvasLanding'
import { presentStoryboard } from './storyboardPresent'
import { storyboardContentToken } from '../../../electron/shared/storyboard/generationPlanEditorial'
import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { withCanvasGestureContext, type CanvasGestureContext } from '../generationCanvas/events/canvasGestureContext'
import type { StoryboardPlan } from '../generationCanvas/agent/storyboardPlan'

const calls = vi.hoisted(() => ({ read: vi.fn(), preload: vi.fn(), defaults: vi.fn(), confirm: vi.fn(), single: vi.fn(), current: true }))
vi.mock('../production/productionRunApi', () => ({ productionRunApi: { read: calls.read } }))
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
function runFixture() {
  return { runId: 'run', projectId: 'p', origin: { sourceDocument: { documentId: 'doc' } }, generationPlan: { candidate: { candidateId: 'candidate', revision: 1, moduleId: 'generation.single-shot', providerId: 'apimart', modelId: 'gpt-image-2', mode: 'text_to_image', prompt: 'Prompt', parameters: {}, references: [] }, editorial: structuredClone(plan) } }
}
let run = runFixture()
function input(shotIds = ['shot-1']) { return { projectId: 'p', runId: 'run', sourceDocumentId: 'doc', expectedContentToken: storyboardContentToken(run), shotIds } }
beforeEach(() => {
  vi.clearAllMocks(); calls.current = true; calls.defaults.mockReset(); run = runFixture()
  calls.read.mockImplementation(async () => structuredClone(run)); calls.preload.mockResolvedValue([])
  calls.confirm.mockResolvedValue(undefined); calls.single.mockResolvedValue(undefined)
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] })
})
it('executes the original materializer and batch action for exact scope; cancellation is only presented', async () => {
  const result = await presentStoryboard(input())
  expect(result).toEqual({ status: 'presented', runId: 'run', shotIds: ['shot-1'] })
  expect(useGenerationCanvasStore.getState().nodes.map(node => node.meta?.shotId)).toEqual(['shot-1'])
  expect(calls.confirm).toHaveBeenCalledOnce()
  expect(calls.confirm.mock.calls[0][0].waves.flat()).toEqual(useGenerationCanvasStore.getState().nodes.map(node => node.id))
})
it('rejects a changed target after model preload before any original action writes', async () => {
  calls.preload.mockImplementationOnce(async () => { run.generationPlan.editorial.title = 'Edited'; return [] })
  await expect(presentStoryboard(input())).rejects.toThrow('storyboard_content_conflict')
  expect(useGenerationCanvasStore.getState().nodes).toHaveLength(0)
  expect(calls.confirm).not.toHaveBeenCalled()
})
it('preserves project isolation while the original materializer awaits model defaults', async () => {
  calls.defaults.mockImplementationOnce(() => { calls.current = false })
  await expect(presentStoryboard(input())).rejects.toThrow('changed project')
  expect(useGenerationCanvasStore.getState().nodes).toHaveLength(0)
  expect(calls.confirm).not.toHaveBeenCalled()
})
it('must not include a locked completed shot in the Agent batch', async () => {
  const node = useGenerationCanvasStore.getState().addNode({ kind: 'image', meta: { storyboardDesignId: 'run', shotId: 'shot-1', frozen: { at: 1, by: 'user' } } })
  useGenerationCanvasStore.getState().updateNode(node.id, { result: { id: 'result', createdAt: 1, type: 'image', url: 'https://fixture.invalid/result.png' } })
  await presentStoryboard(input())
  expect(calls.confirm.mock.calls.flatMap(call => call[0].waves.flat())).not.toContain(node.id)
})
it('must stop when the Run target changes during original materializer awaits', async () => {
  calls.defaults.mockImplementationOnce(() => { run.generationPlan.editorial.title = 'Changed after last read' })
  await expect(presentStoryboard(input())).rejects.toThrow()
  expect(calls.confirm).not.toHaveBeenCalled()
})

it('explicit Agent edits project only existing nodes and preserve their results and overrides', async () => {
  const node = useGenerationCanvasStore.getState().addNode({ kind: 'image', prompt: 'Canvas override',
    meta: { storyboardDesignId: 'run', shotId: 'shot-1', overriddenFields: ['prompt'] } })
  const result = { id: 'result', createdAt: 1, type: 'image' as const, url: 'nomi-local://test.png' }
  useGenerationCanvasStore.getState().addNodeResult(node.id, result)
  run.generationPlan.editorial.shots[0].durationSec = 7
  const outcome = await handleMultiShotCanvasLandingOp('production.materialize-shots', {
    projectId: 'p', runId: 'run', authorContentToken: storyboardContentToken(run), existingOnly: true,
  })
  expect(outcome).toMatchObject({ createdNodeIds: [] })
  const nodes = useGenerationCanvasStore.getState().nodes
  expect(nodes).toHaveLength(1)
  expect(nodes[0]).toMatchObject({ id: node.id, prompt: 'Canvas override', result })
  expect(nodes[0].meta?.imageDurationSec).toBe(7)
})
it('an obsolete Agent edit cannot project into canvas after a newer author save', async () => {
  const token = storyboardContentToken(run)
  run.generationPlan.editorial.shots[0].prompt = 'Newer author text'
  await expect(handleMultiShotCanvasLandingOp('production.materialize-shots', {
    projectId: 'p', runId: 'run', authorContentToken: token, existingOnly: true,
  })).rejects.toThrow('storyboard_content_conflict')
  expect(useGenerationCanvasStore.getState().nodes).toEqual([])
})
