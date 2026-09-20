import { proveProbe, expectAbsent } from './_assert.mjs'
// Partial CJ4 / T7: real Electron UI and project persistence, no provider submissions.
// Bundled history and terminal blur/result clearing are explicitly controlled setup;
// navigation, locks, parameter edits, history deletion and pointer input use original UI.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { require as tsxRequire } from 'tsx/cjs/api'
import { expect } from '@playwright/test'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import { findCanvasBlankPoint, findNodeHitPoint } from './_canvasHit.mjs'

const { createWorkspaceProject } = tsxRequire('../../electron/workspace/workspaceRepository.ts', import.meta.url)
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-core-a-composer-'))
const settingsDir = path.join(tempRoot, 'settings')
const projectsDir = path.join(tempRoot, 'projects')
const projectId = 'core-a-composer'
const projectRoot = path.join(projectsDir, projectId)
const shotsDir = path.join(repoRoot, 'tests/ux/shots/core-a-composer')
fs.mkdirSync(settingsDir, { recursive: true })
fs.mkdirSync(shotsDir, { recursive: true })
createWorkspaceProject({ rootPath: projectRoot, record: { id: projectId, name: 'Core A composer acceptance', payload: {
  workbenchDocuments: [{ id: 'document', version: 1, title: 'Fixture', updatedAt: 1, contentJson: { type: 'doc', content: [] } }],
  activeDocumentId: 'document', timeline: null,
  generationCanvas: { nodes: [], edges: [], groups: [], selectedNodeIds: [] },
} } }, { settingsRoot: settingsDir, defaultProjectsRoot: projectsDir })
const options = { name: 'core-a-composer', tempRoot, settingsDir, projectsDir, userDataDir: path.join(tempRoot, 'user-data'),
  initialLocalStorage: { 'nomi:locale:v1': 'zh-CN', '__nomiE2E': '1', 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen', 'nomi:canvas-gesture-hint:v1': 'seen' } }
const readNodes = () => JSON.parse(fs.readFileSync(path.join(projectRoot, '.nomi/project.json'), 'utf8')).payload.generationCanvas.nodes
const composerSelector = '[data-composer-host="canvas"]'
let gui
const edited = []
const diagnostics = []
const observedLaunches = []

async function observeCanvasInputs(win) {
  await win.evaluate(() => {
    const rows = []
    window.__coreAComposerObservations = rows
    const record = row => { rows.push({ at: new Date().toISOString(), ...row }); if (rows.length > 250) rows.shift() }
    const targetOf = target => target instanceof Element ? {
      tag: target.tagName, role: target.getAttribute('role'), label: target.getAttribute('aria-label'),
      title: target.getAttribute('title'), className: target.className,
      editable: target.getAttribute('contenteditable'), nodeId: target.closest('[data-node-id]')?.getAttribute('data-node-id'),
    } : null
    for (const type of ['keydown', 'pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
      record({ type, key: event.key, code: event.code, x: event.clientX, y: event.clientY,
        ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey, trusted: event.isTrusted,
        target: targetOf(event.target), focused: targetOf(document.activeElement) })
    }, true)
    const store = window.__nomiCanvasStore
    let ids = store.getState().nodes.map(node => node.id)
    store.subscribe(state => {
      const next = state.nodes.map(node => node.id)
      const removed = ids.filter(id => !next.includes(id))
      const added = next.filter(id => !ids.includes(id))
      if (removed.length || added.length) record({ type: 'nodes-changed', added, removed, selected: state.selectedNodeIds,
        isReady: state.isReady, stack: removed.length ? new Error('Observed canvas node removal').stack : undefined })
      ids = next
    })
  })
}

async function saveCanvasObservations(win) {
  const observation = await win.evaluate(() => ({
    rows: window.__coreAComposerObservations ?? [],
    nodes: window.__nomiCanvasStore?.getState().nodes.map(node => ({ id: node.id, kind: node.kind })),
    selected: window.__nomiCanvasStore?.getState().selectedNodeIds,
  })).catch(error => ({ observationError: String(error) }))
  observedLaunches.push(observation)
  fs.writeFileSync(path.join(shotsDir, 'composer-input-observations.json'), JSON.stringify({ tempRoot, observedLaunches }, null, 2))
}

async function openCanvas(win) {
  if (!win.url().includes(`projectId=${projectId}`)) await win.locator('[data-project-card]', { hasText: 'Core A composer acceptance' }).click()
  await win.getByRole('button', { name: /^(生成|Generate)$/ }).click()
  await expect(win.locator('.react-flow')).toBeVisible()
}

async function selectNode(win,id,{multi=false}={}) {
  const point=await findNodeHitPoint(win,{nodeSelector:` .generation-canvas-v2-node[data-node-id="${id}"]`})
  assert(point,`Node ${id} must expose a real pointer target`)
  if(multi)await win.keyboard.down('Shift')
  try { await win.mouse.click(point.x,point.y) }
  finally { if(multi)await win.keyboard.up('Shift') }
}

async function checkEditor(win) {
  const composer = win.locator(composerSelector)
  await expect(composer).toHaveCount(1)
  const input = composer.locator('[contenteditable="true"]')
  await expect(input).toBeVisible()
  await expect.poll(() => input.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && Boolean(hit && element.contains(hit))
  }), { message: 'The prompt must have visible geometry and receive pointer input' }).toBe(true)
  diagnostics.push(await win.evaluate(() => {
    const store = window.__nomiCanvasStore.getState()
    const node = store.nodes.find(value => store.selectedNodeIds.includes(value.id))
    const card = document.querySelector('[data-composer-host="canvas"]')
    const rect = card?.getBoundingClientRect()
    return { selectedNodeIds: store.selectedNodeIds, primarySelection: store.primarySelectedNodeId ?? null,
      multi: store.selectedNodeIds.length > 1, kind: node?.kind, status: node?.status,
      mounted: Boolean(card), visibility: card ? getComputedStyle(card).visibility : null,
      rect: rect ? {x:rect.x,y:rect.y,width:rect.width,height:rect.height} : null,
      dragging: document.querySelector('.generation-canvas-v2__stage')?.getAttribute('data-dragging') }
  }))
  return { composer, input }
}

