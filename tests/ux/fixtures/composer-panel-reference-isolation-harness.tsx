// Deliberately isolated browser store; no project is opened and all canvas writers are probes.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { useGenerationCanvasStore } from '../../../src/workbench/generationCanvas/store/generationCanvasStore'
import { NodeWriteAccessProvider } from '../../../src/workbench/generationCanvas/nodes/nodeWriteAccess'
import { useNodeAssetDrop } from '../../../src/workbench/generationCanvas/nodes/useNodeAssetDrop'
import { useNodeMentionSource } from '../../../src/workbench/generationCanvas/nodes/useNodeMentionSource'
import type { GenerationCanvasNode } from '../../../src/workbench/generationCanvas/model/generationCanvasTypes'
const target: GenerationCanvasNode = { id: 'repro-target', kind: 'video', title: 'isolated fixture', position: { x: 0, y: 0 }, meta: { modelKey: 'seedance-2', archetype: { id: 'seedance-2', modeId: 'omni' } } }
const source: GenerationCanvasNode = { id: 'repro-source', kind: 'image', title: 'source', position: { x: 0, y: 0 }, result: { type: 'image', url: 'nomi-local://asset/repro/source.png' } }
const calls = { canvasUpdates: 0, canvasConnections: 0, cardUpdates: 0 }
useGenerationCanvasStore.setState({ nodes: [source, target], edges: [], updateNode: () => { calls.canvasUpdates++ }, connectNodes: () => { calls.canvasConnections++ } })
const cardAccess = { updateNode: () => { calls.cardUpdates++ }, latestNode: () => target }
function PanelReferences() {
  const drop = useNodeAssetDrop(target, () => {})
  const mention = useNodeMentionSource(target, [], () => {})
  return <>
    <button id="drop" onClick={() => {
      void drop.dropHandlers.onDrop({ preventDefault() {}, stopPropagation() {}, dataTransfer: { getData: () => JSON.stringify({ projectId: 'repro', relativePath: 'fixture.png', kind: 'image' }), files: [] } } as unknown as React.DragEvent<HTMLElement>)
    }}>drop</button>
    <button id="library" onClick={() => mention.onMentionSelect({ key: 'library:fixture', url: 'nomi-local://asset/repro/library.png', label: 'fixture', group: 'library', kind: 'image' })}>library mention</button>
    <button id="canvas" onClick={() => mention.onMentionSelect({ key: `canvas:${source.id}`, url: source.result!.url, label: 'fixture', group: 'canvas', kind: 'image' })}>canvas mention</button>
  </>
}
Object.assign(window, { panelReferenceRepro: calls })
createRoot(document.getElementById('root')!).render(<NodeWriteAccessProvider value={cardAccess}><PanelReferences /></NodeWriteAccessProvider>)
