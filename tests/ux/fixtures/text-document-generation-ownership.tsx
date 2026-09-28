// Original text editor, generation action and graph schema. Only the supplier is controlled.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { NomiPreviewHost } from '../../../src/design/previewHost'
import TextDocumentNode from '../../../src/workbench/generationCanvas/nodes/render/TextDocumentNode'
import { useGenerationCanvasStore } from '../../../src/workbench/generationCanvas/store/generationCanvasStore'
import { generationCanvasSnapshotSchema } from '../../../src/workbench/generationCanvas/model/generationCanvasSchema'
import { createProjectSessionTestHarness } from '../../../src/workbench/project/projectSessionTestHarness'
import { generateText, docToPlainText } from '../../../src/workbench/generationCanvas/runner/textActions'
import { captureApprovedGenerationInputs } from '../../../src/workbench/generationCanvas/runner/runProjectDelivery'
import '@mantine/core/styles.css'

const session = createProjectSessionTestHarness()
const target = await session.open('rewrite-review')
const store = useGenerationCanvasStore.getState()
store.restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] })
const text = store.addNode({ kind: 'text', prompt: 'rewrite selected phrase' })
const image = store.addNode({ kind: 'image', prompt: 'illustrate text' })
store.updateNode(text.id, {
  contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep OLD tail' }] }] },
  meta: { modelVendor: 'v', modelKey: 'm', textGenMode: 'rewrite' },
})
store.connectNodes(text.id, image.id, 'reference')
let beforeApplyRevision = -1
let mount = 0
let savedGraph = ''
let check: ReturnType<typeof captureApprovedGenerationInputs>
// Observe the same persisted-change boundary as project saving; JSON/schema round trip is controlled storage.
useGenerationCanvasStore.subscribe((state, previous) => {
  if (state.persistRevision === previous.persistRevision) return
  savedGraph = JSON.stringify(generationCanvasSnapshotSchema.parse(state))
})

function snapshot() {
  const state = useGenerationCanvasStore.getState()
  const node = state.nodes.find(candidate => candidate.id === text.id)!
  return {
    persistRevision: state.persistRevision, beforeApplyRevision,
    text: docToPlainText(node.contentJson), selection: node.meta?.textGenSelection,
    pending: node.meta?.textPendingSelectionApply, result: node.result,
    appliedRun: node.runs?.find(run => run.resultId === node.result?.id),
  }
}

Object.assign(window, { textOwnership: {
  snapshot,
  prepare() {
    check = captureApprovedGenerationInputs([text.id, image.id])
    useGenerationCanvasStore.getState().appendNodeRun(text.id, {
      id: 'approved-text-run', status: 'queued', projectId: target.projectId, startedAt: 1, updatedAt: 1,
    })
    check(useGenerationCanvasStore.getState(), text.id)
  },
  async generate() {
    const node = useGenerationCanvasStore.getState().nodes.find(candidate => candidate.id === text.id)!
    const result = await generateText(node, {
      projectTarget: target,
      runTask: async () => ({
        id: 'rewrite-task', kind: 'chat', status: 'succeeded', assets: [],
        raw: { choices: [{ message: { content: 'NEW' } }] },
      }),
    })
    useGenerationCanvasStore.getState().addNodeResult(text.id, result)
    beforeApplyRevision = useGenerationCanvasStore.getState().persistRevision
  },
  reopen() {
    const saved = generationCanvasSnapshotSchema.parse(JSON.parse(savedGraph))
    useGenerationCanvasStore.getState().restoreSnapshot(saved)
    mount += 1
    root.render(<App key={mount} />)
  },
  validate() {
    try { check(useGenerationCanvasStore.getState(), image.id); return { accepted: true } }
    catch (error) { return { accepted: false, error: String(error) } }
  },
} })

function App() {
  const node = useGenerationCanvasStore(state => state.nodes.find(candidate => candidate.id === text.id)!)
  return <NomiPreviewHost><div style={{ width: 600, height: 400 }}><TextDocumentNode node={node} /></div></NomiPreviewHost>
}
const root = createRoot(document.getElementById('root')!)
root.render(<App />)
