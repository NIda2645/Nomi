import { storyboardAuthorFieldsSchema } from '../shared/agentCapabilities/generationPlanSchemas'
import { editorialFromDraftSubjects, presentStoryboardAuthoring } from '../capabilityCore/mcpGenerationMultiShot'
import { expect, it } from 'vitest'
import { generationDraftFromStoryboard, storyboardPlanFromGeneration, storyboardContentToken, storyboardReferenceSlot, patchStoryboardSubject } from '../shared/storyboard/generationPlanEditorial'
import { validPromptSkeletonSegments } from '../../src/workbench/creation/storyboard/shotRow/promptSkeletonRangeUtils'
import type { StoryboardPlan } from '../shared/storyboard/storyboardPlan'
import { draftShotToCandidatePatch } from '../shared/agentCapabilities/verbs/draftShotsProjection'
import { projectShotNode } from '../../src/workbench/creation/storyboard/exec/storyboardProjection'
import type { GenerationCanvasNode } from '../../src/workbench/generationCanvas/model/generationCanvasTypes'
import { saveStoryboardAuthoring } from './productionStoryboardAuthoring'
import type { ProductionRun, ProductionGenerationPlan } from './productionRunTypes'
const candidate = {candidateId:'s',revision:1,moduleId:'image-module',providerId:'vendor',modelId:'image-model',mode:'text_to_image',prompt:'original',parameters:{quality:'high'},references:[{assetId:'asset',contentHash:'hash',version:1,kind:'image' as const}]}
const plan: ProductionGenerationPlan = {operationId:'run',state:'draft',candidate,nodeId:'existing-node',updatedAt:'now'}
it('F03 title-only editing preserves the single candidate reference identity and binding', () => {
  const editor = storyboardPlanFromGeneration({generationPlan:plan},{asset:'nomi-local://asset'})
  const saved = generationDraftFromStoryboard({...editor,title:'renamed'},plan)
  expect(saved.candidate.references).toEqual(candidate.references)
  expect(saved.nodeId).toBe('existing-node')
})
it('F04 changing media/model does not retain the incompatible previous execution identity', () => {
  const source = {...plan,shots:[{shotId:'s',candidate,updatedAt:'now'}]}
  const editor = storyboardPlanFromGeneration({generationPlan:source},{asset:'nomi-local://asset'})
  const saved = generationDraftFromStoryboard({...editor,shots:editor.shots.map(shot=>({...shot,shotKind:'video',modelKey:'video-model'}))},source)
  expect(storyboardPlanFromGeneration({generationPlan:saved}).shots[0]).toMatchObject({shotKind:'video',modelKey:'video-model'})
  expect(saved.shots?.[0].candidate).toEqual(candidate)
})
it('F02 an admitted Agent anchor envelope remains readable in the original plan editor', () => {
  const source = {...plan,shots:[{shotId:'anchor',role:'anchor' as const,title:'Character',candidate,updatedAt:'now'}]}
  const editorial=editorialFromDraftSubjects([{...source.shots[0],title:'Room',storyboard:{kind:'scene',carrier:'text'}}],'project',()=> 'nomi-local://asset')
  expect(storyboardPlanFromGeneration({generationPlan:{...source,editorial}}).anchors[0]).toMatchObject({kind:'scene',carrier:'text',name:'Room'})
  expect(()=>editorialFromDraftSubjects(source.shots,'project',()=> 'nomi-local://asset')).toThrow(/editorial_required/)
})
it('F05 editing submitted author content preserves its frozen execution and active jobs', () => {
  const editor = storyboardPlanFromGeneration({generationPlan:plan},{asset:'nomi-local://asset'})
  const run = {projectId:'project',runId:'run',origin:{host:'nomi',sourceDocument:{documentId:'doc',revision:1,contentHash:'source'}},
    generationPlan:{...plan,state:'submitted',contract:{contractHash:'sealed'},authorizationDigest:'approved'},jobs:[{jobId:'active'}],gates:[{gateId:'approved'}]} as unknown as ProductionRun
  const saved = saveStoryboardAuthoring(run,{commandId:'save',expectedRevision:0,type:'generation.save_storyboard',issuedAt:'now',payload:{projectId:'project',runId:'run',operationId:'run',sourceDocumentId:'doc',sourceDocumentRevision:1,sourceDocumentHash:'source',expectedContentToken:storyboardContentToken(run),plan:{...editor,title:'edited while running'}}},'later')
  expect(saved.authoring?.title).toBe('edited while running')
  expect(saved.generationPlan?.contract).toEqual(run.generationPlan?.contract)
  expect(saved.jobs).toEqual(run.jobs)
  expect(saved.gates).toEqual(run.gates)
})

