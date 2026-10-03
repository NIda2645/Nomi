/** Dev-only frame renderer for L5 judge. It is intentionally a separate entry and is never imported by product code. */
import React, { type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { FencedCanvas } from '../workbench/generationCanvas/nodes/fencedCanvas'
import { DirectorStoreContext, useDirectorStoreApi } from '../workbench/generationCanvas/nodes/director/DirectorEditorContext'
import { createDirectorStore } from '../workbench/generationCanvas/nodes/director/model/directorStore'
import type { DirectorProject } from '../workbench/generationCanvas/nodes/director/model/directorTypes'
import { exportDimensions } from '../workbench/generationCanvas/nodes/director/model/exportSize'
import { programCameraIdAt } from '../workbench/generationCanvas/nodes/director/model/programCamera'
import { CaptureBinder } from '../workbench/generationCanvas/nodes/director/scene/capture/CaptureBinder'
import { DirectorEntities } from '../workbench/generationCanvas/nodes/director/scene/entities/DirectorEntities'
import { PanoramaSphere } from '../workbench/generationCanvas/nodes/director/scene/environment/PanoramaSphere'
import { SkyGround } from '../workbench/generationCanvas/nodes/director/scene/environment/SkyGround'
import { createSceneRefRegistry } from '../workbench/generationCanvas/nodes/director/scene/sceneRefs'
import { SceneRegistryContext, useSceneRegistry } from '../workbench/generationCanvas/nodes/director/scene/SceneRegistryContext'
import { attachWebGLContextRecovery } from '../workbench/generationCanvas/nodes/director/scene/webglContextRecovery'
import { ViewportApiContext, type ViewportApiRef } from '../workbench/generationCanvas/nodes/director/scene/ViewportApiContext'
import { useTimelinePlayback } from '../workbench/generationCanvas/nodes/director/scene/useTimelinePlayback'
import { seekTo } from '../workbench/generationCanvas/nodes/director/timeline/timelineCommands'

type Request = { project: DirectorProject; times: number[]; width?: number; height?: number }
type Result = { frames: string[]; width: number; height: number; cameraIds: Array<string | null> }
type RenderWindow = Window & { __nomiDirectorRenderResult?: Result | { error: string }; __nomiDirectorRenderReady?: boolean }

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = (left: number) => left <= 0 ? resolve() : requestAnimationFrame(() => tick(left - 1))
    tick(count)
  })
}

function Recovery(): null {
  // This component runs inside R3F and keeps the same context recovery behavior as the editor.
  const { gl, invalidate } = useThree() as { gl: THREE.WebGLRenderer; invalidate: () => void }
  React.useEffect(() => attachWebGLContextRecovery(gl.domElement, invalidate), [gl, invalidate])
  return null
}

function Playback(): null { useTimelinePlayback(); return null }

function CaptureDriver({ request, onDone }: { request: Request; onDone: (result: Result | { error: string }) => void }): null {
  const store = useDirectorStoreApi()
  const registry = useSceneRegistry()
  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const scene = store.getState().activeScene()
        const full = exportDimensions(store.getState().project.exportRatio, store.getState().project.exportResolution)
        const width = request.width ?? Math.min(full.width, 960)
        const height = request.height ?? Math.min(full.height, Math.round((width * full.height) / full.width))
        const frames: string[] = []
        const cameraIds: Array<string | null> = []
        await nextFrames(8)
        for (const time of request.times) {
          if (cancelled) return
          seekTo(store, time)
          await nextFrames(2)
          const cameraId = programCameraIdAt(time, scene.cameras, scene.timelineTrackOrder)
          cameraIds.push(cameraId)
          const frame = await registry.captureFrame({ cameraId: cameraId ?? 'black', width, height, burnLabels: false })
          if (!frame) throw new Error(`capture returned null at t=${time}`)
          frames.push(frame.dataUrl)
        }
        onDone({ frames, width, height, cameraIds })
      } catch (error) {
        onDone({ error: error instanceof Error ? error.message : String(error) })
      }
    }
    void run()
    return () => { cancelled = true }
  }, [onDone, registry, request, store])
  return null
}

function RenderCanvas({ request, onDone }: { request: Request; onDone: (result: Result | { error: string }) => void }): JSX.Element {
  const store = React.useMemo(() => createDirectorStore({ rawProject: request.project, defaultSceneName: request.project.scenes[0]?.name ?? 'Scene 1' }), [request.project])
  const registry = React.useMemo(() => createSceneRefRegistry(), [])
  const apiRef = React.useRef(null) as ViewportApiRef
  return <div style={{ width: '100%', height: '100%' }}>
    <DirectorStoreContext.Provider value={store}>
      <ViewportApiContext.Provider value={apiRef}>
        <FencedCanvas frameloop="always" shadows="percentage" dpr={1} gl={{ antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }} camera={{ fov: 50, near: 0.1, far: 2000, position: [4, 2.4, 5] }} style={{ width: '100%', height: '100%' }} onCreated={({ gl }: { gl: THREE.WebGLRenderer }) => { gl.outputColorSpace = THREE.SRGBColorSpace }}>
          <SceneRegistryContext.Provider value={registry}>
            <Recovery />
            <SkyGround theme="default" />
            <PanoramaSphere />
            <DirectorEntities />
            <Playback />
            <CaptureBinder />
            <CaptureDriver request={request} onDone={onDone} />
          </SceneRegistryContext.Provider>
        </FencedCanvas>
      </ViewportApiContext.Provider>
    </DirectorStoreContext.Provider>
  </div>
}

function App(): JSX.Element {
  const [request, setRequest] = React.useState<Request | null>(null)
  const onDone = React.useCallback((result: Result | { error: string }) => {
    const target = window as RenderWindow
    target.__nomiDirectorRenderResult = result
    window.parent.postMessage({ type: 'nomi-director-render-result', result }, '*')
  }, [])
  React.useEffect(() => {
    const target = window as RenderWindow
    target.__nomiDirectorRenderReady = true
    const listener = (event: MessageEvent) => {
      if (event.data?.type === 'nomi-director-render-start') setRequest(event.data.request as Request)
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [])
  return request ? <RenderCanvas request={request} onDone={onDone} /> : <div data-testid="director-render-ready" />
}

createRoot(document.getElementById('root')!).render(<App />)
