/** Dev-only frame renderer for L5 judge. It uses the product headless capture path. */
import React, { type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import type { DirectorProject } from '../workbench/generationCanvas/nodes/director/model/directorTypes'
import { programCameraIdAt } from '../workbench/generationCanvas/nodes/director/model/programCamera'
import { DirectorHeadlessCapture, type HeadlessCaptureResult } from '../workbench/generationCanvas/nodes/director/agent/DirectorHeadlessCapture'

type Request = { project: DirectorProject; times: number[]; width?: number; height?: number }
type Result = HeadlessCaptureResult
type RenderWindow = Window & { __nomiDirectorRenderResult?: Result | { error: string }; __nomiDirectorRenderReady?: boolean }

export function CaptureBridge({ request, onDone }: { request: Request; onDone: (result: Result | { error: string }) => void }): JSX.Element {
  const scene = request.project.scenes[0]
  const fullWidth = request.width ?? 960
  const fullHeight = request.height ?? 540
  return (
    <DirectorHeadlessCapture
      project={request.project}
      times={request.times}
      maxShortSide={Math.min(fullWidth, fullHeight)}
      cameraIdAt={(time) => scene ? programCameraIdAt(time, scene.cameras, scene.timelineTrackOrder) : null}
      burnLabels={false}
      onResult={(result) => onDone(result ?? { error: 'headless capture returned null' })}
    />
  )
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
  return request ? <CaptureBridge request={request} onDone={onDone} /> : <div data-testid="director-render-ready" />
}

createRoot(document.getElementById('root')!).render(<App />)