it('content token ignores execution revision, node binding and active payment selection', () => {
  const first = {...plan,shots:[{shotId:'s',candidate,updatedAt:'now',included:true}]}
  const second = {...first,shots:[{...first.shots[0],candidate:{...candidate,revision:99},nodeId:'later',included:false,updatedAt:'later'}]}
  expect(storyboardContentToken({generationPlan:second})).toBe(storyboardContentToken({generationPlan:first}))
  expect(storyboardContentToken({generationPlan:{...second,shots:[{...second.shots[0],candidate:{...candidate,prompt:'changed'}}]}})).not.toBe(storyboardContentToken({generationPlan:first}))
})
it('content token ignores JSON object key insertion order but includes reference and title edits', () => {
  const one = {generationPlan:{...plan,candidate:{...candidate,parameters:{quality:'high',size:2}}}}
  const two = {generationPlan:{...plan,candidate:{...candidate,parameters:{size:2,quality:'high'}}}}
  expect(storyboardContentToken(one)).toBe(storyboardContentToken(two))
  expect(storyboardContentToken({...one,authoring:{title:'new'}})).not.toBe(storyboardContentToken(one))
  expect(storyboardContentToken({generationPlan:{...plan,candidate:{...candidate,references:[]}}})).not.toBe(storyboardContentToken({generationPlan:plan}))
})

it('Agent present routes exact authored scope and never claims payment from renderer completion', async () => {
  const editorial={title:'edited',anchors:[],shots:[{shotId:'s',index:1,prompt:'new author prompt',durationSec:0,anchorIds:[]}]}
  const current={...plan,editorial,sourceDocumentId:'doc'}
  let payload:unknown
  const result=await presentStoryboardAuthoring(current,'project','run',['s'],async (_op,value)=>{payload=value;return {status:'presented',runId:'run',shotIds:['s']}})
  expect(payload).toEqual({projectId:'project',runId:'run',sourceDocumentId:'doc',expectedContentToken:storyboardContentToken({generationPlan:current}),shotIds:['s']})
  expect(result).toMatchObject({status:'presented',nextAction:'inspect_canvas'})
  await expect(presentStoryboardAuthoring(current,'project','run',['missing'],async()=>({}))).rejects.toThrow(/scope_invalid/)
  await expect(presentStoryboardAuthoring(current,'project','run',['s'],async()=>({status:'presented',runId:'other',shotIds:['s']}))).rejects.toThrow(/receipt_mismatch/)
})
it('Agent producer rejects conflicting author/model facts and retains exact reference roles', () => {
  const subject={shotId:'s',candidate}
  for (const facts of [{prompt:'conflict'}, {shotKind:'video'}, {shotKind:'image'}]) {
    expect(()=>storyboardAuthorFieldsSchema.parse(facts)).toThrow()
  }
  const editorial=editorialFromDraftSubjects([{...subject,candidate:{...candidate,references:[{...candidate.references[0],role:'first_frame'}]}}],'project',()=> 'nomi-local://asset')
  expect(editorial.shots[0].referenceBindings).toEqual({first_frame:[{url:'nomi-local://asset'}]})
})

