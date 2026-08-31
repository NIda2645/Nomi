import { describe, expect, it } from 'vitest'
import { createCapturedCanvasSnapshotRegistry } from './canvasReadCapturedSnapshotLifecycle'

describe('canvas captured snapshot flow', () => {
  it('sealed A settles after release and cannot be read after switching to project B', async () => {
    const registry = createCapturedCanvasSnapshotRegistry()
    const sealedA = registry.capture('project-a', { nodes: ['a'] })
    const pending = registry.read(sealedA)
    registry.release(sealedA)
    await expect(pending).resolves.toEqual({ nodes: ['a'] })
    const sealedB = registry.capture('project-b', { nodes: ['b'] })
    await expect(registry.read(sealedA)).rejects.toThrow('captured_snapshot_stale')
    registry.release(sealedB)
  })
})
