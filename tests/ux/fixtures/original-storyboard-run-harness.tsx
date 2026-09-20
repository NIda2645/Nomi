// Controlled bridge boundary; real editor, projection, draft buffer and save reducer.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ConfirmDialogHost } from '../../../src/design'
import { NomiPreviewHost } from '../../../src/design/previewHost'
import StoryboardPlanEditor from '../../../src/workbench/creation/storyboard/StoryboardPlanEditor'
import { useStoryboardRunHost } from '../../../src/workbench/creation/storyboard/useStoryboardRunHost'
import { productionRunApi } from '../../../src/workbench/production/productionRunApi'
import { saveStoryboardAuthoring } from '../../../electron/productionRun/productionStoryboardAuthoring'
import type { ProductionRun } from '../../../electron/productionRun/productionRunTypes'
import { useGenerationCanvasStore } from '../../../src/workbench/generationCanvas/store/generationCanvasStore'
import { useWorkbenchStore } from '../../../src/workbench/workbenchStore'
import '@mantine/core/styles.css'
import type { ModelCatalogModelDto, ModelCatalogVendorDto, ModelCatalogHealthDto } from '../../../src/workbench/api/modelCatalogApi'
const query = new URLSearchParams(location.search)
const mediaKind = query.get('media') === 'video' ? 'video' : 'image'
const catalogModels: ModelCatalogModelDto[] = [
  { modelKey: 'agent-runtime-image', vendorKey: 'agent-runtime-loopback', labelZh: 'Fixture 图片', kind: 'image', meta: { archetypeId: 'agnes-image' }, enabled: true, published: true, publishedModes: ['text_to_image', 'image_edit'], availability: { usable: true }, createdAt: 'now', updatedAt: 'now' },
  { modelKey: 'pf-video', vendorKey: 'agent-runtime-loopback', labelZh: 'Fixture 视频', kind: 'video', meta: { archetypeId: 'wan-2.7' }, enabled: true, published: true, publishedModes: ['image_to_video'], availability: { usable: true }, createdAt: 'now', updatedAt: 'now' },
]
const catalogVendors: ModelCatalogVendorDto[] = [{ key: 'agent-runtime-loopback', name: 'Fixture', enabled: true, authType: 'none', createdAt: 'now', updatedAt: 'now' }]
const catalogHealth: ModelCatalogHealthDto = { ok: true, counts: { vendors: 1, enabledVendors: 1, models: 2, enabledModels: 2, mappings: 3, enabledMappings: 3, enabledApiKeys: 0 }, byKind: [], issues: [] }
Object.assign(window, { nomiDesktop: { modelCatalog: {
  listModels: (params?: { kind?: string; enabled?: boolean }) => structuredClone(catalogModels.filter(row => (!params?.kind || row.kind === params.kind) && (params?.enabled === undefined || row.enabled === params.enabled))),
  listVendors: () => structuredClone(catalogVendors),
  health: () => structuredClone(catalogHealth),
} } })
const runs = new Map<string, ProductionRun>()
for (const id of ['a', 'b']) {
  const candidate = { candidateId: `shot-${id}`, revision: 1, moduleId: 'generation.single-shot', providerId: 'agent-runtime-loopback', modelId: mediaKind === 'video' ? 'pf-video' : 'agent-runtime-image', mode: mediaKind === 'video' ? 'image_to_video' : 'text_to_image', prompt: `Prompt ${id}`, parameters: mediaKind === 'video' ? { duration: 5, resolution: '720p' } : { size: '1024x1024' }, references: [] }
  runs.set(id, { runId: id, projectId: 'project', revision: 0, authoring: { title: `Plan ${id}` }, origin: { host: 'nomi', sourceDocument: { documentId: 'doc', revision: 1, contentHash: 'hash' } },
    generationPlan: { operationId: id, state: 'draft', candidate, shots: [{ shotId: `shot-${id}`, candidate }], updatedAt: 'now' } } as ProductionRun)
}
let conflict = false
const calls: unknown[] = []
productionRunApi.read = async (_project, id) => structuredClone(runs.get(id)!)
productionRunApi.list = async () => []
productionRunApi.command = async (_project, id, command) => {
  calls.push(command)
  const run = runs.get(id)!
  if (conflict || command.expectedRevision !== run.revision) throw new Error('revision conflict')
  const saved = { ...saveStoryboardAuthoring(run, command, 'now'), revision: run.revision + 1 }
  runs.set(id, saved)
  return { run: structuredClone(saved) } as Awaited<ReturnType<typeof productionRunApi.command>>
}
useWorkbenchStore.getState().hydrateWorkbenchDocuments([{ id: 'doc', title: 'Script', version: 1, updatedAt: 1, contentJson: { type: 'doc', content: [] } }], 'doc')
Object.assign(window, { originalStoryboard: { calls, snapshot: () => Object.fromEntries(runs), conflict: () => { conflict = true }, recover: () => { conflict = false }, legacy: () => useWorkbenchStore.getState().storyboardDesignsByDocumentId } })
function Editor({ id }: { id: string }) { const host = useStoryboardRunHost('project', 'doc', id); return <StoryboardPlanEditor projectId="project" host={host} /> }
if (query.get('host') === 'legacy') {
  useWorkbenchStore.getState().setStoryboardPlan({ title: 'Legacy plan', anchors: [], shots: [{ index: 1, shotId: 'legacy-1', shotKind: 'image', prompt: 'Legacy prompt', anchorIds: [], durationSec: 3 }] }, 'doc')
}
if (query.has('confirm')) {
  const legacy = useWorkbenchStore.getState().storyboardDesignsByDocumentId.doc?.[0]
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [{ id: 'result-node', kind: 'image', title: 'Result', position: { x: 0, y: 0 }, categoryId: 'shots', status: 'success', result: { id: 'result', type: 'image', url: '/favicon.ico', createdAt: 1 }, meta: { storyboardDesignId: query.get('host') === 'legacy' ? legacy!.id : 'a', shotId: query.get('host') === 'legacy' ? 'legacy-1' : 'shot-a' } }], edges: [], groups: [] })
}
useWorkbenchStore.getState().setWorkspaceMode('storyboard')
function Fixture() {
  const [id, setId] = React.useState('a')
  const [hidden, setHidden] = React.useState(false)
  return <><button onClick={() => setId('a')}>Plan A</button><button onClick={() => setId('b')}>Plan B</button>
    {query.has('undo') ? <><button>Outside editor</button><input aria-label="Sibling text" /><button onClick={() => { setHidden(true); useWorkbenchStore.getState().setWorkspaceMode('generation') }}>Canvas sibling</button></> : null}
    <div style={{ height: 800 }} hidden={hidden}>{query.get('host') === 'legacy' ? <StoryboardPlanEditor projectId="project" /> : <Editor key={id} id={id} />}</div></>
}
createRoot(document.getElementById('root')!).render(<NomiPreviewHost locale={query.get('locale') || 'zh-CN'}><Fixture /><ConfirmDialogHost /></NomiPreviewHost>)
