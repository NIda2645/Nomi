import { describe, expect, it, vi } from 'vitest'
import { addAssetUrlToNode } from './nodeAssetWrite'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

describe('composer reference write ownership', () => {
  function host(writable = true) {
    let node: GenerationCanvasNode = { id: 'draft', kind: 'video', title: '', position: { x: 0, y: 0 }, meta: { modelKey: 'seedance-2', archetype: { id: 'seedance-2', modeId: 'omni' } } }
    const updateNode = vi.fn((_id: string, patch: Partial<GenerationCanvasNode>) => { node = { ...node, ...patch } })
    return { updateNode, latestNode: () => node, canWrite: () => writable }
  }
  it('adds and deduplicates against the injected current draft, without needing a canvas node', () => {
    const access = host()
    expect(addAssetUrlToNode('draft', 'image', 'nomi-local://asset/a.png', access).status).toBe('added')
    expect(addAssetUrlToNode('draft', 'image', 'nomi-local://asset/b.png', access).status).toBe('added')
    expect(addAssetUrlToNode('draft', 'image', 'nomi-local://asset/a.png', access).status).toBe('duplicate')
    expect(access.updateNode).toHaveBeenCalledTimes(2)
  })
  it('read-only blocks the shared boundary even if a stale event reaches it', () => {
    const access = host(false)
    addAssetUrlToNode('draft', 'image', 'nomi-local://asset/a.png', access)
    expect(access.updateNode).not.toHaveBeenCalled()
  })
})
