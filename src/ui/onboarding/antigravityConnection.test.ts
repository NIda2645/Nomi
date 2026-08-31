import { describe, expect, it, vi } from 'vitest'
import type { AntigravityConnectionStatus } from '../../desktop/onboardingBridgeTypes'
import { createAntigravityConnectionController, antigravityCheckFor, canEnableAntigravityRequest } from './antigravityConnection'
import type { AntigravityTestRequest } from '../../../electron/shared/antigravity'
const textRequest: AntigravityTestRequest = { capability: 'text', modelId: 'auto' }

const status = (state: AntigravityConnectionStatus['state']): AntigravityConnectionStatus => ({
  state, version: '1.1.21', checkedAt: Date.now(), loginCommand: 'agy', models: [{ id: 'discovered-model', label: 'Discovered' }],
  checks: state === 'ready' ? [{ ...textRequest, state: 'passed', checkedAt: Date.now(), version: '1.1.21' }] : [],
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
    antigravityCancel: vi.fn<() => Promise<AntigravityConnectionStatus | undefined>>(async () => undefined),
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
    expect(f.controller.setEnabled(true, textRequest)).toBe(false)
    expect(f.saveEnabled).not.toHaveBeenCalled()
  })

  it('requires an explicit enable after a successful test and persists it before refreshing', async () => {
    const f = fixture()
    await f.controller.test()
    expect(f.saveEnabled).not.toHaveBeenCalled()
    expect(f.controller.setEnabled(true, textRequest)).toBe(true)
    expect(f.saveEnabled).toHaveBeenCalledWith(true, textRequest)
    expect(f.onChanged).toHaveBeenCalledOnce()
  })

  it.each(['missing', 'login-required', 'unverified', 'limited', 'error'] as const)(
    'does not enable after a %s result', async (state) => {
      const f = fixture()
      f.bridge.antigravityTest.mockResolvedValue(status(state))
      await f.controller.test()
      expect(f.controller.setEnabled(true, textRequest)).toBe(false)
    },
  )

  it('discards a late success after cancellation and blocks a new test until cancellation ends', async () => {
    const f = fixture()
    const task = deferred<AntigravityConnectionStatus>()
    const stopping = deferred<undefined>()
    f.bridge.antigravityTest.mockReturnValue(task.promise)
    f.bridge.antigravityCancel.mockReturnValue(stopping.promise)
    const pending = f.controller.test()
    const cancel = f.controller.cancel()
    await f.controller.test()
    expect(f.bridge.antigravityTest).toHaveBeenCalledOnce()
    task.resolve(status('ready'))
    await pending
    stopping.resolve(undefined)
    await cancel
    expect(f.controller.getState()).toMatchObject({ busy: null, issue: 'cancelled' })
    expect(f.controller.setEnabled(true, textRequest)).toBe(false)
  })

  it('disabling persists immediately and invalidates an in-flight success', async () => {
    const f = fixture()
    const task = deferred<AntigravityConnectionStatus>()
    f.bridge.antigravityTest.mockReturnValue(task.promise)
    const pending = f.controller.test()
    expect(f.controller.setEnabled(false, textRequest)).toBe(true)
    task.resolve(status('ready'))
    await pending
    expect(f.saveEnabled).toHaveBeenCalledWith(false, textRequest)
    expect(f.bridge.antigravityCancel).toHaveBeenCalledOnce()
    expect(f.controller.getState().status?.state).not.toBe('ready')
  })

  it('preserves the real verified result when native completion wins cancellation', async () => {
    const f = fixture()
    const task = deferred<AntigravityConnectionStatus>()
    const stopping = deferred<AntigravityConnectionStatus>()
    f.bridge.antigravityTest.mockReturnValue(task.promise)
    f.bridge.antigravityCancel.mockReturnValue(stopping.promise)
    const pending = f.controller.test(textRequest)
    const cancellation = f.controller.cancel()
    expect(f.controller.getState()).toMatchObject({ busy: 'cancelling' })
    expect(f.controller.getState().issue).toBeUndefined()
    await f.controller.test()
    expect(f.bridge.antigravityTest).toHaveBeenCalledOnce()
    const ready = status('ready')
    task.resolve(ready); await pending
    stopping.resolve(ready); await cancellation
    expect(f.controller.getState()).toMatchObject({ busy: null, status: ready, issue: 'alreadyFinished' })
    expect(f.saveEnabled).not.toHaveBeenCalled()
    expect(f.controller.setEnabled(true, textRequest)).toBe(true)
  })

  it('keeps an actual cancellation unverified while preserving other capability evidence', async () => {
    const f = fixture()
    const task = deferred<AntigravityConnectionStatus>()
    const cancelled = { ...status('ready'), state: 'unverified' as const, code: 'ANTIGRAVITY_CANCELLED' }
    f.bridge.antigravityTest.mockReturnValue(task.promise)
    f.bridge.antigravityCancel.mockResolvedValue(cancelled)
    const request = { capability: 'image' as const, modelId: 'auto' }
    const pending = f.controller.test(request)
    await f.controller.cancel()
    task.resolve(status('ready')); await pending
    expect(f.controller.getState()).toMatchObject({ status: cancelled, issue: 'cancelled' })
    expect(f.controller.setEnabled(true, request)).toBe(false)
    expect(f.controller.setEnabled(true, textRequest)).toBe(true)
  })

  it('does not publish an already-finished cancellation reply after disposal', async () => {
    const f = fixture()
    const task = deferred<AntigravityConnectionStatus>()
    const stopping = deferred<AntigravityConnectionStatus>()
    f.bridge.antigravityTest.mockReturnValue(task.promise)
    f.bridge.antigravityCancel.mockReturnValue(stopping.promise)
    const pending = f.controller.test()
    const cancellation = f.controller.cancel()
    f.controller.dispose()
    const updates = f.onState.mock.calls.length
    task.resolve(status('ready')); stopping.resolve(status('ready'))
    await Promise.all([pending, cancellation])
    expect(f.onState).toHaveBeenCalledTimes(updates)
    expect(f.controller.setEnabled(true, textRequest)).toBe(false)
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
    expect(f.controller.setEnabled(true, textRequest)).toBe(false)
  })

  it('clears previous success when a later request fails', async () => {
    const f = fixture()
    await f.controller.test()
    f.bridge.antigravityTest.mockRejectedValue(new Error('IPC failed'))
    await f.controller.test()
    expect(f.controller.getState()).toMatchObject({ status: { checks: [] }, busy: null, issue: 'requestFailed' })
    expect(f.controller.setEnabled(true, textRequest)).toBe(false)
  })

  it('does not refresh or announce persisted enable when the catalog write fails', async () => {
    const f = fixture()
    await f.controller.test()
    f.saveEnabled.mockImplementation(() => { throw new Error('write failed') })
    expect(f.controller.setEnabled(true, textRequest)).toBe(false)
    expect(f.controller.getState().issue).toBe('saveFailed')
    expect(f.onChanged).not.toHaveBeenCalled()
  })
})


