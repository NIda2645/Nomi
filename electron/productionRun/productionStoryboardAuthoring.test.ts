import { storyboardPlanFromGeneration, storyboardContentToken } from '../shared/storyboard/generationPlanEditorial'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createProductionRunRepository } from './productionRunRepository'
import type { ProductionRun, RunCommand } from './productionRunTypes'
import { applyProductionCommand } from './productionRunReducer'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-storyboard-save-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })
const repo = () => createProductionRunRepository({ projectDirResolver: id => id === 'project' ? root : null })
const candidate = (id: string) => ({ candidateId: id, revision: 1, moduleId: 'generation.single-shot', providerId: 'fixture', modelId: 'fixture', mode: 'image', prompt: id, parameters: {}, references: [] })
function create(runId = 'run-a', documentId = 'doc-a') {
  const origin: ProductionRun['origin'] = { host: 'nomi', sourceDocument: { documentId, revision: 3, contentHash: 'hash' } }
  return repo().createGenerationDraft({ projectId: 'project', operationId: runId, origin, candidate: candidate('s1'), shots: ['s1', 's2'].map(shotId => ({ shotId, candidate: candidate(shotId) })) })
}
function command(patch: Partial<RunCommand> = {}): RunCommand {
  return { commandId: crypto.randomUUID(), expectedRevision: 0, type: 'generation.save_storyboard', issuedAt: new Date().toISOString(),
    payload: { projectId: 'project', runId: 'run-a', operationId: 'run-a', sourceDocumentId: 'doc-a', sourceDocumentRevision: 3, sourceDocumentHash: 'hash', expectedContentToken: storyboardContentToken(repo().read('project', 'run-a')!), plan: { title: 'Plan A', anchors: [], shots: [{ shotId: 's1', index: 1, durationSec: 3, anchorIds: [], prompt: 'First edited' }, { shotId: 's2', index: 2, durationSec: 3, anchorIds: [], prompt: 'Second edited' }] } }, ...patch }
}

it('saves complete original author content without rewriting execution and survives restart', () => {
  const original = create(); create('run-b', 'doc-b')
  const save = command()
  const saved = repo().execute('project', 'run-a', save).run
  expect(saved.generationPlan?.candidate).toEqual(original.generationPlan?.candidate)
  expect(saved.generationPlan?.shots).toEqual(original.generationPlan?.shots)
  expect(storyboardPlanFromGeneration(repo().read('project', 'run-a')!)).toEqual(save.payload.plan)
  expect(repo().read('project', 'run-b')?.generationPlan?.editorial).toBeUndefined()
})
it('content CAS permits execution-only revision changes but rejects concurrent author edits', () => {
  create()
  const initial = command()
  repo().execute('project', 'run-a', { commandId: 'progress', expectedRevision: 0, type: 'run.status', payload: {status:'running'}, issuedAt:'now' })
  const saved = repo().execute('project', 'run-a', initial).run
  expect(saved.revision).toBe(2)
  expect(() => repo().execute('project', 'run-a', {...initial, commandId:'stale'})).toThrow(/content_conflict/)
  expect(repo().read('project', 'run-a')).toEqual(saved)
})
it('validates exact target and source identity independently from content CAS', () => {
  const original = create()
  for (const patch of [{projectId:'other'}, {runId:'other'}, {operationId:'other'}, {sourceDocumentId:'other'}, {sourceDocumentRevision:4}, {sourceDocumentHash:'other'}]) {
    const base = command()
    expect(() => repo().execute('project', 'run-a', {...base,payload:{...base.payload,...patch}})).toThrow(/mismatch/)
  }
  expect(repo().read('project', 'run-a')).toEqual(original)
})
it('roundtrips original anchor, keyframe, reference, model and scene fields', () => {
  create()
  const plan = { title:'Full editor',aspectRatio:'16:9',scenes:[{id:'scene',title:'Room'}],
    anchors:[{id:'anchor',kind:'character',carrier:'text',name:'Ada',description:'Identity',variants:['young']}],
    shots:[{shotId:'s2',index:1,prompt:'Movement',shotKind:'video',durationSec:5,anchorIds:['anchor'],sceneId:'scene',modelKey:'chosen',modelVendor:'vendor',params:{nested:{keep:true}},referenceBindings:{first_frame:[{url:'asset://image',ignore:'coat'}]},ffDesc:'first',keyframe:{enabled:true,prompt:'frame'}}] }
  const base=command()
  const saved=repo().execute('project','run-a',{...base,payload:{...base.payload,plan}}).run
  expect(storyboardPlanFromGeneration(saved)).toEqual(plan)
  expect(saved.generationPlan?.editorial).toEqual(plan)
})
it('persists intentionally empty author content and rejects duplicate stable identities', () => {
  create()
  const base=command()
  const saved=repo().execute('project','run-a',{...base,payload:{...base.payload,plan:{title:'',anchors:[],shots:[]}}}).run
  expect(storyboardPlanFromGeneration(saved)).toEqual({title:'',anchors:[],shots:[]})
  const next=command()
  const shot={shotId:'same',index:1,durationSec:0,anchorIds:[],prompt:'x'}
  expect(()=>repo().execute('project','run-a',{...next,payload:{...next.payload,plan:{title:'',anchors:[],shots:[shot,shot]}}})).toThrow(/duplicate/)
})
it('author save preserves submitted candidates, contracts and job authorization identity', () => {
  const run=create()
  const active={...run,generationPlan:{...run.generationPlan!,state:'submitted' as const,authorizationDigest:'digest'},jobs:run.jobs}
  const saved=applyProductionCommand(active,command(), 'later').run
  expect(saved.generationPlan?.candidate).toEqual(active.generationPlan?.candidate)
  expect(saved.generationPlan?.authorizationDigest).toBe('digest')
  expect(saved.generationPlan?.state).toBe('submitted')
  expect(saved.jobs).toEqual(active.jobs)
})
it('editing a waiting quote revokes it while preserving the execution snapshot as hidden draft', () => {
  const run=create()
  const active={...run,generationPlan:{...run.generationPlan!,state:'sealed' as const,authorizationDigest:'digest',authorizationGateId:'gate'},
    gates:[{gateId:'gate',status:'waiting',kind:'spend',createdAt:'now'}],jobs:[]} as unknown as ProductionRun
  const saved=applyProductionCommand(active,command(),'later').run
  expect(saved.gates[0].status).toBe('revoked')
  expect(saved.generationPlan?.cardHidden).toBe(true)
  expect(saved.generationPlan?.authorizationDigest).toBeUndefined()
  expect(saved.generationPlan?.state).toBe('draft')
})

