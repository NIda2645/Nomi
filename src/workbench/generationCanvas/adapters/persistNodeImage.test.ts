import { describe, expect, it, vi } from 'vitest'
import { dataUrlToFile } from './persistNodeImage'
import { SurfacePortWireError } from '../../../../electron/shared/surfacePortBinding'
import type { ProjectExecutionContext } from '../../project/projectCanvasReadSurface'

function projectContext() {
  const controller = new AbortController()
  const context: ProjectExecutionContext = {
    binding: { projectId: 'project-a', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 },
    signal: controller.signal,
    assertCurrent() { if (controller.signal.aborted) throw new SurfacePortWireError('project_binding_stale') },
  }
  return { context, cancel: () => controller.abort() }
}

// 1x1 透明 PNG 的 base64 dataURL
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('dataUrlToFile', () => {
  it('解码 base64 dataURL 为 File，保留 contentType 与字节', () => {
    const file = dataUrlToFile(PNG_DATA_URL, 'tile.png')
    expect(file).not.toBeNull()
    expect(file?.type).toBe('image/png')
    expect(file?.name).toBe('tile.png')
    // 1x1 PNG 至少有几十字节
    expect((file?.size ?? 0)).toBeGreaterThan(0)
  })

  it('非法 dataURL 返回 null（不抛错）', () => {
    expect(dataUrlToFile('not-a-data-url', 'x.png')).toBeNull()
    expect(dataUrlToFile('', 'x.png')).toBeNull()
  })

  it('缺省 contentType 回退 image/png', () => {
    const file = dataUrlToFile('data:;base64,QUJD', 'x.png')
    expect(file?.type).toBe('image/png')
  })
})

describe('persistNodeImageFile', () => {
  it('上传成功时返回 data.url（nomi-local URL）', async () => {
    vi.resetModules()
    vi.doMock('../../api/assetUploadApi', () => ({
      importWorkbenchLocalAssetFile: vi.fn(async () => ({ data: { url: 'nomi-local://assets/abc.png' } })),
      hostedAssetUrl: (asset: { data?: { url?: unknown } } | null | undefined) =>
        (typeof asset?.data?.url === 'string' ? asset.data.url.trim() : ''),
    }))
    const { persistNodeImageFile: persist } = await import('./persistNodeImage')
    const file = dataUrlToFile(PNG_DATA_URL, 'tile.png')!
    await expect(persist(file, 'node-1', projectContext().context)).resolves.toBe('nomi-local://assets/abc.png')
    vi.doUnmock('../../api/assetUploadApi')
  })

  it('上传抛错时返回 null（调用方退回 base64 兜底，不丢图）', async () => {
    vi.resetModules()
    vi.doMock('../../api/assetUploadApi', () => ({
      importWorkbenchLocalAssetFile: vi.fn(async () => {
        throw new Error('disk full')
      }),
      hostedAssetUrl: (asset: { data?: { url?: unknown } } | null | undefined) =>
        (typeof asset?.data?.url === 'string' ? asset.data.url.trim() : ''),
    }))
    const { persistNodeImageFile: persist } = await import('./persistNodeImage')
    const file = dataUrlToFile(PNG_DATA_URL, 'tile.png')!
    await expect(persist(file, 'node-1', projectContext().context)).resolves.toBeNull()
    vi.doUnmock('../../api/assetUploadApi')
  })

  it.each(['file', 'blob'] as const)('never converts cancelled %s persistence into a fallback', async (kind) => {
    vi.resetModules()
    let finish!: () => void
    const wait = new Promise<void>(resolve => { finish = resolve })
    const upload = vi.fn(async () => { await wait; return { data: { url: 'nomi-local://assets/abc.png' } } })
    vi.doMock('../../api/assetUploadApi', () => ({ importWorkbenchLocalAssetFile: upload, hostedAssetUrl: () => 'nomi-local://assets/abc.png' }))
    const { persistNodeImageFile, persistNodeImageBlob } = await import('./persistNodeImage')
    const { context, cancel } = projectContext()
    const file = dataUrlToFile(PNG_DATA_URL, 'tile.png')!
    const pending = kind === 'file' ? persistNodeImageFile(file, 'node-1', context) : persistNodeImageBlob(file, 'node-1', 'tile.png', context)
    cancel(); finish()
    await expect(pending).rejects.toMatchObject({ code: 'project_binding_stale' })
    // The blob path wraps bytes in its own File (fresh lastModified), so only the file path can match by identity.
    expect(upload).toHaveBeenCalledWith(kind === 'file' ? file : expect.any(File), 'tile.png', expect.objectContaining({ projectBinding: context.binding, assertCurrent: context.assertCurrent }))
    vi.doUnmock('../../api/assetUploadApi')
  })

  it('does not swallow main-process cancellation while the renderer context remains current', async () => {
    vi.resetModules()
    vi.doMock('../../api/assetUploadApi', () => ({
      importWorkbenchLocalAssetFile: vi.fn(async () => { throw new SurfacePortWireError('capability_cancelled') }), hostedAssetUrl: () => '',
    }))
    const { persistNodeImageFile } = await import('./persistNodeImage')
    await expect(persistNodeImageFile(dataUrlToFile(PNG_DATA_URL, 'tile.png')!, 'node-1', projectContext().context))
      .rejects.toMatchObject({ code: 'capability_cancelled' })
    vi.doUnmock('../../api/assetUploadApi')
  })
})