describe('Antigravity independent capability evidence', () => {
  it('passes the exact selected model and capability to IPC without enabling it', async () => {
    const f = fixture()
    const request = { capability: 'vision' as const, modelId: 'discovered-model' }
    await f.controller.test(request)
    expect(f.bridge.antigravityTest).toHaveBeenCalledWith(request)
    expect(f.saveEnabled).not.toHaveBeenCalled()
    expect(f.controller.setEnabled(true, request)).toBe(false)
  })

  it('retains other checks during a new test and when that request fails', async () => {
    const f = fixture()
    await f.controller.test(textRequest)
    f.bridge.antigravityTest.mockRejectedValue(new Error('IPC failed'))
    await f.controller.test({ capability: 'image', modelId: 'auto' })
    expect(f.controller.getState().status?.checks).toHaveLength(1)
    expect(f.controller.setEnabled(true, textRequest)).toBe(true)
    expect(f.controller.setEnabled(true, { capability: 'image', modelId: 'auto' })).toBe(false)
  })

  it('cancels only the selected test without erasing another capability proof', async () => {
    const f = fixture()
    await f.controller.test(textRequest)
    const task = deferred<AntigravityConnectionStatus>()
    f.bridge.antigravityTest.mockReturnValue(task.promise)
    const pending = f.controller.test({ capability: 'image', modelId: 'auto' })
    expect(f.controller.getState().status?.checks).toHaveLength(1)
    expect(f.controller.setEnabled(true, textRequest)).toBe(false)
    await f.controller.cancel()
    task.resolve(status('ready'))
    await pending
    expect(f.controller.getState().status?.checks).toHaveLength(1)
    expect(f.controller.setEnabled(true, textRequest)).toBe(true)
    expect(f.controller.setEnabled(true, { capability: 'image', modelId: 'auto' })).toBe(false)
  })

  it('does not confuse a tool, automatic routing or another model with the selected model', () => {
    const current = status('ready')
    expect(antigravityCheckFor(current, { capability: 'text', modelId: 'discovered-model' })).toBeUndefined()
    expect(canEnableAntigravityRequest(current, { capability: 'image', modelId: 'auto' })).toBe(false)
    expect(canEnableAntigravityRequest(current, textRequest)).toBe(true)
    expect(canEnableAntigravityRequest({ ...current, version: '1.1.22' }, textRequest)).toBe(false)
    expect(canEnableAntigravityRequest(current, textRequest, Date.now() + 600_001)).toBe(false)
  })
})
