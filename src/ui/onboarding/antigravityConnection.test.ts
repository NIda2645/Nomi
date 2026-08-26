import { describe, expect, it, vi } from 'vitest'
import type { AntigravityConnectionStatus } from '../../desktop/onboardingBridgeTypes'
import { createAntigravityConnectionController } from './antigravityConnection'

const status = (state: AntigravityConnectionStatus['state']): AntigravityConnectionStatus => ({
  state, checkedAt: 1, loginCommand: 'agy', models: [{ id: 'auto', label: 'Auto' }],
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function fixture() {
  const bridge = {
    antigravityStatus: vi.fn(async () => status('unverified')),
    antigravityTest: vi.fn(async () => status('ready')),
    antigravityCancel: vi.fn(async () => {}),
  }
  const onState = vi.fn()
  const saveEnabled = vi.fn()
  const onChanged = vi.fn()
  const controller = createAntigravityConnectionController({ bridge, onState, saveEnabled, onChanged })
  return { bridge, onState, saveEnabled, onChanged, controller }
}

describe('Antigravity connection lifecycle', () => {
  it('only detects on initial check and never treats installation as permission to enable', async () => {
    const f = fixture()
    await f.controller.check()
    expect(f.bridge.antigravityTest).not.toHaveBeenCalled()
    expect(f.controller.getState().status?.state).toBe('unverified')
    expect(f.controller.setEnabled(true)).toBe(false)
    expect(f.saveEnabled).not.toHaveBeenCalled()
  })

  it('requires an explicit enable after a successful test and persists it before refreshing', async () => {
    const f = fixture()
    await f.controller.test()
    expect(f.saveEnabled).not.toHaveBeenCalled()
    expect(f.controller.setEnabled(true)).toBe(true)
    expect(f.saveEnabled).toHaveBeenCalledWith(true)
    expect(f.onChanged).toHaveBeenCalledOnce()
  })

  it.each(['missing', 'login-required', 'unverified', 'limited', 'error'] as const)(
    'does not enable after a %s result', async (state) => {
      const f = fixture()
      f.bridge.antigravityTest.mockResolvedValue(status(state))
      await f.controller.test()
      expect(f.controller.setEnabled(true)).toBe(false)
    },
  )

  it('discards a late success after cancellation and blocks a new test until cancellation ends', async () => {
    const f = fixture()
    const task = deferred<AntigravityConnectionStatus>()
    const stopping = deferred<void>()
    f.bridge.antigravityTest.mockReturnValue(task.promise)
    f.bridge.antigravityCancel.mockReturnValue(stopping.promise)
    const pending = f.controller.test()
    const cancel = f.controller.cancel()
    await f.controller.test()
    expect(f.bridge.antigravityTest).toHaveBeenCalledOnce()
    task.resolve(status('ready'))
    await pending
    stopping.resolve()
    await cancel
    expect(f.controller.getState()).toMatchObject({ busy: null, issue: 'cancelled' })
    expect(f.controller.setEnabled(true)).toBe(false)
  })

  it('disabling persists immediately and invalidates an in-flight success', async () => {
    const f = fixture()
    const task = deferred<AntigravityConnectionStatus>()
    f.bridge.antigravityTest.mockReturnValue(task.promise)
    const pending = f.controller.test()
    expect(f.controller.setEnabled(false)).toBe(true)
    task.resolve(status('ready'))
    await pending
    expect(f.saveEnabled).toHaveBeenCalledWith(false)
    expect(f.bridge.antigravityCancel).toHaveBeenCalledOnce()
    expect(f.controller.getState().status?.state).not.toBe('ready')
  })

  it('unmount cancels its test and prevents later state updates or writes', async () => {
    const f = fixture()
    const task = deferred<AntigravityConnectionStatus>()
    f.bridge.antigravityTest.mockReturnValue(task.promise)
    const pending = f.controller.test()
    f.controller.dispose()
    const updates = f.onState.mock.calls.length
    task.resolve(status('ready'))
    await pending
    expect(f.onState).toHaveBeenCalledTimes(updates)
    expect(f.bridge.antigravityCancel).toHaveBeenCalledOnce()
    expect(f.controller.setEnabled(true)).toBe(false)
  })

  it('clears previous success when a later request fails', async () => {
    const f = fixture()
    await f.controller.test()
    f.bridge.antigravityTest.mockRejectedValue(new Error('IPC failed'))
    await f.controller.test()
    expect(f.controller.getState()).toMatchObject({ status: null, busy: null, issue: 'requestFailed' })
    expect(f.controller.setEnabled(true)).toBe(false)
  })

  it('does not refresh or announce persisted enable when the catalog write fails', async () => {
    const f = fixture()
    await f.controller.test()
    f.saveEnabled.mockImplementation(() => { throw new Error('write failed') })
    expect(f.controller.setEnabled(true)).toBe(false)
    expect(f.controller.getState().issue).toBe('saveFailed')
    expect(f.onChanged).not.toHaveBeenCalled()
  })
})
