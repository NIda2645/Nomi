import { describe, expect, it } from 'vitest'
import { createCreationResourceTreeSlice, creationResourceTreeCollapsedFor, readCreationResourceTreeCollapsed } from './creationResourceTreeCollapse'

const STORAGE_KEY = 'nomi.creationResourceTreeCollapsed'

function withStorage(seed: string | null, run: () => void): void {
  const store = new Map<string, string>()
  if (seed !== null) store.set(STORAGE_KEY, seed)
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
    },
  })
  try { run() } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis as object, 'localStorage')
  }
}

describe('creation resource tree collapse', () => {
  it('gives each surface its own default until the user decides', () => {
    // 没设过：写剧本那面那列是导航（展开）；分镜面横向预算紧（收起，把 240px 还给分镜表）。
    expect(creationResourceTreeCollapsedFor('creation', null)).toBe(false)
    expect(creationResourceTreeCollapsedFor('storyboard', null)).toBe(true)
    // 没有这一列的两个面永远算「收起」，免得它们去读一个跟自己无关的偏好。
    expect(creationResourceTreeCollapsedFor('generation', null)).toBe(true)
    expect(creationResourceTreeCollapsedFor('preview', false)).toBe(true)
  })

  it('lets one global choice override both surface defaults', () => {
    for (const mode of ['creation', 'storyboard'] as const) {
      expect(creationResourceTreeCollapsedFor(mode, true)).toBe(true)
      expect(creationResourceTreeCollapsedFor(mode, false)).toBe(false)
    }
  })

  it('remembers the choice across restarts and starts undecided when nothing is stored', () => {
    withStorage(null, () => {
      expect(readCreationResourceTreeCollapsed()).toBe(null)
      const written: Array<Record<string, unknown>> = []
      const slice = createCreationResourceTreeSlice(
        (patch) => { written.push(patch as Record<string, unknown>) },
        (() => ({})) as never,
        {} as never,
      )
      expect(slice.creationResourceTreeCollapsedPreference).toBe(null)
      slice.setCreationResourceTreeCollapsed(true)
      expect(written).toEqual([{ creationResourceTreeCollapsedPreference: true }])
      // 落盘了才叫记住：下一次冷启动读回来的就是这个值。
      expect(readCreationResourceTreeCollapsed()).toBe(true)
      slice.setCreationResourceTreeCollapsed(false)
      expect(readCreationResourceTreeCollapsed()).toBe(false)
    })
    withStorage('1', () => { expect(readCreationResourceTreeCollapsed()).toBe(true) })
    withStorage('garbage', () => { expect(readCreationResourceTreeCollapsed()).toBe(null) })
  })

  it('never writes the preference into project state', () => {
    // 用户偏好不是项目内容：setter 只回写自己那一个字段，不 bump persistRevision。
    withStorage(null, () => {
      const written: Array<Record<string, unknown>> = []
      const slice = createCreationResourceTreeSlice(
        (patch) => { written.push(patch as Record<string, unknown>) },
        (() => ({})) as never,
        {} as never,
      )
      slice.setCreationResourceTreeCollapsed(true)
      expect(written.every((patch) => !('persistRevision' in patch))).toBe(true)
    })
  })
})