async function editParameter(win, item) {
  const before = await win.evaluate(id => window.__nomiCanvasStore.getState().nodes.find(node => node.id === id)?.meta, item.id)
  const { composer } = await checkEditor(win)
  await composer.locator('[data-parameter-summary]').click()
  const panel = win.locator('[data-agent-parameter-panel="true"]')
  await expect(panel).toBeVisible()
  const option = panel.locator('[role="radio"][aria-checked="false"]:not([disabled])').first()
  await expect(option).toBeVisible()
  await option.click()
  await win.keyboard.press('Escape')
  await expect.poll(() => win.evaluate(id => window.__nomiCanvasStore.getState().nodes.find(node => node.id === id)?.meta, item.id)).not.toEqual(before)
  item.meta = await win.evaluate(id => window.__nomiCanvasStore.getState().nodes.find(node => node.id === id)?.meta, item.id)
  await expect.poll(() => readNodes().find(node => node.id === item.id)?.meta).toEqual(item.meta)
}

async function replacePrompt(win, item, suffix) {
  const { input } = await checkEditor(win)
  item.prompt += suffix
  await input.click()
  await win.keyboard.press('Meta+A')
  await win.keyboard.insertText(item.prompt)
  await expect(input).toHaveText(item.prompt)
  await expect.poll(() => readNodes().find(node => node.id === item.id)?.prompt).toBe(item.prompt)
}

