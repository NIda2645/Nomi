import { describe, expect, it } from 'vitest'
import { createDirectorStore } from './model/directorStore'
import { createDefaultProject } from './model/directorProject'
import { hasDirectorSession, registerDirectorSession, writeExternalDirectorProject } from './directorSessionRegistry'

describe('director session registry', () => {
  it('routes an external write into the mounted store and removes it on unmount', () => {
    const store = createDirectorStore({ defaultSceneName: 'Scene 1' })
    let persisted: ReturnType<typeof store.getState>['project'] | null = null
    const unregister = registerDirectorSession('node-1', {
      store,
      defaultSceneName: 'Scene 1',
      onExternalProjectChange: project => { persisted = project },
    })
    const project = createDefaultProject('Scene 1')
    project.scenes[0].name = 'AI revision'
    project.scenes[0].cameras = [
      { id: 'camera-1', name: 'Wide', position: { x: 0, y: 1, z: 4 }, rotation: { x: 0, y: 0, z: 0 }, fov: 45, near: 0.1, far: 1000 },
      { id: 'camera-2', name: 'Medium', position: { x: 0, y: 1, z: 3 }, rotation: { x: 0, y: 0, z: 0 }, fov: 45, near: 0.1, far: 1000 },
      { id: 'camera-3', name: 'Close', position: { x: 0, y: 1, z: 2 }, rotation: { x: 0, y: 0, z: 0 }, fov: 45, near: 0.1, far: 1000 },
    ]
    expect(writeExternalDirectorProject('node-1', project)).toBe(true)
    expect(store.getState().project.scenes[0].name).toBe('AI revision')
    expect(persisted?.scenes[0].cameras).toHaveLength(3)
    const reloaded = createDirectorStore({ rawProject: persisted, defaultSceneName: 'Scene 1' })
    expect(reloaded.getState().project.scenes[0].cameras).toHaveLength(3)
    expect(hasDirectorSession('node-1')).toBe(true)
    unregister()
    expect(hasDirectorSession('node-1')).toBe(false)
    expect(writeExternalDirectorProject('node-1', project)).toBe(false)
  })
})
