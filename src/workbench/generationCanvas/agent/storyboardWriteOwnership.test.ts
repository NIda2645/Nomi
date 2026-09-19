import { beforeEach, expect, it, vi } from 'vitest'
import { applyCanvasToolCall } from './applyCanvasToolCall'
import { useWorkbenchStore } from '../../workbenchStore'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { StoryboardPlan } from './storyboardPlan'

const lookup = vi.hoisted(() => ({ pause: vi.fn() }))
vi.mock('./availableModels', async original => {
  const actual = await original<typeof import('./availableModels')>()
  return { ...actual, listAvailableModelsForAgent: async () => {
    lookup.pause()
    return actual.buildAgentModelEntries([{ value: 'imagen-4', modelKey: 'imagen-4', vendor: 'google', label: 'Imagen 4', kind: 'image' }])
  } }
})
const plan: StoryboardPlan = {
  title: 'Isolated draft',
  anchors: [{ id: 'reference', kind: 'character', carrier: 'visual', name: 'Fixture', description: 'Fixture reference', referenceUrl: 'https://example.com/fixture.png', referenceKind: 'image' }],
  shots: [{ index: 1, shotKind: 'image', prompt: 'A room', durationSec: 0, anchorIds: ['reference'] }],
}
beforeEach(() => {
  lookup.pause.mockReset()
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] })
  useWorkbenchStore.getState().hydrateWorkbenchDocuments(['one', 'two'].map(id => ({ id, version: 1, title: id, contentJson: { type: 'doc', content: [] }, updatedAt: 1 })), 'one')
  useWorkbenchStore.getState().hydrateStoryboardDesigns({})
})

it('keeps an implicit document target captured before model lookup', async () => {
  lookup.pause.mockImplementation(() => useWorkbenchStore.getState().setActiveDocumentId('two'))
  await applyCanvasToolCall('propose_storyboard_plan', plan)
  expect(useWorkbenchStore.getState().storyboardDesignsByDocumentId.one).toHaveLength(1)
  expect(useWorkbenchStore.getState().storyboardDesignsByDocumentId.two ?? []).toHaveLength(0)
  expect(useWorkbenchStore.getState().activeDocumentId).toBe('two')
})

it('rejects an old result after the same target plan was edited', async () => {
  const design = useWorkbenchStore.getState().setStoryboardPlan({ ...plan, anchors: [] }, 'one')!
  lookup.pause.mockImplementation(() => useWorkbenchStore.getState().setStoryboardPlan({ ...design.plan, title: 'New user draft' }, 'one', design.id))
  await expect(applyCanvasToolCall('propose_storyboard_plan', plan, undefined, undefined, 'one', design.id)).rejects.toMatchObject({ code: 'capability_target_stale' })
  expect(useWorkbenchStore.getState().storyboardDesignsByDocumentId.one[0].plan.title).toBe('New user draft')
})

it('rejects a replaced project even if its document IDs match', async () => {
  lookup.pause.mockImplementation(() => useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] }))
  await expect(applyCanvasToolCall('propose_storyboard_plan', plan, undefined, undefined, 'one')).rejects.toMatchObject({ code: 'capability_target_stale' })
  expect(useWorkbenchStore.getState().storyboardDesignsByDocumentId.one ?? []).toHaveLength(0)
})
