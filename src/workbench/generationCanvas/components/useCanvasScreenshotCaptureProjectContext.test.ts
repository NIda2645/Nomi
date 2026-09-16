import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const fixture = vi.hoisted(() => ({
  state: [] as unknown[], setters: [] as Array<(value: unknown) => void>, effects: [] as Array<() => unknown>,
  captured: null as ((payload: unknown) => void) | null, notify: vi.fn(),
}))
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>()
  let slot = 0
  return { ...actual, default: { ...actual,
    // One render per test step: re-read state slots in call order, run effects explicitly.
    useState: (initial: unknown) => {
      const index = slot++
      if (!(index in fixture.state)) fixture.state[index] = initial
      fixture.setters[index] = (value: unknown) => {
        fixture.state[index] = typeof value === 'function' ? (value as (current: unknown) => unknown)(fixture.state[index]) : value
      }
      return [fixture.state[index], fixture.setters[index]]
    },
    useEffect: (effect: () => unknown) => { fixture.effects.push(effect) },
    useCallback: (callback: unknown) => callback,
    __resetSlots: () => { slot = 0 },
  } }
})
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }), initReactI18next: { type: '3rdParty', init: () => undefined } }))
vi.mock('../../../ui/notificationPolicy', () => ({ notify: fixture.notify }))
vi.mock('./ScreenshotCropOverlay', () => ({ ScreenshotCropOverlay: 'screenshot-overlay' }))
vi.mock('../../../desktop/bridge', () => ({ getDesktopBridge: () => ({ screenshot: {
  onCaptured: (callback: (payload: unknown) => void) => { fixture.captured = callback; return () => { fixture.captured = null } },
  onDenied: () => () => undefined, onFailed: () => () => undefined,
} }) }))

import React from 'react'
import { useCanvasScreenshotCapture } from './useCanvasScreenshotCapture'
import {
  createProjectCanvasReadSurfaceCoordinator,
  registerProjectCanvasReadSurfaceCoordinator,
} from '../../project/projectCanvasReadSurface'

function surfaceBinding(id: number, projectId: string) {
  return { version: 1 as const, bindingId: `binding-${id}`, binding: { projectId, immutableProjectUuid: `uuid-${projectId}`, projectGeneration: 1 },
    webContentsId: 1, processId: 2, frameRoutingId: 3, origin: 'file://', surfaceInstanceId: 'surface', portRevision: id, nonce: `nonce-${id}` }
}
function harness() {
  let revision = 0
  const inert = () => () => undefined
  const bridge = {
    suspend: vi.fn(async () => ({ suspension: { version: 1 as const, suspensionId: `s-${++revision}`, surfaceInstanceId: 'surface', portRevision: revision, nonce: `sn-${revision}` } })),
    commitCanvasRead: vi.fn(async (input: { projectId: string }) => ({ binding: surfaceBinding(revision, input.projectId) })),
    captureCanvasReadSnapshot: vi.fn(), release: vi.fn(async () => ({ released: true as const })),
    onCanvasRead: inert, onDocumentRead: inert, onDocumentWrite: inert, onCanvasWriteCapture: inert,
    onCanvasWriteExecute: inert, onTimelineRead: inert, onTimelineWrite: inert, onAssetRead: inert, onExportRead: inert, onExportWrite: inert,
  }
  const coordinator = createProjectCanvasReadSurfaceCoordinator({ getSurfaceBridge: () => bridge as never, createSurfaceInstanceId: () => 'surface' })
  const hydrate = async (projectId: string) => (await coordinator.beginHydration().commitCanvasRead(projectId))!
  return { coordinator, hydrate }
}
function useRenderedScreenshotCapture(): { screenshotOverlay: JSX.Element | null } {
  ;(React as unknown as { __resetSlots(): void }).__resetSlots()
  fixture.effects = []
  const result = useCanvasScreenshotCapture({ readOnly: false, getInsertPosition: () => ({ x: 0, y: 0 }) })
  for (const effect of fixture.effects) effect()
  return result
}
const capture = (binding: unknown) => fixture.captured?.({ url: 'nomi-local://asset/a/shot.png', width: 1, height: 1, surfaceBinding: binding })
let unregister: () => void = () => undefined
beforeEach(() => { fixture.state = []; fixture.setters = []; fixture.captured = null; vi.clearAllMocks() })
afterEach(() => unregister())

it('opens the crop panel with the original project lifetime only for the exact binding main captured', async () => {
  const test = harness(); unregister = registerProjectCanvasReadSurfaceCoordinator(test.coordinator)
  const bindingA = await test.hydrate('a')
  useRenderedScreenshotCapture()
  capture(bindingA)
  const overlay = useRenderedScreenshotCapture().screenshotOverlay as ReactElement<{ project: { binding: unknown; signal: AbortSignal } }>
  expect(overlay.type).toBe('screenshot-overlay')
  expect(overlay.props.project.binding).toEqual(bindingA.binding)
  expect(overlay.props.project.signal.aborted).toBe(false)
})

it('never opens a panel in another project for a capture main bound to the previous project', async () => {
  const test = harness(); unregister = registerProjectCanvasReadSurfaceCoordinator(test.coordinator)
  const bindingA = await test.hydrate('a')
  useRenderedScreenshotCapture()
  await test.hydrate('b')
  capture(bindingA)
  expect(useRenderedScreenshotCapture().screenshotOverlay).toBeNull()
  // A → B → A: the returned project is a new epoch; the old capture cannot revive.
  await test.hydrate('a')
  capture(bindingA)
  expect(useRenderedScreenshotCapture().screenshotOverlay).toBeNull()
  capture({ ...bindingA, binding: undefined })
  expect(useRenderedScreenshotCapture().screenshotOverlay).toBeNull()
  expect(fixture.notify).not.toHaveBeenCalled()
})

it('closes an open crop panel as soon as the project is replaced', async () => {
  const test = harness(); unregister = registerProjectCanvasReadSurfaceCoordinator(test.coordinator)
  const bindingA = await test.hydrate('a')
  useRenderedScreenshotCapture()
  capture(bindingA)
  expect(useRenderedScreenshotCapture().screenshotOverlay).not.toBeNull()
  void test.coordinator.beginHydration()
  expect(useRenderedScreenshotCapture().screenshotOverlay).toBeNull()
})
