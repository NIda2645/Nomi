import { createRequire } from 'node:module'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCanvasViewportGestures, type CanvasViewportGestures } from './useCanvasViewportGestures'

type FrameHarness = {
  frames: Map<number, FrameRequestCallback>
  runNext: (timestamp: number) => void
}

function createFrameHarness(): FrameHarness {
  const frames = new Map<number, FrameRequestCallback>()
  return {
    frames,
    runNext(timestamp) {
      const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined
      if (!entry) throw new Error('expected a scheduled animation frame')
      frames.delete(entry[0])
      entry[1](timestamp)
    },
  }
}

function createStrictRenderer() {
  const workspaceRequire = createRequire(import.meta.url)
  const reconcilerRequire = createRequire(workspaceRequire.resolve('@react-three/fiber'))
  type TestReconciler = {
    createContainer: (...args: unknown[]) => unknown
    updateContainer: (...args: unknown[]) => void
    flushSync: (callback: () => void) => void
    flushPassiveEffects: () => void
  }
  const Reconciler = reconcilerRequire('react-reconciler') as (
    config: Record<string, unknown>,
  ) => TestReconciler
  const { ConcurrentRoot, DefaultEventPriority } = reconcilerRequire('react-reconciler/constants') as {
    ConcurrentRoot: number
    DefaultEventPriority: number
  }
  type HostNode = { children: HostNode[] }
  const append = (parent: HostNode, child: HostNode) => { parent.children.push(child) }
  const remove = (parent: HostNode, child: HostNode) => {
    const index = parent.children.indexOf(child)
    if (index >= 0) parent.children.splice(index, 1)
  }
  const renderer = Reconciler({
    now: Date.now,
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    isPrimaryRenderer: false,
    getRootHostContext: () => null,
    getChildHostContext: () => null,
    getPublicInstance: (instance: HostNode) => instance,
    prepareForCommit: () => null,
    resetAfterCommit: () => undefined,
    preparePortalMount: () => undefined,
    createInstance: (): HostNode => ({ children: [] }),
    appendInitialChild: append,
    finalizeInitialChildren: () => false,
    prepareUpdate: () => null,
    shouldSetTextContent: () => false,
    createTextInstance: (): HostNode => ({ children: [] }),
    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,
    noTimeout: -1,
    supportsMicrotasks: true,
    scheduleMicrotask: queueMicrotask,
    getCurrentEventPriority: () => DefaultEventPriority,
    appendChild: append,
    appendChildToContainer: append,
    removeChild: remove,
    removeChildFromContainer: remove,
    insertBefore: append,
    insertInContainerBefore: append,
    commitUpdate: () => undefined,
    commitTextUpdate: () => undefined,
    resetTextContent: () => undefined,
    clearContainer: (container: HostNode) => { container.children = [] },
  })
  const container = { children: [] as HostNode[] }
  const root = renderer.createContainer(container, ConcurrentRoot, null, true, null, '', (error: unknown) => {
    throw error
  }, null)
  const render = (element: React.ReactNode) => {
    renderer.flushSync(() => renderer.updateContainer(element, root, null, null))
    renderer.flushPassiveEffects()
  }
  return { render, unmount: () => render(null) }
}

function mountStrictProbe() {
  const viewport = { zoom: 1, offset: { x: 0, y: 0 } }
  const offsetRef = { current: viewport.offset }
  const zoomRef = { current: viewport.zoom }
  const setViewport = vi.fn((next: React.SetStateAction<typeof viewport>) => {
    const resolved = typeof next === 'function' ? next(viewport) : next
    viewport.zoom = resolved.zoom
    viewport.offset = resolved.offset
  })
  let gestures: CanvasViewportGestures | null = null
  function Probe() {
    gestures = useCanvasViewportGestures({
      readOnly: false,
      stageRef: { current: null },
      offsetRef,
      zoomRef,
      setViewport,
      setContextNodeMenu: vi.fn(),
      setActiveEdge: vi.fn(),
      activeEdgeId: null,
    })
    return null
  }
  const renderer = createStrictRenderer()
  renderer.render(React.createElement(React.StrictMode, null, React.createElement(Probe)))
  const mountedGestures = gestures as CanvasViewportGestures | null
  if (!mountedGestures) throw new Error('StrictMode probe did not render')
  return { gestures: mountedGestures, renderer, setViewport, viewport }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCanvasViewportGestures StrictMode lifecycle', () => {
  it('keeps scheduled, direct, and animated viewport commands live after effect replay', () => {
    const frameHarness = createFrameHarness()
    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const id = frameHarness.frames.size + 1
        frameHarness.frames.set(id, callback)
        return id
      },
      cancelAnimationFrame: (id: number) => frameHarness.frames.delete(id),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const mounted = mountStrictProbe()

    mounted.gestures.scheduleOffset({ x: 10, y: 20 })
    expect.soft(frameHarness.frames.size).toBe(1)
    if (frameHarness.frames.size) frameHarness.runNext(0)
    expect.soft(mounted.viewport.offset).toEqual({ x: 10, y: 20 })

    mounted.gestures.setViewportTransform(2, { x: 30, y: 40 })
    expect.soft(mounted.viewport).toEqual({ zoom: 2, offset: { x: 30, y: 40 } })

    const settled = vi.fn()
    mounted.gestures.animateViewportTo(1.5, { x: 50, y: 60 }, 10, settled)
    expect.soft(frameHarness.frames.size).toBe(1)
    if (frameHarness.frames.size) frameHarness.runNext(0)
    if (frameHarness.frames.size) frameHarness.runNext(20)
    expect.soft(settled).toHaveBeenCalledExactlyOnceWith('completed')

    mounted.renderer.unmount()
  })

  it('cancels and settles the live animation on final unmount', () => {
    const frameHarness = createFrameHarness()
    let nextFrame = 1
    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const id = nextFrame++
        frameHarness.frames.set(id, callback)
        return id
      },
      cancelAnimationFrame: (id: number) => frameHarness.frames.delete(id),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const mounted = mountStrictProbe()
    const settled = vi.fn()
    mounted.gestures.animateViewportTo(2, { x: 100, y: 120 }, 160, settled)
    expect(frameHarness.frames.size).toBe(1)

    mounted.renderer.unmount()

    expect(frameHarness.frames.size).toBe(0)
    expect(settled).toHaveBeenCalledExactlyOnceWith('cancelled')
  })
})
