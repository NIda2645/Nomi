import { describe, expect, it, vi } from 'vitest'
import { ProjectHydrationSupersededError } from './projectCanvasReadSurface'
import { openCreatedProject, shareInFlight, type InFlightSlot, type ProjectCreationOutcome } from './projectCreationFlight'

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

// 用户现场（2026-09-24）：界面卡住期间连点两下「新建空白项目」，恢复后两下一起执行。
// 旧编排每一下都真建一个项目，后一次打开把前一次顶掉，前一次的入口把「被顶掉」报成「新建项目失败」。
describe('create-and-open under repeated activation', () => {
  function createAndOpen(slot: InFlightSlot<ProjectCreationOutcome>, deps: { create: () => string; hydrate: (id: string) => Promise<boolean> }) {
    return shareInFlight(slot, async () => {
      const projectId = deps.create()
      const opened = await openCreatedProject(() => deps.hydrate(projectId))
      return { projectId, opened }
    })
  }

  it('creates one project for two queued clicks and never reports a failure', async () => {
    const slot: InFlightSlot<ProjectCreationOutcome> = { current: null }
    const hydration = deferred<boolean>()
    let next = 0
    const create = vi.fn(() => `project-${++next}`)
    const hydrate = vi.fn(() => hydration.promise)
    const report = vi.fn()
    const clicks = [createAndOpen(slot, { create, hydrate }), createAndOpen(slot, { create, hydrate })]
      .map((click) => click.catch(report))
    hydration.resolve(true)
    const outcomes = await Promise.all(clicks)
    expect(create).toHaveBeenCalledOnce()
    expect(outcomes).toEqual([{ projectId: 'project-1', opened: true }, { projectId: 'project-1', opened: true }])
    expect(report).not.toHaveBeenCalled()
  })

  it('does not report a created project whose open was superseded by opening another project', async () => {
    const slot: InFlightSlot<ProjectCreationOutcome> = { current: null }
    const report = vi.fn()
    const outcome = await createAndOpen(slot, {
      create: () => 'project-new',
      hydrate: () => Promise.reject(new ProjectHydrationSupersededError()),
    }).catch(report)
    expect(outcome).toEqual({ projectId: 'project-new', opened: false })
    expect(report).not.toHaveBeenCalled()
  })
})
