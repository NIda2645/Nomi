import { describe, expect, it, vi } from 'vitest'
import { importNativeFileFromPreload } from './nativeFileBridge'

describe('native file preload bridge', () => {
  it('derives the path in preload and overwrites any renderer-supplied sourcePath', async () => {
    const file = {} as File
    const invoke = vi.fn(async () => ({ ok: true }))
    const result = await importNativeFileFromPreload(
      file,
      { projectId: 'project-1', fileName: 'clip.mp4', sourcePath: '/renderer/forged' },
      { getPathForFile: () => '/native/clip.mp4', invoke },
    )

    expect(result).toEqual({ ok: true })
    expect(invoke).toHaveBeenCalledWith('nomi:assets:import-native-file', {
      projectId: 'project-1', fileName: 'clip.mp4', sourcePath: '/native/clip.mp4',
    })
  })

  it('returns null for synthetic files instead of opening an arbitrary path channel', async () => {
    const invoke = vi.fn()
    await expect(importNativeFileFromPreload({} as File, {}, {
      getPathForFile: () => '', invoke,
    })).resolves.toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })
})