try {
  gui = await launchNomiApp(options)
  let win = gui.win
  await openCanvas(win)
  await observeCanvasInputs(win)
  for (const kind of ['image', 'video']) {
    const beforeIds = new Set(await win.locator('.generation-canvas-v2-node[data-node-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-node-id'))))
    const toolbar = win.locator('.generation-canvas-v2-toolbar')
    const add = toolbar.locator(`[data-node-kind="${kind}"]`)
    if (await add.isVisible()) await add.click()
    else {
      await toolbar.locator('[data-canvas-add-more="true"]').click()
      await win.locator(`.generation-canvas-v2-toolbar__more-menu [data-node-kind="${kind}"]`).click()
    }
    await expect(win.locator('.generation-canvas-v2-node[data-node-id]')).toHaveCount(beforeIds.size + 1)
    const id = (await win.locator('.generation-canvas-v2-node[data-node-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-node-id')))).find(value => !beforeIds.has(value))
    assert(id, 'UI creation must produce a new node identity')
    const { composer, input } = await checkEditor(win)
    const prompt = `Core A ${kind} 保存后重开 / keep this draft`
    await input.click()
    await win.keyboard.press('Meta+A')
    await win.keyboard.insertText(prompt)
    await expect(input).toHaveText(prompt)
    const pill = composer.locator('[data-parameter-summary]')
    await pill.click()
    const panel = win.locator('[data-agent-parameter-panel="true"]')
    await expect(panel).toBeVisible()
    const option = panel.locator('[role="radio"][aria-checked="false"]:not([disabled])').first()
    await expect(option).toBeVisible()
    const optionName = await option.getAttribute('aria-label') || await option.textContent()
    await option.click()
    await expect(panel.locator('[role="radio"][aria-checked="true"]', { hasText: optionName.trim() })).toBeVisible()
    await win.keyboard.press('Escape')
    await expect.poll(() => readNodes().find(node => node.id === id)?.prompt).toBe(prompt)
    const expectedMeta = await win.evaluate(nodeId => window.__nomiCanvasStore.getState().nodes.find(node => node.id === nodeId)?.meta, id)
    assert(expectedMeta, 'The real canvas owner must expose the edited parameter values')
    await expect.poll(() => readNodes().find(node => node.id === id)?.meta,
      { message: 'Wait for the parameter edit itself to reach project persistence' }).toEqual(expectedMeta)
    edited.push({ id, kind, prompt, meta: expectedMeta })
    const mountedProof = await proveProbe(win.locator(composerSelector), 'composer mounted before original view switch')
    await win.getByRole('button', { name: /^(创作|Create)$/ }).click()
    await expectAbsent(win.locator(composerSelector), { provenBy: mountedProof, message: 'Create unmounts canvas composer' })
    await openCanvas(win)
    await selectNode(win, id)
    await expect((await checkEditor(win)).input).toHaveText(prompt)
    assert.deepEqual(await win.evaluate(nodeId => window.__nomiCanvasStore.getState().nodes.find(node => node.id === nodeId)?.meta, id), expectedMeta)

    await win.screenshot({ path: path.join(shotsDir, `zh-${kind}.png`) })
    const point = await findCanvasBlankPoint(win)
    assert(point, 'The fixture must expose an actual blank canvas hit target')
    await win.mouse.click(point.x, point.y)
    await selectNode(win,id)
    await expect((await checkEditor(win)).input).toHaveText(prompt)
  }
  await win.getByRole('button', { name: /^(适应视图|Fit view)$/ }).click()
  await selectNode(win,edited[0].id)
  const singleComposerProof = await proveProbe(win.locator(composerSelector), 'single selected node exposes its real composer before multi selection')
  await selectNode(win,edited[1].id,{multi:true})
  await expect.poll(() => win.evaluate(() => window.__nomiCanvasStore.getState().selectedNodeIds.length)).toBe(2)
  await expectAbsent(win.locator(composerSelector), { provenBy: singleComposerProof, message: 'multi selection dismisses the single composer' })
  await expect(win.locator('[data-batch-scope="selection"]')).toBeVisible()
  const blank = await findCanvasBlankPoint(win)
  assert(blank)
  await win.mouse.click(blank.x, blank.y)
  await selectNode(win,edited[0].id)
  await expect((await checkEditor(win)).input).toHaveText(edited[0].prompt)
  // Original lock protects against AI writes; it does not prohibit user parameter edits.
  const imageItem = edited[0]
  const imageNode = win.locator(`.generation-canvas-v2-node[data-node-id="${imageItem.id}"]`)
  await imageNode.locator('[data-node-lock="unlocked"]').click()
  await expect(imageNode.locator('[data-node-lock="locked"]')).toBeVisible()
  await expect.poll(() => win.evaluate(id => window.__nomiCanvasStore.getState().nodes.find(node => node.id === id)?.locked, imageItem.id)).toBe(true)
  await editParameter(win, imageItem)
  await imageNode.locator('[data-node-lock="locked"]').click()
  await expect(imageNode.locator('[data-node-lock="unlocked"]')).toBeVisible()
  await editParameter(win, imageItem)
  // Use the original first-frame mode. Fail visibly if this model no longer exposes it;
  // do not fabricate model identity or weaken the missing-reference precondition.
  await selectNode(win, edited[1].id)
  const videoComposer = (await checkEditor(win)).composer
  await videoComposer.getByRole('group', { name: '生成方式', exact: true }).getByRole('button', { name: '首帧', exact: true }).click()
  await expect(videoComposer.locator('[data-bar-segment="generate"]')).toBeDisabled()
  await expect(videoComposer.locator('[data-bar-segment="generate"]').locator('..')).toHaveAttribute('title', /参考素材|首帧/)
  await editParameter(win, edited[1])
  await expect(videoComposer.locator('[data-bar-segment="generate"]')).toBeDisabled()
  await selectNode(win, imageItem.id)
  // Controlled result attachment using real bundled media. History requires two
  // distinct results for an ordinary canvas node; no fabricated productionRunId.
  const historyDir=path.join(projectRoot,'assets','generated')
  fs.mkdirSync(historyDir,{recursive:true})
  const history=[3,4].map(index=>{
    const name=`history-${index}.jpg`
    fs.copyFileSync(path.join(repoRoot,`resources/onboarding-demo/shot-${index}.jpg`),path.join(historyDir,name))
    return {id:`controlled-history-${index}`,createdAt:index,type:'image',url:`nomi-local://asset/${projectId}/assets/generated/${name}`}
  })
  await win.evaluate(({id,history}) => {
    window.__nomiCanvasStore.getState().updateNode(id, {result:history[1],history})
  }, {id:edited[0].id,history})
  await win.locator(`[data-node-id="${edited[0].id}"]`).getByRole('button', {name:/\d+ 版/}).click()
  await expect(win.locator(`[data-node-result-stack="${edited[0].id}"]`)).toBeVisible()
  const historyProof = await proveProbe(win.locator(`[data-node-result-stack="${edited[0].id}"]`), 'history tray is visible before switching away')
  await selectNode(win,edited[1].id)
  await expect((await checkEditor(win)).input).toHaveText(edited[1].prompt)
  await selectNode(win,edited[0].id)
  await expect((await checkEditor(win)).input).toHaveText(edited[0].prompt)
  await expectAbsent(win.locator(`[data-node-result-stack="${edited[0].id}"]`), { provenBy: historyProof, message: 'A to B to A releases old history tray' })
  await imageNode.getByRole('button', { name: /\d+ 版/ }).click()
  const tray = win.locator(`[data-node-result-stack="${imageItem.id}"]`)
  const resultRow = tray.locator(`[data-result-stack-item="${history[1].id}"]`)
  const resultProof = await proveProbe(resultRow, 'controlled JPG is present before real UI deletion')
  await resultRow.locator('button[aria-label="删除"]').click()
  await expect(win.locator('[data-confirm-dialog-surface="confirm"]')).toBeVisible()
  await win.locator('[data-confirm-dialog-confirm]').click()
  await expectAbsent(resultRow, { provenBy: resultProof, message: 'original delete action removes selected history result' })
  await expect.poll(() => win.evaluate(id => window.__nomiCanvasStore.getState().nodes.find(node => node.id === id)?.history?.length, imageItem.id)).toBe(1)
  await expect((await checkEditor(win)).input).toHaveText(imageItem.prompt)
  // Ordinary nodes hide the tray at one result. Controlled final-result removal
  // exercises the original lifecycle; it is NOT evidence of a last-result UI action.
  await win.evaluate(id => window.__nomiCanvasStore.getState().updateNode(id, { result: undefined, history: [], status: 'idle' }), imageItem.id)
  await replacePrompt(win, imageItem, ' / after controlled final-result removal')
  const dragPoint = await findNodeHitPoint(win, { nodeSelector: `.generation-canvas-v2-node[data-node-id="${imageItem.id}"]` })
  assert(dragPoint, 'Interrupted gesture needs a real original node hit target')
  await win.mouse.move(dragPoint.x, dragPoint.y)
  await win.mouse.down()
  await win.mouse.move(dragPoint.x + 32, dragPoint.y + 24, { steps: 5 })
  await expect(win.locator('.generation-canvas-v2__stage')).toHaveAttribute('data-dragging', 'true')
  // Controlled blur termination after real pointer down/move; not native OS focus loss.
  await win.evaluate(() => window.dispatchEvent(new Event('blur')))
  await win.mouse.up()
  await expect(win.locator('.generation-canvas-v2__stage')).not.toHaveAttribute('data-dragging', 'true')
  await selectNode(win, imageItem.id)
  await replacePrompt(win, imageItem, ' / after interrupted drag')
  await win.screenshot({path:path.join(shotsDir,'history-switch-and-blur.png')})
  fs.writeFileSync(path.join(shotsDir, 'composer-diagnostics.json'), JSON.stringify(diagnostics, null, 2))
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'en'))
  await saveCanvasObservations(win)
  await gui.app.close()
  gui = await launchNomiApp(options)
  win = gui.win
  await openCanvas(win)
  await observeCanvasInputs(win)
  for (const item of edited) {
    // Offscreen nodes are virtualized; use the user's existing fit action before selecting.
    await win.getByRole('button', { name: 'Fit view', exact: true }).click()
    await selectNode(win,item.id)
    await expect((await checkEditor(win)).input).toHaveText(item.prompt)
    const restored = readNodes().find(node => node.id === item.id)
    assert.deepEqual(restored.meta, item.meta, 'Parameter values must survive a fresh Electron process')
    await win.screenshot({ path: path.join(shotsDir, `en-restored-${item.kind}.png`) })
  }
  console.log(JSON.stringify({ status: 'passed', scope: 'partial CJ4: original view unmount, user edits while AI locked, missing first-frame reference, history deletion; controlled final-result clear and blur interruption; restart', platform: process.platform, tempRoot, shotsDir }))
  await saveCanvasObservations(win)
} catch(error) {
  console.error('Composer walk main-process diagnostics:',gui?.mainLogTail())
  if (gui?.win) await saveCanvasObservations(gui.win)
  await gui?.win.screenshot({path:path.join(shotsDir,'failure.png')})
  throw error
} finally { await gui?.app.close().catch(() => {}) }
