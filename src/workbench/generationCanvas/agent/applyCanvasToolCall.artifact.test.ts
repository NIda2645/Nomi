import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  binding: { projectId: 'project-a', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 },
  upload: vi.fn(),
}))
vi.mock('../../project/projectCanvasReadSurface', () => ({
  captureCurrentProjectCanvasReadSurfaceBinding: () => ({ binding: mocks.binding }),
}))
vi.mock('../../api/assetUploadApi', () => ({ importWorkbenchLocalAssetFile: mocks.upload }))

import { applyCanvasToolCall, resetClientIdRegistry } from './applyCanvasToolCall'
import { useGenerationCanvasStore, __resetGenerationCanvasHistoryForTests } from '../store/generationCanvasStore'
import { SurfacePortWireError } from '../../../../electron/shared/surfacePortBinding'

beforeEach(() => {
  vi.clearAllMocks()
  resetClientIdRegistry()
  __resetGenerationCanvasHistoryForTests()
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], selectedNodeIds: [], groups: [] })
})

const artifact = (content: string, clientId?: string) => ({
  kind: 'agent-artifact', title: content, ...(clientId ? { clientId } : {}),
  artifact: { fileType: 'text', content },
})

describe('artifact delivery through the real canvas apply boundary', () => {
  it('preserves storage rejection and creates no partial batch', async () => {
    mocks.upload.mockRejectedValue(new SurfacePortWireError('capability_execution_failed', 'no-disk-space'))
    await expect(applyCanvasToolCall('create_canvas_nodes', {
      nodes: [{ kind: 'image', clientId: 'image' }, artifact('note', 'note')],
    })).rejects.toMatchObject({ code: 'capability_execution_failed', reason: 'no-disk-space' })
    expect(useGenerationCanvasStore.getState().nodes).toEqual([])
    expect(mocks.upload).toHaveBeenCalledWith(expect.any(File), 'note.txt', expect.objectContaining({
      projectId: 'project-a', projectBinding: mocks.binding, assertCurrent: expect.any(Function),
    }))
  })

  it('does not apply a completed upload after the interactive turn is cancelled', async () => {
    let current = true
    mocks.upload.mockImplementation(async () => {
      current = false
      return { data: { url: 'nomi-local://asset/project-a/note.txt' } }
    })
    await expect(applyCanvasToolCall('create_canvas_nodes', { nodes: [artifact('note', 'note')] }, undefined, () => current))
      .rejects.toThrow()
    expect(useGenerationCanvasStore.getState().nodes).toEqual([])
  })

  it('keeps distinct files attached to their own nodes even without optional client IDs', async () => {
    mocks.upload.mockImplementation(async (_file, name) => ({ data: { url: `nomi-local://asset/project-a/${name}` } }))
    await applyCanvasToolCall('create_canvas_nodes', { nodes: [artifact('first'), artifact('second')] })
    expect(useGenerationCanvasStore.getState().nodes.map(node => node.meta?.artifact)).toEqual([
      { fileType: 'text', url: 'nomi-local://asset/project-a/first.txt' },
      { fileType: 'text', url: 'nomi-local://asset/project-a/second.txt' },
    ])
  })
})
