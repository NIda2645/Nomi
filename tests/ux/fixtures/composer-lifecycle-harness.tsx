import React from 'react'
import { createRoot } from 'react-dom/client'
import { lazyWithChunkBoundary } from '../../../src/ui/chunkBoundary'
import { useGenerationCanvasReactFlowPointer } from '../../../src/workbench/generationCanvas/reactFlow/useGenerationCanvasReactFlowPointer'
import { beginCanvasDragging, CANVAS_DRAGGING_OWNER } from '../../../src/workbench/generationCanvas/components/canvasDraggingFlag'
import { useComposerViewportPlacement } from '../../../src/workbench/generationCanvas/nodes/useComposerViewportPlacement'
import { useWorkbenchStore } from '../../../src/workbench/workbenchStore'
import { useNodeResultHistory } from '../../../src/workbench/generationCanvas/nodes/useNodeResultHistory'

let loaded = false
let reloads = 0
let calls = 0
let failFirstImport: (() => void) | undefined
Object.assign(window, { nomiDesktop: { app: { hardReloadWindow: () => { reloads++ } } } })
const Composer = lazyWithChunkBoundary('composer', () => {
  calls++
  if (calls === 1) return new Promise<{ default: () => JSX.Element }>((_, reject) => { failFirstImport = () => reject(new TypeError('Failed to fetch dynamically imported module')) })
  return loaded ? Promise.resolve({ default: () => <span data-loaded>composer ready</span> }) : Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
}, { recovery: 'local', pending: <span role="status">pending</span> })
const gestureState = { remembers: 0, viewport: { x: 0, y: 0, zoom: 1 } }
const flow = { getViewport: () => gestureState.viewport, setViewport: async (next: typeof gestureState.viewport) => { gestureState.viewport = next; return true } }
const remember = () => { gestureState.remembers++ }
const setViewport = () => {}
function PanHarness({ readOnly }: { readOnly: boolean }) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const pan = useGenerationCanvasReactFlowPointer({ readOnly, hostRef, flow, activeCategoryId: 'fixture', rememberCategoryViewport: remember, setLiveViewport: setViewport })
  return <div id="stage" className="generation-canvas-v2__stage" ref={hostRef}
    onPointerDownCapture={pan.handleCanvasPointerDownCapture} onPointerDown={pan.handleCanvasPointerDown}
    onPointerMoveCapture={pan.handleCanvasPointerMoveCapture} onPointerMove={pan.handleCanvasPointerMove}
    onPointerUp={pan.handleCanvasPointerEnd} onPointerCancel={pan.handleCanvasPointerEnd} onWheelCapture={pan.handleCanvasWheelCapture}>
    <div className="react-flow__pane" style={{ width: 400, height: 200 }}>pan fixture</div>
  </div>
}
function GestureHarness() {
  const [readOnly, setReadOnly] = React.useState(false)
  const [mounted, setMounted] = React.useState(true)
  return <><button id="readonly" onClick={() => setReadOnly(value => !value)}>readonly</button>
    <button id="unmount" onClick={() => setMounted(value => !value)}>mount</button>
    {mounted && <PanHarness readOnly={readOnly} />}</>
}
const geometryNode = { id: 'geometry', kind: 'image' as const, title: 'fixture', position: { x: 0, y: 0 } }
function PlacementHarness() {
  const placement = useComposerViewportPlacement({ node: geometryNode, visualSize: { width: 320, height: 200 }, gap: 12, preferredMaxHeight: 400, minUsableHeight: 160 })
  return <div id="geometry-stage" className="generation-canvas-v2__stage" style={{ position: 'relative', width: 1000, height: 800 }}>
    <div className="generation-canvas-v2-node" style={{ position: 'absolute', left: 100, top: 100, width: 320, height: 200, transform: `scale(${placement.canvasZoom})`, transformOrigin: 'top left' }}>
      <div ref={placement.anchorRef} style={{ position: 'absolute', left: placement.left, top: placement.top, transform: `scale(${1 / placement.canvasZoom})`, transformOrigin: 'top left' }}>
        <div id="geometry-card" className="generation-canvas-v2-node__composer-card" style={{ width: 400, height: 200, maxWidth: placement.maxWidth, maxHeight: placement.maxHeight }}>controls</div>
      </div>
    </div>
  </div>
}
function Harness() {
  const [selected, select] = React.useState(true)
  const [available, availability] = React.useState(true)
  const [kind, type] = React.useState('image')
  const [id, identity] = React.useState('a')
  const [open, setOpen] = useNodeResultHistory({ id, kind, available, selected })
  return <>
    <input defaultValue="unpublished" />
    <button id="select" onClick={() => select(value => !value)}>selection</button>
    <button id="available" onClick={() => availability(value => !value)}>results</button>
    <button id="kind" onClick={() => type('video')}>type</button>
    <button id="identity" onClick={() => identity('b')}>identity</button>
    <button id="history" onClick={() => setOpen(true)}>{open ? 'history' : 'composer'}</button>
    <Composer />
    <GestureHarness />
    <PlacementHarness />
  </>
}
Object.assign(window, { composerFixture: { fail: () => failFirstImport?.(), load: () => { loaded = true }, snapshot: () => ({ calls, reloads }), gesture: () => gestureState,
  zoom: (zoom: number) => useWorkbenchStore.setState(state => ({ categoryViewports: { ...state.categoryViewports, [state.activeCategoryId]: { zoom, offset: { x: 0, y: 0 } } } })),
  holdOther: () => {
    const stage = document.createElement('div'); stage.id = 'other-stage'; stage.className = 'generation-canvas-v2__stage'; document.body.append(stage)
    const lease = beginCanvasDragging(stage, CANVAS_DRAGGING_OWNER.node)
    return () => lease.release()
  } } })
createRoot(document.getElementById('root')!).render(<Harness />)
