import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeAttentionSound } from './shared/contracts/attentionSound'

const mocks = vi.hoisted(() => ({
  focused: false, minimized: false, visible: true, supported: true, system: true,
  read: vi.fn(), play: vi.fn().mockResolvedValue(true), notices: vi.fn(), show: vi.fn(), handlers: new Map(),
}))
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, isFocused: () => mocks.focused,
    isVisible: () => mocks.visible, isMinimized: () => mocks.minimized }] },
  Notification: class {
    static isSupported = () => mocks.supported
    constructor(options: unknown) { mocks.notices(options) }
    on() { return this }
    show = mocks.show
  },
  ipcMain: { handle: (name: string, fn: unknown) => mocks.handlers.set(name, fn) },
}))
vi.mock('./crashLog', () => ({ logCrash: vi.fn() }))
vi.mock('./ipcSenderGuard', () => ({ assertTrustedSender: vi.fn() }))
vi.mock('./attentionSoundPlayer', () => ({ playAttentionSound: mocks.play }))
vi.mock('./settings/attentionSoundSettings', () => ({ readAttentionSoundSettings: mocks.read }))
vi.mock('./settings/automationPolicySettings', () => ({ readAutomationPolicySettings: () => ({ systemNotifications: mocks.system }) }))
import { showDesktopNotification } from './desktopNotification'
import { createBackgroundIdleExit, setBackgroundIdleExitOwner } from './backgroundIdleExit'
import { registerNotificationIpc } from './notificationIpc'
import { createProductionNotificationsListener } from './productionRun/productionNotificationsDesktop'
import type { ProductionRun, RunEvent } from './productionRun/productionRunTypes'

const input = { title: 'Nomi', body: 'decision', event: 'decision' as const, onClick: vi.fn() }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.focused = false; mocks.visible = true; mocks.minimized = false; mocks.system = true; mocks.supported = true
  mocks.read.mockReturnValue(normalizeAttentionSound(null))
  setBackgroundIdleExitOwner(null)
})
describe('one sound boundary for real notification producers', () => {
  it('off is silent, on in background plays once, and OS never adds its sound', () => {
    mocks.read.mockReturnValue(normalizeAttentionSound({ enabled: false }))
    showDesktopNotification(input)
    expect(mocks.play).not.toHaveBeenCalled()
    mocks.read.mockReturnValue(normalizeAttentionSound(null))
    showDesktopNotification(input)
    expect(mocks.play).toHaveBeenCalledTimes(1)
    expect(mocks.notices.mock.calls.every(([options]) => options.silent === true)).toBe(true)
  })
  it('visible focused windows suppress; minimized or hidden windows can alert', () => {
    mocks.focused = true
    showDesktopNotification(input)
    expect(mocks.play).not.toHaveBeenCalled()
    mocks.minimized = true
    showDesktopNotification(input)
    mocks.minimized = false; mocks.visible = false
    showDesktopNotification(input)
    expect(mocks.play).toHaveBeenCalledTimes(2)
  })
  it('completion and slow events are opt-in, independent of OS notification support', () => {
    showDesktopNotification({ ...input, event: 'completed' })
    showDesktopNotification({ ...input, event: 'slow' })
    expect(mocks.play).not.toHaveBeenCalled()
    mocks.read.mockReturnValue(normalizeAttentionSound({ events: { completed: true, slow: true } }))
    mocks.supported = false
    showDesktopNotification({ ...input, event: 'completed' })
    mocks.system = false
    showDesktopNotification({ ...input, event: 'slow' })
    expect(mocks.play).toHaveBeenCalledTimes(2)
  })
  it('background-unshown launches suppress system notifications until the window is shown', () => {
    const owner = createBackgroundIdleExit({ hasInFlightWork: () => false, quit: vi.fn() })
    setBackgroundIdleExitOwner(owner)
    expect(showDesktopNotification(input)).toEqual({ ok: false, reason: 'background-unshown' })
    expect(mocks.show).not.toHaveBeenCalled()
    owner.markWindowShown()
    expect(showDesktopNotification(input).ok).toBe(true)
    owner.dispose()
    setBackgroundIdleExitOwner(null)
  })
  it('renderer IPC uses the shared boundary and rereads settings', () => {
    registerNotificationIpc()
    const show = mocks.handlers.get('nomi:notifications:show')
    show({}, { title: 'approval', event: 'decision' })
    expect(mocks.play).toHaveBeenCalledTimes(1)
    mocks.read.mockReturnValue(normalizeAttentionSound({ enabled: false }))
    show({}, { title: 'approval', event: 'decision' })
    expect(mocks.play).toHaveBeenCalledTimes(1)
  })
  it('production approvals use the same boundary and remain deduplicated', () => {
    const listener = createProductionNotificationsListener()
    const events = [{ type: 'gate.waiting', message: 'approve' }] as RunEvent[]
    const run = { runId: 'run', projectId: 'project', status: 'running' } as ProductionRun
    listener(events, run); listener(events, run)
    expect(mocks.play).toHaveBeenCalledTimes(1)
  })
})
