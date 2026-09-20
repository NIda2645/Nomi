import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createProductionRunRepository } from './productionRunRepository'
import { createProductionRunService } from './productionRunService'
import { storyboardContentToken, storyboardPlanFromGeneration } from '../shared/storyboard/generationPlanEditorial'
import { runStoryboardBatch } from '../../src/workbench/creation/storyboard/exec/storyboardRowActions'
import { deriveStoryboardRowRuntimes } from '../../src/workbench/creation/storyboard/exec/storyboardRowStatus'
import { storyboardRunBindings } from '../../src/workbench/creation/storyboard/exec/storyboardNodeBinding'
import { useGenerationCanvasStore } from '../../src/workbench/generationCanvas/store/generationCanvasStore'
import { resetClientIdRegistry } from '../../src/workbench/generationCanvas/agent/applyCanvasToolCall'
import type { ProductionRun } from './productionRunTypes'
vi.mock('../../src/workbench/generationCanvas/agent/availableModels', async original => ({
  ...await original<typeof import('../../src/workbench/generationCanvas/agent/availableModels')>(),
  listAvailableModelsForAgent:async()=>[],resolveStoryboardImageDefault:async()=>({}),resolveStoryboardVideoDefault:async()=>({}),
}))
const dirs:string[]=[]
afterEach(()=>{for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true})})
beforeEach(()=>{resetClientIdRegistry();useGenerationCanvasStore.getState().restoreSnapshot({nodes:[],edges:[],groups:[]})})
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nomi-original-placement-'));dirs.push(dir)
  const repository=createProductionRunRepository({projectDirResolver:()=>dir})
  const candidate={candidateId:'s',revision:1,moduleId:'generation.single-shot',providerId:'fixture',modelId:'',mode:'image',prompt:'Original',parameters:{},references:[]}
  const run=repository.createGenerationDraft({projectId:'project',operationId:'run',origin:{host:'nomi',sourceDocument:{documentId:'doc',revision:1,contentHash:'hash'}},candidate})
  const requestRenderer=vi.fn()
  const service=createProductionRunService({repository,projectRootResolver:()=>dir,requestRenderer})
  const save=(current:ProductionRun,prompt:string)=>service.command('project','run',{commandId:crypto.randomUUID(),expectedRevision:current.revision,type:'generation.save_storyboard',issuedAt:'now',payload:{projectId:'project',runId:'run',operationId:'run',sourceDocumentId:'doc',sourceDocumentRevision:1,sourceDocumentHash:'hash',expectedContentToken:storyboardContentToken(current),plan:{title:'Plan',anchors:[],shots:[{shotId:'s',index:1,shotKind:'image',durationSec:0,anchorIds:[],prompt}]}}})
  const place=async(current:ProductionRun)=>{
    const plan=storyboardPlanFromGeneration(current)
    const bindings=storyboardRunBindings(current.generationPlan!,[])
    const rows=deriveStoryboardRowRuntimes({plan,designId:'run',nodes:useGenerationCanvasStore.getState().nodes,imageModelOptions:[],videoModelOptions:[],bindings})
    await runStoryboardBatch({documentId:'doc',designId:'run',plan,bindings},rows,{groupTitle:plan.title,placementOnly:true})
  }
  return {dir,repository,service,run,save,place,requestRenderer}
}
it('save is pure persistence; explicit original action creates once and survives canvas/repository reopen',async()=>{
  const f=fixture();const saved=(await f.save(f.run,'Author')).run
  expect(f.requestRenderer).not.toHaveBeenCalled();expect(useGenerationCanvasStore.getState().nodes).toHaveLength(0)
  await f.place(saved)
  const state=useGenerationCanvasStore.getState()
  const snapshot=structuredClone({nodes:state.nodes,edges:state.edges,groups:state.groups})
  expect(snapshot.nodes).toHaveLength(1)
  expect(snapshot.nodes[0].meta).toMatchObject({storyboardDesignId:'run',shotId:'s'})
  await f.place(saved);expect(useGenerationCanvasStore.getState().nodes.map(node=>node.id)).toEqual(snapshot.nodes.map(node=>node.id))
  resetClientIdRegistry();useGenerationCanvasStore.getState().restoreSnapshot(snapshot)
  const reopened=createProductionRunRepository({projectDirResolver:()=>f.dir}).read('project','run')!
  await f.place(reopened)
  expect(useGenerationCanvasStore.getState().nodes.map(node=>node.id)).toEqual(snapshot.nodes.map(node=>node.id))
  expect(reopened.jobs).toHaveLength(0);expect(reopened.budget.authorized).toBe(0)
})
it('saving and repeated placement preserve explicit canvas overrides',async()=>{
  const f=fixture();const saved=(await f.save(f.run,'Author')).run;await f.place(saved)
  const node=useGenerationCanvasStore.getState().nodes[0]
  useGenerationCanvasStore.getState().updateNode(node.id,{prompt:'Canvas override'})
  const changed=(await f.save(saved,'New author')).run
  expect(storyboardPlanFromGeneration(changed).shots[0].prompt).toBe('New author')
  expect(useGenerationCanvasStore.getState().nodes[0].prompt).toBe('Canvas override')
  await f.place(changed)
  expect(useGenerationCanvasStore.getState().nodes).toHaveLength(1)
  expect(useGenerationCanvasStore.getState().nodes[0].prompt).toBe('Canvas override')
  expect(f.requestRenderer).not.toHaveBeenCalled()
})
