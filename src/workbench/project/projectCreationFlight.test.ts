import { describe, expect, it, vi } from 'vitest'
import { ProjectHydrationSupersededError } from './projectCanvasReadSurface'
import { openCreatedProject, shareInFlight, type InFlightSlot } from './projectCreationFlight'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('shareInFlight', () => {
  it('runs once while pending and hands every caller the same result', async () => {
    const slot: InFlightSlot<string> = { current: null }
    const gate = deferred<string>()
    const start = vi.fn(() => gate.promise)
    const first = shareInFlight(slot, start)
    const second = shareInFlight(slot, start)
    expect(second).toBe(first)
    await Promise.resolve()
    expect(start).toHaveBeenCalledOnce()
    gate.resolve('done')
    await expect(first).resolves.toBe('done')
  })

  it('lets the next trigger run again after success or failure', async () => {
    const slot: InFlightSlot<number> = { current: null }
    const start = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValueOnce(2)
    await expect(shareInFlight(slot, start)).rejects.toThrow('disk')
    await Promise.resolve()
    await expect(shareInFlight(slot, start)).resolves.toBe(2)
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('turns a synchronous throw into a rejection instead of escaping the caller', async () => {
    const slot: InFlightSlot<void> = { current: null }
    const result = shareInFlight(slot, () => { throw new Error('sync') })
    await expect(result).rejects.toThrow('sync')
  })
})

describe('openCreatedProject', () => {
  it('treats a hydration superseded by a later open as "not opened", not as a failure', async () => {
    await expect(openCreatedProject(() => Promise.reject(new ProjectHydrationSupersededError()))).resolves.toBe(false)
  })

  it('still surfaces real failures to the entry that reports them', async () => {
    await expect(openCreatedProject(() => Promise.reject(new Error('lane closed')))).rejects.toThrow('lane closed')
    await expect(openCreatedProject(() => Promise.resolve(true))).resolves.toBe(true)
  })
})