it('create and patch share original slot vocabulary for every admitted reference role',()=>{
  for (const [role,kind,slot] of [['first_frame','image','first_frame'],['last_frame','image','last_frame'],['character','image','image_ref'],['audio','audio','audio_ref'],['reference','video','video_ref'],[undefined,'image','image_ref']] as const) {
    expect(storyboardReferenceSlot({...candidate.references[0],role,kind})).toBe(slot)
  }
  expect(()=>storyboardReferenceSlot({...candidate.references[0],role:'unknown' as never})).toThrow(/role_invalid/)
})
it('legacy candidate references remain visible with indexed preview URLs and never disappear silently',()=>{
  const source={generationPlan:plan}
  const restored=storyboardPlanFromGeneration(source,{asset:'nomi-local://legacy'})
  expect(restored.shots[0].referenceBindings).toEqual({image_ref:[{url:'nomi-local://legacy'}]})
  expect(()=>storyboardPlanFromGeneration(source)).toThrow(/preview_unavailable/)
})


it('compact original author fields survive create, save, reopen and partial keyframe edits',()=>{
  const storyboard=storyboardAuthorFieldsSchema.parse({sceneId:'scene',durationSec:3,anchorIds:['anchor'],
    promptSegments:[{key:'subject',start:0,end:8}],variationType:'small',camIdx:2,ffDesc:'first',lfDesc:'last',motionDesc:'pan',
    continuity:{nested:{value:['same',2,null]}},referenceBindings:{first_frame:[{url:'nomi-local://first',anchorId:'anchor',ignore:'hat'}]},
    keyframe:{enabled:true,prompt:'first image',modelKey:'frame-model',modelVendor:'vendor',modeId:'edit',params:{quality:'high',nested:{refs:[1,true]}}}})
  const editorial=editorialFromDraftSubjects([{shotId:'s',candidate:{...candidate,references:[]},storyboard}],'project')
  const reopened=storyboardPlanFromGeneration({generationPlan:generationDraftFromStoryboard(editorial,plan)})
  expect(reopened.shots[0]).toMatchObject({...storyboard,shotKind:'image'})
  const patched=patchStoryboardSubject(reopened,'s',{storyboard:{keyframe:{prompt:'new frame',params:{quality:'low'}}}})
  expect(patched).toMatchObject({...storyboard,keyframe:{...storyboard.keyframe,prompt:'new frame',params:{quality:'low',nested:{refs:[1,true]}}}})
  expect(()=>patchStoryboardSubject(reopened,'s',{storyboard:{kind:'scene'}})).toThrow()
  const anchor={kind:'character' as const,carrier:'visual' as const,staticFeatures:'round face',dynamicFeatures:'red coat',scope:'selective' as const,variants:['winter'],referenceUrl:'nomi-local://anchor',referenceKind:'image' as const,referenceSourceNodeId:'node'}
  const anchored=editorialFromDraftSubjects([{shotId:'a',role:'anchor',title:'Hero',candidate:{...candidate,references:[]},storyboard:anchor}],'project')
  expect(storyboardPlanFromGeneration({generationPlan:generationDraftFromStoryboard(anchored,plan)}).anchors[0]).toMatchObject(anchor)
  expect(()=>patchStoryboardSubject(anchored,'a',{storyboard:{sceneId:'wrong-role'}})).toThrow()
})

it('Agent prompt replacement invalidates old skeleton offsets before the original editor renders them', () => {
  const ranges = [{ key: 'shotSize', start: 0, end: 2 }]
  const editorial: StoryboardPlan = { title: 'Original plan', anchors: [],
    shots: [{ shotId: 's', index: 1, prompt: '远景，女孩走进书店', durationSec: 3, anchorIds: [], promptSegments: ranges }] }
  const patched = patchStoryboardSubject(editorial, 's', { prompt: '女孩走进书店，镜头由远及近' })
  expect(patched).toMatchObject({ prompt: '女孩走进书店，镜头由远及近', durationSec: 3, anchorIds: [] })
  expect('promptSegments' in patched ? patched.promptSegments : undefined).toBeUndefined()
  const profile = { aspect: '16:9', dialogue: false,
    promptSkeleton: [{ key: 'shotSize', label: '景别', kind: 'enum' as const, options: ['远景', '近景'] }] }
  expect(validPromptSkeletonSegments('prompt' in patched ? patched.prompt : '', profile,
    'promptSegments' in patched ? patched.promptSegments : undefined)).toEqual([])
  expect(editorial.shots[0].promptSegments).toEqual(ranges)
})

