// Controlled bridge boundary; real editor, projection, draft buffer and save reducer.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { NomiPreviewHost } from '../../../src/design/previewHost'
import StoryboardPlanEditor from '../../../src/workbench/creation/storyboard/StoryboardPlanEditor'
import { useStoryboardRunHost } from '../../../src/workbench/creation/storyboard/useStoryboardRunHost'
import { productionRunApi } from '../../../src/workbench/production/productionRunApi'
import { saveStoryboardAuthoring } from '../../../electron/productionRun/productionStoryboardAuthoring'
import type { ProductionRun } from '../../../electron/productionRun/productionRunTypes'
import { useWorkbenchStore } from '../../../src/workbench/workbenchStore'
import '@mantine/core/styles.css'
import { seedModelCatalogForTests } from '../../../src/config/modelCatalogCache'
import type { ModelOption } from '../../../src/config/models'
const query = new URLSearchParams(location.search)
const mediaKind = query.get('media') === 'video' ? 'video' : 'image'
const imageOption: ModelOption = { value: 'agent-runtime-image', modelKey: 'agent-runtime-image', vendor: 'agent-runtime-loopback', label: 'Fixture 图片', kind: 'image', meta: { archetypeId: 'agnes-image' } }
const videoOption: ModelOption = { value: 'pf-video', modelKey: 'pf-video', vendor: 'agent-runtime-loopback', label: 'Fixture 视频', kind: 'video', meta: { archetypeId: 'wan-2.7' } }
seedModelCatalogForTests({ ok: true, counts: { vendors: 1, enabledVendors: 1, models: 2, enabledModels: 2, mappings: 4, enabledMappings: 4, enabledApiKeys: 0 }, byKind: [], issues: [] }, [
  { kind: 'image', requiredMode: 'text_to_image', options: [imageOption] },
  { kind: 'image', requiredMode: 'image_edit', options: [imageOption] },
  { kind: 'video', requiredMode: 'text_to_video', options: [videoOption] },
])
const runs = new Map<string, ProductionRun>()
for (const id of ['a', 'b']) {
  const candidate = { candidateId: `shot-${id}`, revision: 1, moduleId: 'generation.single-shot', providerId: 'agent-runtime-loopback', modelId: mediaKind === 'video' ? videoOption.modelKey! : imageOption.modelKey!, mode: mediaKind === 'video' ? 'text_to_video' : 'text_to_image', prompt: `Prompt ${id}`, parameters: mediaKind === 'video' ? { duration: 5, resolution: '720p' } : { size: '1024x1024' }, references: [] }
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
function Fixture() { const [id, setId] = React.useState('a'); return <><button onClick={() => setId('a')}>Plan A</button><button onClick={() => setId('b')}>Plan B</button><div style={{ height: 800 }}><Editor key={id} id={id} /></div></> }
createRoot(document.getElementById('root')!).render(<NomiPreviewHost locale={query.get('locale') || 'zh-CN'}><Fixture /></NomiPreviewHost>)