it('preserves a real sealed contract and authorization envelope when approved execution is already running', async () => {
  const {compileExecutionContract}=await import('../capabilityCore/executionContract')
  const {createModuleRegistry}=await import('../capabilityCore/moduleRegistry')
  const {prepareProductionGenerationAuthorization}=await import('./prepareProductionGenerationAuthorization')
  const run=create()
  const registry=createModuleRegistry([{moduleId:'generation.single-shot',version:'1',inputKinds:['text'],outputKinds:['image'],modes:['image'],parameterSchema:{},assetInputSchema:{references:{kind:'image',max:4}},providers:[{providerId:'fixture',models:[{modelId:'fixture',modes:['image'],parameterSchema:{},capabilities:{submitIdempotency:true,query:true,reconcile:true,cancel:true}}]}]}])
  const shots=run.generationPlan!.shots!.map(shot=>{const contract=compileExecutionContract(shot.candidate,registry);return {...shot,contract,candidate:{...shot.candidate,sealedContractHash:contract.contractHash}}})
  const contract=shots[0].contract
  const authorization=prepareProductionGenerationAuthorization({
    lease:{projectId:'project',immutableProjectUuid:'uuid',projectGeneration:1,revocationEpoch:0},projectRevision:0,
    operation:{operationId:'run-a',projectId:'project',candidate:run.generationPlan!.candidate,planVersion:1},contract,
    multiShot:{shots,planHash:'hash'},providers:[{providerId:'fixture',capabilities:{submitIdempotency:true,query:true,reconcile:true,cancel:true},buildRequest:input=>input,submit:async()=>({providerTaskId:'unused'})}],resolveShotPrice:()=>({known:true,amount:0.3}),now:'2026-09-20T00:00:00.000Z',
  })
  const sealed=applyProductionCommand(run,{commandId:'seal',expectedRevision:0,type:'generation.seal',payload:{contract,shots,planHash:'hash',authorization},issuedAt:'now'},'now').run
  const active={...sealed,generationPlan:{...sealed.generationPlan!,state:'submitted' as const},gates:sealed.gates.map(gate=>({...gate,status:'approved' as const})),jobs:sealed.jobs.map(job=>({...job,status:'polling' as const}))}
  const base=command()
  const saved=applyProductionCommand(active,{...base,payload:{...base.payload,expectedContentToken:storyboardContentToken(active)}},'later').run
  expect(saved.generationPlan?.contract).toEqual(contract)
  expect(saved.generationPlan?.authorizationEnvelope).toEqual(active.generationPlan?.authorizationEnvelope)
  expect(saved.generationPlan?.shots).toEqual(active.generationPlan?.shots)
  expect(saved.jobs.length).toBeGreaterThan(0)
  expect(saved.jobs).toEqual(active.jobs)
  expect(saved.gates).toEqual(active.gates)
})

it('Agent patch reuses save CAS and the same author body without changing its execution candidate', async () => {
  const {createProductionGenerationOperationStore}=await import('./productionGenerationOperationStore')
  const {createProductionRunService}=await import('./productionRunService')
  create()
  const saved=repo().execute('project','run-a',command()).run
  const service=createProductionRunService({repository:repo(),projectRootResolver:()=>root,sleep:async()=>{}})
  const operations=createProductionGenerationOperationStore(service)
  const subject={...saved.generationPlan!.editorial!.shots[0],prompt:'Agent edited'}
  const edited=await operations.patch('project','run-a',{storyboard:subject},'later','s1')
  expect(edited.editorial?.shots[0].prompt).toBe('Agent edited')
  expect(edited.candidate).toEqual(saved.generationPlan?.candidate)
  expect(repo().read('project','run-a')?.generationPlan?.editorial).toEqual(edited.editorial)
})
