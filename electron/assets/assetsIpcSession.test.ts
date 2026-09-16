import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import type { CanvasReadSurfaceIpcCapture } from '../capabilityCore/canvasReadSurfaceIpc'
import { SurfacePortWireError } from '../shared/surfacePortBinding'

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>>(),
  importFile: vi.fn(), trusted: vi.fn() }))
vi.mock('electron', () => ({ clipboard: {}, dialog: {}, ipcMain: {
  handle: (name: string, handler: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>) => mocks.handlers.set(name, handler),
} }))
vi.mock('../ipcSenderGuard', () => ({ assertTrustedSender: mocks.trusted, assertTrustedUiSender: mocks.trusted }))
vi.mock('./projectAssetStore', () => ({ copyProjectAsset: vi.fn() }))
vi.mock('./downloadPrefs', () => ({ getAutoSavePrefs: vi.fn(), setAutoSavePrefs: vi.fn() }))
vi.mock('./localFileImport', async importOriginal => ({
  ...await importOriginal<typeof import('./localFileImport')>(),
  importLocalFile: mocks.importFile,
}))
import { registerAssetsIpc } from './assetsIpc'
import { MediaImportRejectedError } from './localFileImport'

beforeEach(() => { vi.clearAllMocks(); mocks.handlers.clear() })

describe('interactive asset IPC publication authority', () => {
  const binding = { projectId: 'a', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 }
  const event = { sender: {}, senderFrame: {} } as IpcMainInvokeEvent

  it.each(['nomi:assets:import-file', 'nomi:assets:import-native-file'])('preserves real admission reasons in the wire reply: %s', async channel => {
    registerAssetsIpc({} as CanvasReadSurfaceIpcCapture)
    mocks.importFile.mockRejectedValue(new MediaImportRejectedError({
      ok: false, reason: 'no-disk-space', fileBytes: 16, freeBytes: 0, neededBytes: 16,
    }, 'note.txt'))
    await expect(mocks.handlers.get(channel)!(event, { projectId: 'a' })).resolves.toEqual({
      ok: false, failure: { code: 'capability_execution_failed', reason: 'no-disk-space' },
    })
  })

  it.each(['nomi:assets:import-file', 'nomi:assets:import-native-file'])('captures the trusted session before any await and rejects revoked publication: %s', async channel => {
    const session = Object.freeze({})
    let current = true
    const capture = { openProjectSession: vi.fn(() => { if (!current) throw new Error('too late'); return session }),
      assertProjectSession: vi.fn((sender, supplied) => {
        expect(sender).toBe(event); expect(supplied).toBe(session)
        if (!current) throw new SurfacePortWireError('project_binding_stale')
      }),
    }
    registerAssetsIpc(capture as unknown as CanvasReadSurfaceIpcCapture)
    mocks.importFile.mockImplementation(async (_payload, options) => { options.assertCurrent(); return { id: 'must-not-publish' } })
    const pending = mocks.handlers.get(channel)!(event, { projectId: 'a', projectBinding: binding, bytes: new Uint8Array([1]), sourcePath: '/native' })
    expect(capture.openProjectSession).toHaveBeenCalledWith(event, binding)
    current = false
    await expect(pending).resolves.toMatchObject({ ok: false, failure: { code: 'project_binding_stale' } })
  })

  it('does not turn explicit project file IO into a current-window-only operation', async () => {
    const capture = { openProjectSession: vi.fn(), assertProjectSession: vi.fn() }
    registerAssetsIpc(capture as unknown as CanvasReadSurfaceIpcCapture)
    mocks.importFile.mockResolvedValue({ id: 'explicit-project-file' })
    await expect(mocks.handlers.get('nomi:assets:import-file')!(event, { projectId: 'a' }))
      .resolves.toEqual({ ok: true, asset: { id: 'explicit-project-file' } })
    expect(capture.openProjectSession).not.toHaveBeenCalled()
  })
})
