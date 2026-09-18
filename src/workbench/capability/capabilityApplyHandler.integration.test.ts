import { beforeEach, describe, expect, it, vi } from 'vitest'

const { toastMock, dispatchEventMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  dispatchEventMock: vi.fn(),
}))

vi.mock('../../ui/notificationPolicy', () => ({ notify: toastMock }))

import { handleCapabilityApply } from './capabilityApplyHandler'
import { handleMcpHostSurfaceOp } from './mcpHostSurfaceOps'

describe('MCP desktop effects', () => {
  beforeEach(() => {
    toastMock.mockReset()
    vi.stubGlobal('window', { dispatchEvent: dispatchEventMock })
    dispatchEventMock.mockReset()
  })

  it('opens the model settings route through the existing settings event', async () => {
    await expect(handleCapabilityApply('integration.open-credentials', { sessionId: 'integration-1' }))
      .resolves.toEqual({ opened: true })
    expect(dispatchEventMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'nomi-open-settings',
    }))
    const event = dispatchEventMock.mock.calls[0][0] as CustomEvent<{ tab: string }>
    expect(event.detail).toEqual({ tab: 'models' })
  })

  it('accepts the desktop lane model-setup operation and preserves the provider hint', async () => {
    await expect(handleCapabilityApply('settings.open-model-provider', { provider: 'kie' }))
      .resolves.toEqual({ opened: true, provider: 'kie' })
    expect(dispatchEventMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'nomi-open-settings',
    }))
    const event = dispatchEventMock.mock.calls[0][0] as CustomEvent<{ tab: string }>
    expect(event.detail).toEqual({ tab: 'models' })
  })

  it('does not expose the retired automatic repair toast operation', () => {
    expect(handleMcpHostSurfaceOp('host-config.repaired', { clients: ['Claude Code', 'Codex'] })).toBeNull()
    expect(toastMock).not.toHaveBeenCalled()
  })
})
