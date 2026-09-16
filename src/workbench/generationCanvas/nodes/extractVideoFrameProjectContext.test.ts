import { beforeEach, expect, it, vi } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
const fixture = vi.hoisted(() => ({ controller: new AbortController(), extract: vi.fn(), add: vi.fn(), update: vi.fn() }))
vi.mock('../../../desktop/bridge', () => ({ getDesktopBridge: () => ({ video: { extractFrame: fixture.extract } }) }))
vi.mock('../store/generationCanvasStore', () => ({ useGenerationCanvasStore: { getState: () => ({ addNode: fixture.add, updateNode: fixture.update, selectNode: vi.fn() }) } }))
vi.mock('../../project/projectCanvasReadSurface', () => ({
  isProjectImportCancellation: (error: { code?: string }) => error.code === 'project_binding_stale',
  // The single issuance point hands the originating project to the action.
  withProjectAction: (run: (project: unknown) => unknown) => run((() => {
    const signal = fixture.controller.signal
    return { signal, binding: { projectId: 'a', immutableProjectUuid: 'uuid-a', projectGeneration: 1 },
      assertCurrent() { if (signal.aborted) throw Object.assign(new Error('stale'), { code: 'project_binding_stale' }) },
    }
  })()),
}))
import { extractVideoFrameToNode } from './extractVideoFrameToNode'
const node = { id: 'video', kind: 'video', position: { x: 0, y: 0 }, result: { id: 'result', type: 'video', url: 'nomi-local://video', createdAt: 1 } } as GenerationCanvasNode
beforeEach(() => { vi.clearAllMocks(); fixture.controller = new AbortController(); fixture.add.mockReturnValue({ id: 'frame' }) })
it.each(['first', 'last'] as const)('does not place %s frame or show a late error after A to B to A', async which => {
  fixture.extract.mockImplementation(async () => { fixture.controller.abort(); fixture.controller = new AbortController(); return { url: 'nomi-local://frame' } })
  const feedback = vi.fn()
  await extractVideoFrameToNode(node, which, feedback)
  expect(fixture.add).not.toHaveBeenCalled()
  expect(feedback).not.toHaveBeenCalled()
})
it('places a frame while the original project remains current', async () => {
  fixture.extract.mockResolvedValue({ url: 'nomi-local://frame' })
  await extractVideoFrameToNode(node, 'first', vi.fn())
  expect(fixture.add).toHaveBeenCalledOnce()
  expect(fixture.extract).toHaveBeenCalledWith({ videoUrl: 'nomi-local://video', which: 'first', projectId: 'a', projectBinding: { projectId: 'a', immutableProjectUuid: 'uuid-a', projectGeneration: 1 } })
})
