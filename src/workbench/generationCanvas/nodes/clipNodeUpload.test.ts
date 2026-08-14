import { describe, expect, it } from 'vitest'
import { createExclusiveClipNodeUpload, importClipNodeAsset } from './clipNodeUpload'

function file(name: string, type: string): File {
  return { name, type, size: 4, lastModified: 1, arrayBuffer: async () => new ArrayBuffer(4) } as File
}

describe('clip node upload', () => {
  it('maps an imported local video to a project asset reference', async () => {
    const result = await importClipNodeAsset(file('rush.mp4', 'video/mp4'), 'project-1', async () => ({
      id: 'asset-1',
      name: 'rush.mp4',
      data: { url: 'nomi-local://project-1/rush.mp4', relativePath: 'assets/rush.mp4' },
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      userId: 'local',
      projectId: 'project-1',
    }))

    expect(result.error).toBeNull()
    expect(result.asset).toMatchObject({
      id: 'asset-1',
      kind: 'video',
      renderUrl: 'nomi-local://project-1/rush.mp4',
      source: 'project',
      origin: { source: 'project', projectId: 'project-1', relativePath: 'assets/rush.mp4' },
    })
  })

  it('returns a retryable failure when local video copy fails', async () => {
    const result = await importClipNodeAsset(file('rush.mp4', 'video/mp4'), 'project-1', async () => {
      throw new Error('copy failed')
    })

    expect(result.asset).toBeNull()
    expect(result.error).toEqual(new Error('copy failed'))
  })

  it('rejects an import that has no local render URL', async () => {
    const result = await importClipNodeAsset(file('rush.mp4', 'video/mp4'), 'project-1', async () => ({
      id: 'asset-1',
      name: 'rush.mp4',
      data: {},
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      userId: 'local',
      projectId: 'project-1',
    }))

    expect(result.asset).toBeNull()
    expect(result.error?.message).toBe('uploaded asset url missing')
  })

  it('runs only one upload at a time and reopens after completion', async () => {
    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => { release = resolve })
    const run = createExclusiveClipNodeUpload()
    const first = run(async () => { await pending; return 'first' })
    const second = run(async () => 'second')

    await expect(second).resolves.toBeNull()
    release?.()
    await expect(first).resolves.toBe('first')
    await expect(run(async () => 'third')).resolves.toBe('third')
  })
})
