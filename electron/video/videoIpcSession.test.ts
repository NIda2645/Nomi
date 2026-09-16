import { beforeEach, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import type { CanvasReadSurfaceIpcCapture } from '../capabilityCore/canvasReadSurfaceIpc'

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>>(), extract: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>) => mocks.handlers.set(name, handler) } }))
vi.mock('../ipcSenderGuard', () => ({ assertTrustedSender: vi.fn() }))
vi.mock('./depthVideoIpc', () => ({ registerVideoDepthIpc: vi.fn() }))
vi.mock('./extractVideoFrame', () => ({ extractVideoFrameToAsset: mocks.extract }))
import { createProjectInteractionCapture } from '../assets/projectInteractionCapture'
import { registerVideoIpc } from './videoIpc'

const binding = { projectId: 'a', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 }
const event = { sender: {}, senderFrame: {} } as IpcMainInvokeEvent
beforeEach(() => { vi.clearAllMocks(); mocks.handlers.clear() })

it('opens the trusted project session before any await and hands its assertion to frame publication', async () => {
  const session = Object.freeze({})
  let current = true
  const capture = {
    openProjectSession: vi.fn(() => session),
    assertProjectSession: vi.fn(() => { if (!current) throw Object.assign(new Error('project_binding_stale'), { code: 'project_binding_stale' }) }),
  }
  registerVideoIpc(createProjectInteractionCapture(capture as unknown as CanvasReadSurfaceIpcCapture, () => undefined))
  mocks.extract.mockImplementation(async (_payload: unknown, options: { assertCurrent?: () => void }) => {
    current = false
    options.assertCurrent?.()
    return { url: 'nomi-local://frame' }
  })
  const pending = mocks.handlers.get('nomi:video:extract-frame')!(event, { videoUrl: '/v.mp4', which: 'first', projectId: 'a', projectBinding: binding })
  expect(capture.openProjectSession).toHaveBeenCalledWith(event, binding)
  await expect(pending).rejects.toMatchObject({ code: 'project_binding_stale' })
  expect(capture.assertProjectSession).toHaveBeenCalledWith(event, session)
})

it('treats a frame request without a binding as explicit project IO without interactive authority', async () => {
  const capture = { openProjectSession: vi.fn(), assertProjectSession: vi.fn() }
  registerVideoIpc(createProjectInteractionCapture(capture as unknown as CanvasReadSurfaceIpcCapture, () => undefined))
  mocks.extract.mockResolvedValue({ url: 'nomi-local://frame' })
  await expect(mocks.handlers.get('nomi:video:extract-frame')!(event, { videoUrl: '/v.mp4', which: 'last', projectId: 'a' })).resolves.toEqual({ url: 'nomi-local://frame' })
  expect(capture.openProjectSession).not.toHaveBeenCalled()
  expect(mocks.extract).toHaveBeenCalledWith(expect.anything(), { assertCurrent: undefined })
})
