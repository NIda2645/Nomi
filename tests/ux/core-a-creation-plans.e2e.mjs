// Real Electron + loopback Agent tool responses; original UI actions, isolated profile, zero paid media.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { require as tsxRequire } from 'tsx/cjs/api'
import { expect } from '@playwright/test'
import { expectAbsent, proveProbe } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { createAgentRuntimeFixture, FIXTURE_VENDOR, FIXTURE_TEXT_MODEL, FIXTURE_IMAGE_MODEL } from './agent-runtime-fixture.mjs'
import { waitForV4TurnIdle, recorded, sendCreation, readProject, AGENT_PANEL } from './agent-runtime-walk-support.mjs'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
const { createWorkspaceProject } = tsxRequire('../../electron/workspace/workspaceRepository.ts', import.meta.url)
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-core-a-creation-'))
const settingsDir = path.join(tempRoot, 'settings')
const projectsDir = path.join(tempRoot, 'projects')
const userDataDir = path.join(tempRoot, 'user-data')
const projectId = 'core-a-creation'
const projectRoot = path.join(projectsDir, projectId)
const shotsDir = path.join(repoRoot, 'tests/ux/shots/core-a-creation-plans')
fs.mkdirSync(shotsDir, { recursive: true })
fs.mkdirSync(settingsDir, { recursive: true })
const documents = ['a', 'b'].map(id => ({ id, version: 1, title: `Document ${id.toUpperCase()}`, updatedAt: 3, contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Story ${id}` }] }] } }))
createWorkspaceProject({ rootPath: projectRoot, record: { id: projectId, name: 'Core A creation acceptance', payload: { workbenchDocuments: documents, activeDocumentId: 'a', timeline: null, generationCanvas: { nodes: [], edges: [], groups: [], selectedNodeIds: [] } } } }, { settingsRoot: settingsDir, defaultProjectsRoot: projectsDir })
const fixture = await createAgentRuntimeFixture({rootDir:repoRoot,settingsDir})
const ids = {}
/**
 * Agent 产出的方案住在项目记录里，和用户手建的那种同一处。这条走查全程读它——
 * 读第二份存储，正是这次要消掉的东西。
 */
const designsOf = async (win, documentId) => (await readProject(win, projectId)).payload.storyboardDesignsByDocumentId?.[documentId] ?? []
const designById = async (win, designId) => {
  const payload = (await readProject(win, projectId)).payload
  return Object.values(payload.storyboardDesignsByDocumentId ?? {}).flat().find(design => design.id === designId)
}
const options = { name: 'core-a-creation-plans', tempRoot, settingsDir, projectsDir, userDataDir, initialLocalStorage: { 'nomi:locale:v1': 'zh-CN', 'nomi.assistantModel': JSON.stringify({vendorKey:FIXTURE_VENDOR,modelKey:FIXTURE_TEXT_MODEL}), '__nomiE2E': '1', 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen', 'nomi:canvas-gesture-hint:v1': 'seen' } }
let gui
let passed = 0
const check = (condition, message) => { assert(condition, message); passed++; console.log(`✓ ${message}`) }
const openProject = async win => {
  if (!win.url().includes(`projectId=${projectId}`)) await win.locator('[data-project-card]', { hasText: 'Core A creation acceptance' }).click()
  await win.getByRole('button', { name: /^(创作|Create)$/ }).click()
  const expandTree = win.locator('[data-creation-resource-tree-toggle="expand"]:visible')
  if (await expandTree.isVisible()) await expandTree.click()
  await expect(win.locator('[data-document-row="a"]')).toBeVisible()
  await expect(win.locator(`${AGENT_PANEL} [data-v4-panel="true"]`)).toBeVisible()
  const panelOffset = await win.locator(AGENT_PANEL).evaluate(shell => {
    const panel = shell.querySelector('[data-v4-panel="true"]')
    return panel.getBoundingClientRect().top - shell.getBoundingClientRect().top
  })
  assert.ok(panelOffset <= 1,`The original Agent panel must start at the top of its host; unexpected header displaced it by ${panelOffset}px`)
}
try {
  gui = await launchNomiApp(options)
  let win = gui.win
  await openProject(win)
  await win.screenshot({path:path.join(shotsDir,'zh-creation-agent-aligned.png')})
  for (const [label,documentId] of [['a1','a'],['a2','a'],['b1','b'],['b2','b']]) {
    const expand=win.locator('[data-creation-resource-tree-toggle="expand"]:visible')
    if(await expand.isVisible())await expand.click()
    await win.locator(`button[data-document-id="${documentId}"]`).click()
    const before=new Set((await designsOf(win,documentId)).map(design=>design.id))
    const creationRequest=fixture.expectText({label:`create ${label}`,reply:{type:'tool',id:`create-${label}`,name:'draft_shots',args:{shots:[{
      title:`Plan ${label}`,prompt:`Prompt ${label}`,taskKind:'text_to_image',candidate:{providerId:FIXTURE_VENDOR,modelId:FIXTURE_IMAGE_MODEL},modeId:'t2i',parameters:{size:'1024x1024'},durationSec:3,
      storyboard:{durationSec:3,anchorIds:[],keyframe:{enabled:false,prompt:`Frame ${label}`,params:{size:'1024x1024'}}},
    }]}}})
    fixture.expectText({label:`created ${label}`,reply:{type:'text',text:`DONE ${label}`}})
    await sendCreation(win, `为当前文稿新建一份分镜方案，标题 Plan ${label}，保留已有方案。`)
    await recorded(creationRequest.received,`actual Agent request creating ${label}`)
    await waitForV4TurnIdle(win,{panel:AGENT_PANEL,settledBy:win.locator(AGENT_PANEL).getByText(`DONE ${label}`,{exact:true})})
    await expect.poll(async()=>(await designsOf(win,documentId)).filter(design=>!before.has(design.id)).length).toBe(1)
    ids[label]=(await designsOf(win,documentId)).find(design=>!before.has(design.id)).id
    check((await designById(win,ids[label])).documentId===documentId,`UI-created ${label} owns the selected document`)
    check((await designById(win,ids[label])).title===`Plan ${label}`,`${label} is named by the model, not by a numbering scheme`)
  }
  for (const documentId of ['a','b']) {
    const expand=win.locator('[data-creation-resource-tree-toggle="expand"]:visible')
    if(await expand.isVisible())await expand.click()
    await win.locator(`button[data-document-id="${documentId}"]`).click()
    await expect(win.locator('[data-storyboard-id]')).toHaveCount(2)
  }
  check(true,'Both documents list two agent-made plans as ordinary sidebar plans')
  // 一个家的验收判据之一：没有第二种行，也没有 1.5s 轮询把它刷出来。
  await expectAbsent(win.locator('[data-storyboard-run-row]'),{provenBy:await proveProbe(win.locator('[data-storyboard-id]').first(),'sidebar plan rows are on screen'),message:'no second kind of plan row exists in the sidebar'})
  for (const id of ['a1', 'a2', 'b1', 'b2', 'a1']) {
    const expandTree = win.locator('[data-creation-resource-tree-toggle="expand"]:visible')
    if (await expandTree.isVisible()) await expandTree.click()
    await win.locator(`button[data-document-id="${id.startsWith('a') ? 'a' : 'b'}"]`).click()
    await win.locator(`[data-storyboard-id="${ids[id]}"]`).click()
    // Preserve the already approved editor contract: being able to edit a
    // textarea in a replacement form is not storyboard feature parity.
    const sharedEditor = win.locator('[data-storyboard-editor="true"]')
    await expect(sharedEditor, 'Agent plans must open the existing storyboard editor').toBeVisible()
    await expect(sharedEditor.locator('[data-storyboard-bulkbar]')).toBeVisible()
    await expect(sharedEditor.locator('[data-storyboard-row]')).toHaveCount(1)
    for (const selector of ['[data-storyboard-frame]', '[data-storyboard-refzone]', '[data-storyboard-prompt-block]']) {
      await expect(sharedEditor.locator(selector), 'Existing shot editing regions must remain reachable').toBeVisible()
    }
    await expect(sharedEditor.locator('[data-storyboard-prompt-block] [contenteditable="true"]').first()).toHaveText(`Prompt ${id}`)
  }
  check(true, 'Selecting plans loads each exact plan without sibling content')
  const expandForEdit = win.locator('[data-creation-resource-tree-toggle="expand"]:visible')
  if (await expandForEdit.isVisible()) await expandForEdit.click()
  await win.locator('button[data-document-id="a"]').click()
  await win.locator(`[data-storyboard-id="${ids.a1}"]`).click()
  const originalFields=structuredClone((await designById(win,ids.a1)).plan.shots[0])
  const editor = win.locator('[data-storyboard-editor="true"]')
  await editor.locator('[data-storyboard-prompt-block] [contenteditable="true"]').first().fill('Edited A1')
  await expect.poll(async () => (await designById(win,ids.a1))?.plan?.shots?.[0].prompt).toBe('Edited A1')
  assert.deepEqual((await designById(win,ids.a1)).plan.shots[0],{...originalFields,prompt:'Edited A1',promptSegments:[]},'prompt edit must preserve model, params, keyframe and all original author fields')
  check((await designById(win,ids.a2)).plan.shots[0].prompt === 'Prompt a2', 'Save only changes the selected plan')
  await win.screenshot({path:path.join(shotsDir,'zh-before-placement.png')})
  // PR #808 owns the width budget: collapse the existing resource tree, leaving
  // the original Agent open. Manual navigation above deliberately reopened it.
  const treeRowsBeforeCollapse = await win.locator('[data-storyboard-id]').count()
  await win.locator('[data-creation-resource-tree-toggle="collapse"]:visible').click()
  await expect(win.locator('[data-creation-resource-tree-toggle="expand"]:visible')).toBeVisible()
  await expect.poll(()=>editor.locator('[data-storyboard-generate-state]').evaluate(button=>{
    const rect=button.getBoundingClientRect(), hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)
    return Boolean(hit && button.contains(hit))
  })).toBe(true)
  await win.screenshot({path:path.join(shotsDir,'zh-original-storyboard.png')})
  await win.locator('[data-creation-resource-tree-toggle="expand"]:visible').click()
  await expect(win.locator('[data-storyboard-id]')).toHaveCount(treeRowsBeforeCollapse)
  await expect(editor.locator('[data-storyboard-prompt-block] [contenteditable="true"]').first()).toHaveText('Edited A1')
  check(true,'Original sidebar collapse frees the controls and expansion preserves every plan and edited prompt')
  await editor.locator(`[data-place-storyboard="${ids.a1}"]`).click()
  await expect(editor.locator(`[data-place-storyboard="${ids.a1}"]`)).toHaveText('查看画布')
  const canvasNodes=()=>win.evaluate(designId=>window.__nomiCanvasStore.getState().nodes.filter(node=>node.kind!=='shot_table'&&node.meta?.storyboardDesignId===designId),ids.a1)
  const nodes=await canvasNodes()
  check(nodes.length===1,'Original explicit placement creates one node')
  await editor.locator(`[data-place-storyboard="${ids.a1}"]`).click()
  await expect(win.locator('[data-kind="image"]').first()).toBeVisible()
  check(JSON.stringify((await canvasNodes()).map(node=>node.id))===JSON.stringify(nodes.map(node=>node.id)),'View on canvas retains node identity')
  await win.screenshot({path:path.join(shotsDir,'zh-canvas.png')})
  await gui.app.close()
  gui = await launchNomiApp(options)
  win = gui.win
  await openProject(win)
  await win.locator(`[data-storyboard-id="${ids.a1}"]`).click()
  await expect(win.locator('[data-storyboard-editor="true"] [data-storyboard-prompt-block] [contenteditable="true"]').first()).toHaveText('Edited A1')
  await expect(win.locator(`[data-place-storyboard="${ids.a1}"]`)).toHaveText('查看画布')
  assert.deepEqual((await designById(win,ids.a1)).plan.shots[0],{...originalFields,prompt:'Edited A1',promptSegments:[]})
  check(true, 'Fresh Electron process restores complete author fields and placement')
  await win.locator('[data-storyboard-batch]').click()
  const cancel=win.locator('[data-spend-confirm-dialog]').getByRole('button',{name:'取消',exact:true})
  const confirmationProof=await proveProbe(cancel,'original batch confirmation is present before cancellation')
  const submissionsBeforeCancel=fixture.images.length
  await cancel.click()
  await expectAbsent(cancel,{provenBy:confirmationProof,message:'original batch confirmation closes after cancellation'})
  assert.equal(fixture.images.length,submissionsBeforeCancel,'Original batch confirmation cancellation submits no media')
  const restoredEditor = win.locator('[data-storyboard-editor="true"]')
  await restoredEditor.locator('[data-storyboard-row="1"] [data-storyboard-frame]').getByRole('button',{name:'生成镜 1',exact:true}).click()
  const spendDialog = win.locator('[data-spend-confirm-dialog]')
  await expect(spendDialog).toBeVisible()
  assert.equal(fixture.images.length,submissionsBeforeCancel,'Single-shot action waits for the original confirmation')
  await spendDialog.getByRole('button',{name:'生成',exact:true}).click()
  await expect(restoredEditor.locator('[data-storyboard-frame]').first()).toHaveAttribute('data-storyboard-frame','done',{timeout:stationTimeout({operations:1})})
  assert.equal(fixture.images.length,submissionsBeforeCancel+1,'Single-shot approval submits exactly one loopback image request')
  assert.match(fixture.images.at(-1).body.prompt,/Edited A1/)
  const generated = await canvasNodes()
  assert.deepEqual(generated.map(node=>node.id),nodes.map(node=>node.id),'Original runner reuses the already placed node')
  assert.ok(generated[0].result?.url,'Original runner persists a real media result')
  await expect(restoredEditor.locator('[data-storyboard-frame] img').first()).toBeVisible()
  await expect.poll(()=>restoredEditor.locator('[data-storyboard-frame] img').first().evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true)
  check(true,'Single-shot generation uses the original runner and decodes the returned real JPG')
  const expandForBatch = win.locator('[data-creation-resource-tree-toggle="expand"]:visible')
  if(await expandForBatch.isVisible()) await expandForBatch.click()
  await win.locator(`[data-storyboard-id="${ids.a2}"]`).click()
  const batchEditor = win.locator('[data-storyboard-editor="true"]')
  await expect(batchEditor).toBeVisible()
  await batchEditor.locator('[data-storyboard-batch]').click()
  await expect(spendDialog).toBeVisible()
  assert.equal(fixture.images.length,submissionsBeforeCancel+1,'Batch action waits for the original confirmation')
  await spendDialog.getByRole('button',{name:'生成',exact:true}).click()
  await expect(batchEditor.locator('[data-storyboard-frame]').first()).toHaveAttribute('data-storyboard-frame','done',{timeout:stationTimeout({operations:1})})
  assert.equal(fixture.images.length,submissionsBeforeCancel+2,'One eligible shot in the batch produces one request')
  assert.match(fixture.images.at(-1).body.prompt,/Prompt a2/)
  check(true,'Original batch creates its node on demand without requiring explicit placement')
  const submissionsBeforeReopen = fixture.images.length
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'en'))
  await gui.app.close()
  gui = await launchNomiApp(options)
  win = gui.win
  await openProject(win)
  await win.locator(`[data-storyboard-id="${ids.a1}"]`).click()
  await expect(win.locator(`[data-place-storyboard="${ids.a1}"]`)).toHaveText('View canvas')
  await expect(win.locator('[data-storyboard-editor="true"] [data-storyboard-frame]').first()).toHaveAttribute('data-storyboard-frame','done')
  assert.equal((await canvasNodes())[0].result.id,generated[0].result.id,'Cold restart preserves the same generated result')
  await win.screenshot({ path: path.join(shotsDir, 'en-restored.png') })
  await win.locator('[data-creation-resource-tree-toggle="collapse"]:visible').click()
  await win.screenshot({path:path.join(shotsDir,'en-original-storyboard-restored.png')})
  fixture.assertClean()
  assert.equal(fixture.images.length,submissionsBeforeReopen,'Reopening the project must not submit media')
  console.log(`Core A creation plans: ${passed} checks passed. Evidence: ${shotsDir}. Isolated data: ${tempRoot}`)
} catch (error) {
  console.error('Creation walk main-process diagnostics:', gui?.mainLogTail())
  console.error('Creation walk fixture counts:', { requests: fixture.requests.length, images: fixture.images.length, unexpected: fixture.unexpected.length, tempRoot })
  await gui?.win.screenshot({ path: path.join(shotsDir, 'failure.png') })
  throw error
} finally { await gui?.app.close().catch(() => {}); await fixture.close() }
