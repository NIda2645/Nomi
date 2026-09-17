import { afterEach, describe, expect, it, vi } from 'vitest'
import { importWorkbenchLocalAssetFile, importWorkbenchRemoteAssetUrl } from './assetUploadApi'

/** 上传的项目绑定由动作起点签发后显式传入；这里给一个仍然有效的签发替身。 */
const issued = (projectId: string, assertCurrent: () => void = () => undefined) => ({
  projectBinding: { projectId, immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 },
  assertCurrent,
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('local asset upload transport', () => {
  it('carries remote import identity and preserves cancellation from the main session', async () => {
    const binding = { projectId: 'original', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 }
    const importRemoteUrl = vi.fn(async () => ({ ok: false, failure: { code: 'project_binding_stale', reason: 'import-failed' } }))
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { nomiDesktop: { assets: { importRemoteUrl } } } })
    await expect(importWorkbenchRemoteAssetUrl('https://example.com/image.png', 'image.png', { projectBinding: binding, assertCurrent: () => undefined }))
      .rejects.toMatchObject({ code: 'project_binding_stale' })
    expect(importRemoteUrl).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'original', projectBinding: binding }))
  })

  it('keeps a structured storage rejection across the IPC result envelope', async () => {
    const failure = { code: 'capability_execution_failed', reason: 'no-disk-space' }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { nomiDesktop: { assets: {
      importFile: vi.fn(async () => JSON.parse(JSON.stringify({ ok: false, failure }))),
    } } } })
    await expect(importWorkbenchLocalAssetFile(new File(['x'], 'note.txt'), 'note.txt', issued('original'))).rejects.toMatchObject(failure)
  })

  it('rechecks cancellation after asynchronous byte preparation before any disk request', async () => {
    let current = true
    const importFile = vi.fn()
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { nomiDesktop: { assets: { importFile } } } })
    const file = { name: 'artifact.txt', type: 'text/plain', arrayBuffer: async () => {
      current = false
      return new ArrayBuffer(4)
    } } as unknown as File
    await expect(importWorkbenchLocalAssetFile(file, file.name, issued('original', () => {
      if (!current) throw new Error('project_binding_stale')
    }))).rejects.toThrow('project_binding_stale')
    expect(importFile).not.toHaveBeenCalled()
  })

  it('uses the Electron native-file bridge before reading bytes into renderer memory', async () => {
    const imported = {
      id: 'asset-1', name: 'large-video.mp4', data: { url: 'nomi-local://asset/p/large-video.mp4' },
      createdAt: '', updatedAt: '', userId: 'local', projectId: 'project-1',
    }
    const importNativeFile = vi.fn(async () => ({ ok: true, asset: imported }))
    const importFile = vi.fn(async () => ({ ok: true, asset: imported }))
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { nomiDesktop: { assets: { importNativeFile, importFile } } },
    })
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(4))
    const file = { name: 'large-video.mp4', type: 'video/mp4', arrayBuffer } as unknown as File

    const result = await importWorkbenchLocalAssetFile(file, file.name, issued('project-1'))

    expect(result).toEqual(imported)
    expect(importNativeFile).toHaveBeenCalledWith(file, {
      projectId: 'project-1',
      projectBinding: issued('project-1').projectBinding,
      fileName: 'large-video.mp4',
      contentType: 'video/mp4',
      kind: 'upload',
      ownerNodeId: null,
    })
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(importFile).not.toHaveBeenCalled()
  })
})
