import React from 'react'
import { createRoot } from 'react-dom/client'
import { useCanvasSelectionDrag } from '../../../src/workbench/generationCanvas/components/useCanvasSelectionDrag'
import { useGenerationCanvasStore as store } from '../../../src/workbench/generationCanvas/store/generationCanvasStore'
import { setCanvasEventSinkForTests, type CanvasShadowEvent } from '../../../src/workbench/generationCanvas/events/canvasEventEmitter'
import { createProjectSessionTestHarness } from '../../../src/workbench/project/projectSessionTestHarness'

const session = createProjectSessionTestHarness()
await session.open('original-project')
const events: CanvasShadowEvent[] = []
setCanvasEventSinkForTests(batch => events.push(...batch))
function restoreGraph() {
  store.getState().restoreSnapshot({
    nodes: ['one', 'two'].map((id, index) => ({ id, kind: 'image', title: id, prompt: id, categoryId: 'shots', groupId: 'group', position: { x: 10 + index * 50, y: 20 } })),
    edges: [], groups: [{ id: 'group', name: 'group', categoryId: 'shots', nodeIds: ['one', 'two'], createdAt: 1, updatedAt: 1, frameBounds: { x: 0, y: 0, w: 100, h: 100 } }],
  })
  store.getState().selectNodes(['one', 'two'])
}
restoreGraph()
let changeReadOnly: (value: boolean) => void
function Harness() {
  const [readOnly, setReadOnly] = React.useState(false)
  changeReadOnly = setReadOnly
  const state = store.getState()
  const actions = useCanvasSelectionDrag({ readOnly, selectedNodeCount: 2, zoomRef: React.useRef(1),
    captureHistory: state.captureHistory, commitPersistedChange: state.commitPersistedChange,
    moveGroupNodes: state.moveGroupNodes, moveSelectedNodes: state.moveSelectedNodes, selectNodes: state.selectNodes })
  return <div className="generation-canvas-v2__stage" id="stage">
    <div id="group" onPointerDown={event => actions.handleGroupFramePointerDown(event, 'group')}>Group</div>
    <div id="selection" onPointerDown={actions.handleSelectionBoundsPointerDown}>Selection</div>
  </div>
}
const root = createRoot(document.querySelector('#root')!)
root.render(<Harness />)
Object.assign(window, { selectionDragFixture: {
  snapshot: () => ({ nodes: store.getState().nodes, groups: store.getState().groups,
    revision: store.getState().persistRevision, events: [...events], dragging: document.querySelector('#stage')?.getAttribute('data-dragging') ?? null }),
  unmount: () => root.unmount(), readOnly: () => changeReadOnly(true),
  replaceGraph: restoreGraph,
  invalidateProject: () => session.close(),
  switchProject: async () => { await session.open('replacement-project'); restoreGraph() },
  undo: () => store.getState().undo(), redo: () => store.getState().redo(),
} })
