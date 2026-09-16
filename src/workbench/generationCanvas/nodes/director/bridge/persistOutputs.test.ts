import { beforeEach, describe, expect, it, vi } from 'vitest'
const bridge = vi.hoisted(() => ({ importRemoteUrl: vi.fn(), available: true }))
vi.mock('../../../../../desktop/bridge', () => ({ getDesktopBridge: () => bridge.available ? { assets: { importRemoteUrl: bridge.importRemoteUrl } } : null }))
import { persistDirectorScreenshot } from './persistOutputs'

/** 截图动作起点签发的原项目（仍然有效的替身）。 */
const project = { binding: { projectId: 'project', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 },
  signal: new AbortController().signal, assertCurrent: () => undefined }

beforeEach(() => { bridge.available = true; bridge.importRemoteUrl.mockReset() })
describe('director screenshot durable asset boundary', () => {
  it.each([undefined, '', '   ', 'data:image/png;base64,abc', 'blob:temporary'])('rejects a desktop asset without a durable url: %s', async (url) => {
    bridge.importRemoteUrl.mockResolvedValue({ ok: true, asset: { id: 'asset', data: { url } } })
    await expect(persistDirectorScreenshot('data:image/png;base64,original', 'node', 'Shot', project)).rejects.toThrow()
  })
  it('returns a persisted desktop handle unchanged', async () => {
    bridge.importRemoteUrl.mockResolvedValue({ ok: true, asset: { id: 'asset', data: { url: 'nomi-asset://project/frame.png' } } })
    await expect(persistDirectorScreenshot('data:image/png;base64,original', 'node', 'Shot', project)).resolves.toMatchObject({ url: 'nomi-asset://project/frame.png', localOnly: false })
  })
  it('explicitly identifies browser-only captures for the temporary blob path', async () => {
    bridge.available = false
    await expect(persistDirectorScreenshot('data:image/png;base64,original', 'node', 'Shot', project)).resolves.toMatchObject({ localOnly: true })
    expect(bridge.importRemoteUrl).not.toHaveBeenCalled()
  })
})
