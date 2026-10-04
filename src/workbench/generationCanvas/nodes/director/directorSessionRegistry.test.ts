import { describe, expect, it } from 'vitest'
import { createDirectorStore } from './model/directorStore'
import { createDefaultProject } from './model/directorProject'
import { hasDirectorSession, registerDirectorSession, writeExternalDirectorProject } from './directorSessionRegistry'

describe('director session registry', () => {
  it('routes an external write into the mounted store and removes it on unmount', () => {
    const store = createDirectorStore({ defaultSceneName: 'Scene 1' })
    const unregister = registerDirectorSession('node-1', { store, defaultSceneName: 'Scene 1' })
    const project = createDefaultProject('Scene 1')
    project.scenes[0].name = 'AI revision'
    expect(writeExternalDirectorProject('node-1', project)).toBe(true)
    expect(store.getState().project.scenes[0].name).toBe('AI revision')
    expect(hasDirectorSession('node-1')).toBe(true)
    unregister()
    expect(hasDirectorSession('node-1')).toBe(false)
    expect(writeExternalDirectorProject('node-1', project)).toBe(false)
  })
})
