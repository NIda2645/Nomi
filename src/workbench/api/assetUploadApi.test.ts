import { afterEach, describe, expect, it, vi } from 'vitest'
import { importWorkbenchLocalAssetFile } from './assetUploadApi'

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('local asset upload transport', () => {
  it('keeps a structured storage rejection across the IPC result envelope', async () => {
    const failure = { code: 'capability_execution_failed', reason: 'no-disk-space' }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { nomiDesktop: { assets: {
      importFile: vi.fn(async () => JSON.parse(JSON.stringify({ ok: false, failure }))),
    } } } })
    await expect(importWorkbenchLocalAssetFile(new File(['x'], 'note.txt'), 'note.txt', { projectId: 'original' })).rejects.toMatchObject(failure)
  })

  it('rechecks cancellation after asynchronous byte preparation before any disk request', async () => {
    let current = true
    const importFile = vi.fn()
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { nomiDesktop: { assets: { importFile } } } })
    const file = { name: 'artifact.txt', type: 'text/plain', arrayBuffer: async () => {
      current = false
      return new ArrayBuffer(4)
    } } as unknown as File
    await expect(importWorkbenchLocalAssetFile(file, file.name, {
      projectId: 'original',
      assertCurrent() { if (!current) throw new Error('project_binding_stale') },
    })).rejects.toThrow('project_binding_stale')
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

    const result = await importWorkbenchLocalAssetFile(file, file.name, { projectId: 'project-1' })

    expect(result).toEqual(imported)
    expect(importNativeFile).toHaveBeenCalledWith(file, {
      projectId: 'project-1',
      fileName: 'large-video.mp4',
      contentType: 'video/mp4',
      kind: 'upload',
    })
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(importFile).not.toHaveBeenCalled()
  })
})
