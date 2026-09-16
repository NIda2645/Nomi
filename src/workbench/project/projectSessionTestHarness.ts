// Test-only harness: a real project coordinator with a stub main bridge, so tests exercise the single
// issuance point (withProjectAction / subscribeProjectOpened) instead of mocking "the current project".
// It is not imported by production code.
import type { CanvasReadSurfaceBridge } from '../../../electron/shared/surfacePortBinding'
import type { ProjectBinding } from '../../../electron/shared/projectBinding'
import { createProjectCanvasReadSurfaceCoordinator, registerProjectCanvasReadSurfaceCoordinator } from './projectCanvasReadSurface'

export const TEST_PROJECT_UUID = '11111111-1111-4111-8111-111111111111'

export function testProjectBinding(projectId: string): ProjectBinding {
  return Object.freeze({ projectId, immutableProjectUuid: TEST_PROJECT_UUID, projectGeneration: 1 })
}

export type ProjectSessionTestHarness = Readonly<{
  /** Hydrate this window onto a project (a fresh epoch: A→B→A never revives an older lifetime). */
  open(projectId: string): Promise<ProjectBinding>
  /** Leave the window with no open project. */
  close(): void
  dispose(): void
}>

export function createProjectSessionTestHarness(): ProjectSessionTestHarness {
  const coordinator = createProjectCanvasReadSurfaceCoordinator({
    createSurfaceInstanceId: () => 'test-window',
    getSurfaceBridge: () => ({
      suspend: async () => ({ suspension: {} }),
      release: async () => ({ released: true }),
      commitCanvasRead: async ({ projectId }: { projectId: string }) => ({ binding: { binding: testProjectBinding(projectId) } }),
    } as unknown as CanvasReadSurfaceBridge),
  })
  const unregister = registerProjectCanvasReadSurfaceCoordinator(coordinator)
  return Object.freeze({
    async open(projectId: string) {
      await coordinator.beginHydration().commitCanvasRead(projectId)
      return testProjectBinding(projectId)
    },
    close() {
      coordinator.beginHydration()
    },
    dispose() {
      unregister()
    },
  })
}