it('Agent editorial patches retain valid skeleton ranges for unchanged text and honor explicit replacement ranges', () => {
  const ranges = [{ key: 'shotSize', start: 0, end: 2 }]
  const editorial: StoryboardPlan = { title: 'Original plan', anchors: [],
    shots: [{ shotId: 's', index: 1, prompt: '远景，女孩', durationSec: 3, anchorIds: [], promptSegments: ranges }] }
  for (const patch of [{ prompt: '远景，女孩' }, { modelId: 'other-model' }, { storyboard: { keyframe: { prompt: 'frame' } } }]) {
    expect(patchStoryboardSubject(editorial, 's', patch)).toMatchObject({ promptSegments: ranges })
  }
  const newRanges = [{ key: 'shotSize', start: 3, end: 5 }]
  expect(patchStoryboardSubject(editorial, 's', { prompt: '女孩，近景', storyboard: { promptSegments: newRanges } }))
    .toMatchObject({ promptSegments: newRanges })
  expect(patchStoryboardSubject(editorial, 's', { prompt: '女孩', storyboard: { promptSegments: [] } }))
    .toMatchObject({ promptSegments: [] })
})

it('Agent duration patches reach the original shot duration owner and node projection', () => {
  const editorial: StoryboardPlan = { title: 'Original plan', anchors: [],
    shots: [{ shotId: 's', index: 1, shotKind: 'video', prompt: 'video', durationSec: 5, anchorIds: [],
      params: { duration: 5, resolution: '1080p', aspect_ratio: '16:9' } }] }
  const patch = draftShotToCandidatePatch({ shotId: 's', prompt: 'video', durationSec: 8 })
  const patched = patchStoryboardSubject(editorial, 's', patch)
  expect(patched).toMatchObject({ durationSec: 8, params: { duration: 8 } })
  expect(patched.params).toEqual({ duration: 8 }) // Existing parameter-map replacement contract stays unchanged.
  if (!('prompt' in patched)) throw new Error('Expected shot author body')
  const node: GenerationCanvasNode = { id: 'node', kind: 'video', categoryId: 'shots', title: 'Shot', prompt: 'video', position: { x: 0, y: 0 }, status: 'idle', meta: { duration: 5 } }
  expect(projectShotNode(editorial, patched, node, 'shot', new Map()).meta?.duration).toBe(8)
})

it('duration patches preserve explicit author precedence, omitted duration and anchor role boundaries', () => {
  const editorial: StoryboardPlan = { title: 'Original plan',
    anchors: [{ id: 'a', name: 'Hero', description: 'hero', kind: 'character', carrier: 'visual' }],
    shots: [{ shotId: 's', index: 1, shotKind: 'video', prompt: 'video', durationSec: 5, anchorIds: [] }] }
  expect(patchStoryboardSubject(editorial, 's', { parameters: { duration: 8 }, storyboard: { durationSec: 9 } }))
    .toMatchObject({ durationSec: 9, params: { duration: 8 } })
  const created = editorialFromDraftSubjects([{ shotId: 's', candidate: { ...candidate, mode: 'text_to_video',
    references: [], parameters: { duration: 8 } }, storyboard: { durationSec: 9 } }], 'project')
  expect(created.shots[0].durationSec).toBe(9)
  expect(patchStoryboardSubject(editorial, 's', { parameters: { resolution: '720p' } })).toMatchObject({ durationSec: 5 })
  const anchor = patchStoryboardSubject(editorial, 'a', { parameters: { duration: 8 } })
  expect(anchor).toMatchObject({ description: 'hero', params: { duration: 8 } })
  expect(anchor).not.toHaveProperty('durationSec')
})
