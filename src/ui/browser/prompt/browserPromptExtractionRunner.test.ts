import { notifications, notificationsStore } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runBrowserPromptExtractionToLibrary } from './browserPromptExtractionRunner'

const mocks = vi.hoisted(() => ({ save: vi.fn(), run: vi.fn() }))
vi.mock('../../../desktop/bridge', () => ({ getDesktopBridge: () => null }))
vi.mock('../../../workbench/api/promptLibraryApi', () => ({ addUserPrompt: mocks.save, getTextBrain: async () => ({ vendor: 'fixture', modelKey: 'fixture' }) }))
vi.mock('../../../workbench/api/taskApi', () => ({ runWorkbenchTaskByVendor: mocks.run }))
const request = { requestId: 'capture-1', sourceType: 'image' as const, modelImageUrl: 'data:image/png;base64,fixture', title: 'Test reference' }

describe('browser extraction local feedback', () => {
  beforeEach(() => { vi.clearAllMocks(); notifications.clean() })
  it('reports progress and saved location only through the actual request host', async () => {
    mocks.run.mockResolvedValue({ status: 'succeeded', raw: { text: JSON.stringify({ title: 'Saved reference', prompt: 'A reference image' }) } })
    mocks.save.mockResolvedValue(undefined)
    const present = vi.fn()
    await runBrowserPromptExtractionToLibrary(request, present, null)
    expect(present).toHaveBeenCalledTimes(2)
    expect(present.mock.calls[0][0]).toContain('提取')
    expect(present.mock.calls[1][0]).toContain('提示词库')
    expect(mocks.save).toHaveBeenCalledOnce()
    expect(notificationsStore.getState().notifications).toHaveLength(0)
  })
  it('keeps failures with their originating host and never emits a global notification', async () => {
    mocks.run.mockRejectedValue(new Error('Vision model unavailable; retry'))
    const firstHost = vi.fn()
    const secondHost = vi.fn()
    await Promise.all([
      runBrowserPromptExtractionToLibrary(request, firstHost, null),
      runBrowserPromptExtractionToLibrary({ ...request, requestId: 'capture-2' }, secondHost, null),
    ])
    expect(firstHost.mock.calls.at(-1)?.[0]).toContain('Vision model unavailable; retry')
    expect(secondHost.mock.calls.at(-1)?.[0]).toContain('Vision model unavailable; retry')
    expect(mocks.save).not.toHaveBeenCalled()
    expect(notificationsStore.getState().notifications).toHaveLength(0)
  })
})
