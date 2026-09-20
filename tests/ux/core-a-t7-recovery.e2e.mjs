// EV-01: actual Electron resource requests and native window interruptions.
// No alternate UI, mocked import factory, provider credentials, or paid generation.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { require as tsxRequire } from 'tsx/cjs/api'
import { expect } from '@playwright/test'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import { findNodeHitPoint } from './_canvasHit.mjs'
import { waitForVisualQuiescence, proveProbe, expectAbsent } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { createAgentRuntimeFixture, FIXTURE_VENDOR, FIXTURE_TEXT_MODEL, FIXTURE_IMAGE_MODEL, flattenRequestText } from './agent-runtime-fixture.mjs'
import { sendCanvas, recorded, CANVAS_PANEL, APPROVAL_CARD, INTERVENTION_REJECT } from './agent-runtime-walk-support.mjs'

const { createWorkspaceProject } = tsxRequire('../../electron/workspace/workspaceRepository.ts', import.meta.url)
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-t7-recovery-'))
const settingsDir = path.join(tempRoot, 'settings')
const projectsDir = path.join(tempRoot, 'projects')
const projectId = 't7-recovery'
const projectRoot = path.join(projectsDir, projectId)
const outputDir = process.env.NOMI_T7_EVIDENCE_DIR || path.join(tempRoot, 'evidence')
fs.mkdirSync(settingsDir, { recursive: true })
fs.mkdirSync(outputDir, { recursive: true })
createWorkspaceProject({ rootPath: projectRoot, record: { id: projectId, name: 'T7 resource recovery', payload: {
  workbenchDocuments: [{ id: 'document', version: 1, title: 'T7 preserved document', updatedAt: 1,
    contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep this original document' }] }] } }],
  activeDocumentId: 'document', timeline: null,
  generationCanvas: { nodes: [], edges: [], groups: [], selectedNodeIds: [] },
} } }, { settingsRoot: settingsDir, defaultProjectsRoot: projectsDir })
const chunkNames = fs.readdirSync(path.join(repoRoot, 'dist/assets')).filter(name => /^NodeGenerationComposer-.*\.js$/.test(name))
assert.equal(chunkNames.length, 1, 'Test must intercept the unique real built composer chunk')
const chunkName = chunkNames[0]
const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
const report = {
  status: 'running', boundary: 'real Electron; actual built file resource; isolated project; no suppliers',
  head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), dirty: Boolean(git('status', '--porcelain')),
  buildStamp: JSON.parse(fs.readFileSync(path.join(repoRoot, 'dist/build-stamp.json'), 'utf8')),
  chunkName, chunkSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, 'dist/assets', chunkName))).digest('hex'),
  tempRoot, outputDir, scenarios: [], resourceRequests: [], screenshots: [], limitations: ['Windows unverified'],
}
const locale = process.env.NOMI_T7_LOCALE === 'en' ? 'en' : 'zh-CN'
const language = locale === 'en' ? 'en' : 'zh'
const panelMode = process.env.NOMI_T7_MODE === 'panel'
const fixture = panelMode ? await createAgentRuntimeFixture({ rootDir: repoRoot, settingsDir }) : null
const launchOptions = { name: 't7-recovery', tempRoot, settingsDir, projectsDir, userDataDir: path.join(tempRoot, 'user-data'), settleMs: 0,
  initialLocalStorage: { ...(panelMode ? { 'nomi.assistantModel': JSON.stringify({ vendorKey: FIXTURE_VENDOR, modelKey: FIXTURE_TEXT_MODEL }) } : {}), 'nomi:locale:v1': locale, '__nomiE2E': '1', 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen', 'nomi:canvas-gesture-hint:v1': 'seen' },
}
let gui
try {
  gui = await launchNomiApp(launchOptions)
  const { app, win } = gui
  report.runtime = await app.evaluate(({ app }) => ({ electron: process.versions.electron, pid: process.pid,
    platform: process.platform, packaged: app.isPackaged, appPath: app.getAppPath() }))
  report.rendererErrors = []
  win.on('console', message => { if (message.type() === 'error') report.rendererErrors.push(message.text()) })
  win.on('close', () => { report.originalPageClosed = true })
  if (process.env.NOMI_T7_MODE === 'native') {
    await verifyNativeInterruptions(gui)
    report.status = 'passed'
  } else {
  const browserWindow = await app.browserWindow(win)
  await browserWindow.evaluate((window, chunk) => {
    globalThis.__t7ResourceProbe = { blocked: true, requests: [], navigations: [] }
    window.webContents.on('did-start-navigation', (_event, url, _inPlace, mainFrame) => {
      if (mainFrame) globalThis.__t7ResourceProbe.navigations.push(url)
    })
    window.webContents.session.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (details, callback) => {
      const block = details.url.endsWith(`/${chunk}`) && globalThis.__t7ResourceProbe.blocked
      if (details.url.endsWith(`/${chunk}`)) globalThis.__t7ResourceProbe.requests.push({ url: details.url, blocked: block, at: Date.now() })
      callback({ cancel: block })
    })
  }, chunkName)
  report.initialResources = await win.evaluate(chunk => performance.getEntriesByType('resource').filter(row => row.name.includes(chunk)).map(row => row.toJSON()), chunkName)
  await win.locator('[data-project-card]', { hasText: 'T7 resource recovery' }).click()
  const localFailure = win.locator('[data-chunk-boundary="i18n:generationCommon.chunk.composer"]')
  const entry = await Promise.race([
    win.locator('[data-chunk-boundary]').first().waitFor({ state: 'visible' }).then(() => 'failed'),
    win.getByRole('button', { name: /^(生成|Generate)$/ }).waitFor({ state: 'visible' }).then(() => 'workbench'),
  ])
  if (entry === 'workbench') {
    await win.getByRole('button', { name: /^(生成|Generate)$/ }).click()
    await expect(win.locator('.react-flow')).toBeVisible()
    if (panelMode) await createOriginalSpendCard(win)
    else await win.locator('.generation-canvas-v2-toolbar [data-node-kind="image"]').click()
  }
  await win.locator('[data-chunk-boundary]').first().waitFor({ state: 'visible', timeout: stationTimeout({ operations: 1 }) })
  const failShot = path.join(outputDir, `${language}-resource-failure.png`)
  await win.screenshot({ path: failShot })
  report.screenshots.push(failShot)
  report.resourceRequests = await app.evaluate(() => globalThis.__t7ResourceProbe.requests)
  report.observedBoundaries = await win.locator('[data-chunk-boundary]').evaluateAll(elements => elements.map(element => ({ label: element.getAttribute('data-chunk-boundary'), text: element.textContent })))
  assert.equal(await localFailure.count(), panelMode ? 2 : 1,
    'Composer resource failure must remain local; it must not replace the workbench with a root/workspace error')
  report.scenarios.push({ name: `${panelMode ? 'canvas and payment' : 'canvas'} real chunk failure stays local`, status: 'passed' })
  const beforeRetry = await win.evaluate(() => ({ nodes: window.__nomiCanvasStore.getState().nodes }))
  report.nodesBeforeRetry = beforeRetry.nodes
  const navigationCount = await app.evaluate(() => globalThis.__t7ResourceProbe.navigations.length)
  await app.evaluate(() => { globalThis.__t7ResourceProbe.blocked = false })
  const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  const targetFailure = panelMode ? card.locator('[data-chunk-boundary]') : localFailure
  await targetFailure.getByRole('button', { name: /^(重试|Retry)$/ }).click()
  if (panelMode) {
    await expect(card.locator('[data-composer-host="panel"] [contenteditable="true"]')).toBeVisible()
    await localFailure.getByRole('button', { name: /^(重试|Retry)$/ }).click()
  }
  const recoveredInput = win.locator('[data-composer-host="canvas"] [contenteditable="true"]')
  await expect(recoveredInput).toBeVisible()
  report.resourceRequests = await app.evaluate(() => globalThis.__t7ResourceProbe.requests)
  const failedResource = report.resourceRequests.find(request => request.blocked)
  assert(failedResource, 'The real composer resource must have failed before recovery')
  assert(report.resourceRequests.some(request => !request.blocked && request.url === failedResource.url && request.at >= failedResource.at),
    'Local retry must successfully request the exact previously blocked composer URL without cache-busting')
  report.sameUrlRetry = { url: failedResource.url, failedAt: failedResource.at,
    recoveredAt: report.resourceRequests.find(request => !request.blocked && request.url === failedResource.url && request.at >= failedResource.at).at }
  assert.equal(await app.evaluate(() => globalThis.__t7ResourceProbe.navigations.length), navigationCount, 'Local retry must not navigate/reload the application')
  const preserved = await win.evaluate(() => window.__nomiCanvasStore.getState().nodes)
  assert.deepEqual(preserved, report.nodesBeforeRetry, 'Loading the original composer must preserve every node field')
  if (panelMode) {
    const cardInput = card.locator('[data-composer-host="panel"] [contenteditable="true"]')
    await cardInput.click()
    await win.keyboard.press('Meta+A')
    await win.keyboard.insertText('EV01 unapproved recovered draft / 不提前写画布')
    await expect(cardInput).toHaveText('EV01 unapproved recovered draft / 不提前写画布')
    await card.locator('[data-parameter-chip] button[aria-label="' + (locale === 'en' ? 'Size' : '尺寸') + '"]').first().click()
    await win.getByRole('option', { name: '1536x1024', exact: true }).first().click()
    assert.deepEqual(await win.evaluate(() => window.__nomiCanvasStore.getState().nodes), preserved, 'Recovered payment edits remain isolated from canvas')
    assert.equal(fixture.images.length, 0, 'Recovery and edits must not submit any media')
    await win.screenshot({ path: path.join(outputDir, `${language}-payment-resource-recovered.png`) })
    report.screenshots.push(path.join(outputDir, `${language}-payment-resource-recovered.png`))
    const cardProof = await proveProbe(card, 'Recovered original payment card is present before dismissal')
    await card.locator(INTERVENTION_REJECT).click()
    await expectAbsent(card, { provenBy: cardProof, message: 'Dismissed original payment card stays absent' })
    assert.deepEqual(await win.evaluate(() => window.__nomiCanvasStore.getState().nodes), preserved, 'Dismiss recovered card preserves original nodes')
    report.scenarios.push({ name: 'payment resource retry/input/parameter/dismiss stays isolated and zero media', status: 'passed' })
  }
  await recoveredInput.click()
  await win.keyboard.press('Meta+A')
  await win.keyboard.insertText('T7 after real resource retry / 局部恢复可编辑')
  await expect(recoveredInput).toHaveText('T7 after real resource retry / 局部恢复可编辑')
  await win.locator('[data-composer-host="canvas"] [data-parameter-summary]').click()
  await expect(win.locator('[data-agent-parameter-panel="true"]')).toBeVisible()
  await win.keyboard.press('Escape')
  report.scenarios.push({ name: 'canvas real chunk retry preserves nodes and allows input/click without navigation', status: 'passed' })
  const restoredShot = path.join(outputDir, `${language}-resource-recovered.png`)
  await win.screenshot({ path: restoredShot })
  report.screenshots.push(restoredShot)
  report.status = 'passed'
  }
  if (fixture) { fixture.assertClean(); assert.equal(fixture.images.length, 0) }
} catch (error) {
  report.status = 'failed'
  report.error = { message: error.message, stack: error.stack }
  if (gui) {
    report.nativeFailureProbe = await gui.app.evaluate(({ BrowserWindow }) => ({
      events: globalThis.__t7NativeEvents ?? [],
      windows: BrowserWindow.getAllWindows().map(window => ({ id: window.id, focused: window.isFocused(),
        visible: window.isVisible(), minimized: window.isMinimized(), destroyed: window.isDestroyed(), url: window.webContents.getURL() })),
    })).catch(error => ({ unavailable: String(error) }))
    report.rendererFailureProbe = await gui.win.evaluate(() => ({
      events: window.__t7TrustedWindowEvents ?? [], hasFocus: document.hasFocus(), hidden: document.hidden,
      stage: document.querySelector('.generation-canvas-v2__stage')?.outerHTML.slice(0, 800),
      activeElement: document.activeElement?.outerHTML.slice(0, 500),
      canvas: window.__nomiCanvasStore ? { nodes: window.__nomiCanvasStore.getState().nodes,
        persistRevision: window.__nomiCanvasStore.getState().persistRevision } : null,
    })).catch(error => ({ unavailable: String(error) }))
    report.resourceRequests = await gui.app.evaluate(() => globalThis.__t7ResourceProbe?.requests ?? []).catch(() => [])
    report.observedBoundaries = await gui.win.locator('[data-chunk-boundary]').evaluateAll(elements => elements.map(element => ({ label: element.getAttribute('data-chunk-boundary'), text: element.textContent }))).catch(() => [])
    await gui.win.screenshot({ path: path.join(outputDir, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  if (gui) report.mainLog = gui.mainLogTail()
  await gui?.close().catch(() => {})
  try {
    if (fixture) {
      await fixture.close()
      report.mediaRequests = fixture.images.length
      report.unexpectedRequests = fixture.unexpected
      fixture.assertClean()
      assert.equal(fixture.images.length, 0, 'Application teardown must submit zero media')
    }
  } catch (error) {
    report.status = 'failed'
    report.teardownError = { message: error.message, stack: error.stack }
    throw error
  } finally {
    report.locale = locale
    fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ status: report.status, outputDir, error: report.error?.message ?? report.teardownError?.message }))
  }
}


async function verifyNativeInterruptions({ app, win }) {
  // Playwright forces page focus by default, suppressing native renderer blur.
  const nativeFocusSession = await win.context().newCDPSession(win)
  await nativeFocusSession.send('Emulation.setFocusEmulationEnabled', { enabled: false })
  report.nativeFocusEmulationDisabled = true
  const stage = win.locator('.generation-canvas-v2__stage')
  const composer = win.locator('[data-composer-host="canvas"]')
  const windowHandle = await app.browserWindow(win)
  await windowHandle.evaluate(window => {
    globalThis.__t7NativeEvents = []
    for (const type of ['blur', 'focus', 'minimize', 'restore']) window.on(type, () => globalThis.__t7NativeEvents.push({ type, at: Date.now() }))
    window.show()
    window.focus()
  })
  await win.evaluate(() => {
    window.__t7TrustedWindowEvents = []
    for (const type of ['blur', 'focus', 'visibilitychange']) addEventListener(type, event => {
      window.__t7TrustedWindowEvents.push({ type, trusted: event.isTrusted, at: Date.now(), hidden: document.hidden, isWindow: event.target === window })
    }, true)
  })
  await win.locator('[data-project-card]', { hasText: 'T7 resource recovery' }).click()
  await win.getByRole('button', { name: /^(生成|Generate)$/ }).click()
  await expect(stage).toBeVisible()
  await win.locator('.generation-canvas-v2-toolbar [data-node-kind="image"]').click()
  await expect(composer).toBeVisible()
  const id = await win.evaluate(() => window.__nomiCanvasStore.getState().selectedNodeIds[0])
  const input = composer.locator('[contenteditable="true"]')
  const originalPrompt = 'T7 native interruption draft / 保持这个原草稿'
  await input.click()
  await win.keyboard.insertText(originalPrompt)
  await expect(input).toHaveText(originalPrompt)
  const snapshot = () => win.evaluate(() => {
    const state = window.__nomiCanvasStore.getState()
    return { nodes: state.nodes.map(node => ({ id: node.id, prompt: node.prompt, position: node.position, meta: node.meta, result: node.result, history: node.history })), persistRevision: state.persistRevision }
  })
  const select = async () => {
    await waitForVisualQuiescence(win)
    const hit = await findNodeHitPoint(win, { nodeSelector: `.generation-canvas-v2-node[data-node-id="${id}"]` })
    assert(hit, 'Original node must have a visible pointer target')
    await win.mouse.click(hit.x, hit.y)
    return hit
  }
  for (const interruption of ['native-focus', 'native-minimize']) {
    for (const alt of [false, true]) {
      const caseName = `${alt ? 'alt-copy' : 'node'}-drag/${interruption}`
      const point = await select()
      if (alt) await win.keyboard.down('Alt')
      await win.mouse.move(point.x, point.y)
      await win.mouse.down()
      await win.mouse.move(point.x + 35, point.y + 25, { steps: 5 })
      await expect(stage).toHaveAttribute('data-dragging', 'true')
      const beforeInterrupt = await snapshot()
      const eventsBefore = await app.evaluate(() => globalThis.__t7NativeEvents.length)
      const domEventsBefore = await win.evaluate(() => window.__t7TrustedWindowEvents.length)
      report.activeNativeAttempt = { caseName, beforeInterrupt, eventsBefore, domEventsBefore,
        window: await windowHandle.evaluate(window => ({ focused: window.isFocused(), visible: window.isVisible(), minimized: window.isMinimized() })),
        renderer: await win.evaluate(() => ({ hasFocus: document.hasFocus(), hidden: document.hidden })),
      }
      if (interruption === 'native-minimize') {
        await windowHandle.evaluate(window => window.minimize())
        await expect.poll(() => windowHandle.evaluate(window => window.isMinimized())).toBe(true)
      } else {
        await app.evaluate(({ BrowserWindow }) => {
          globalThis.__t7FocusWindow = new BrowserWindow({ width: 300, height: 160, show: true })
          globalThis.__t7FocusWindow.focus()
        })
        await expect.poll(() => windowHandle.evaluate(window => window.isFocused())).toBe(false)
      }
      await expect(stage).not.toHaveAttribute('data-dragging', 'true')
      const nativeEvents = await app.evaluate((_, start) => globalThis.__t7NativeEvents.slice(start), eventsBefore)
      const trustedEvents = await win.evaluate(start => window.__t7TrustedWindowEvents.slice(start), domEventsBefore)
      assert(nativeEvents.some(event => event.type === 'blur' || event.type === 'minimize'), 'OS/window-manager interruption must actually happen')
      assert(trustedEvents.some(event => event.trusted && ((event.type === 'blur' && event.isWindow) || (event.type === 'visibilitychange' && event.hidden))), 'Browser must deliver a trusted window interruption')
      if (interruption === 'native-focus') await app.evaluate(() => { globalThis.__t7FocusWindow.close(); globalThis.__t7FocusWindow = null })
      await windowHandle.evaluate(window => { window.restore(); window.show(); window.focus() })
      await expect.poll(() => windowHandle.evaluate(window => window.isFocused())).toBe(true)
      await win.mouse.move(point.x + 55, point.y + 40, { steps: 2 })
      await win.mouse.up()
      if (alt) await win.keyboard.up('Alt')
      await expect.poll(snapshot, { message: 'Late pointer release after native interruption must not commit abandoned movement' }).toEqual(beforeInterrupt)
      if (alt) {
        await win.locator(`.react-flow__node[data-id="${id}"]`).focus()
        await win.keyboard.press('Meta+Z')
        await expect.poll(() => win.evaluate(() => window.__nomiCanvasStore.getState().nodes.length)).toBe(1)
      }
      await select()
      await expect(input).toHaveText(originalPrompt)
      report.scenarios.push({ name: caseName, status: 'passed', nativeEvents, trustedEvents, originalAndCopyUnchangedAfterLateRelease: true })
    }
  }
  // Original keyboard workspace action during a held pointer; no store writes.
  let point = await select()
  await win.mouse.move(point.x, point.y)
  await win.mouse.down()
  await win.mouse.move(point.x + 35, point.y + 25, { steps: 5 })
  await expect(stage).toHaveAttribute('data-dragging', 'true')
  const beforeViewSwitch = await snapshot()
  await win.getByRole('button', { name: /^(创作|Create)$/ }).focus()
  await win.keyboard.press('Enter')
  await expect(stage).toBeHidden()
  await expect(stage).not.toHaveAttribute('data-dragging', 'true')
  await win.mouse.up()
  await expect.poll(snapshot).toEqual(beforeViewSwitch)
  await win.getByRole('button', { name: /^(生成|Generate)$/ }).click()
  await select()
  await expect(input).toHaveText(originalPrompt)
  report.scenarios.push({ name: 'node-drag/original-workspace-keyboard-switch', status: 'passed' })
  const shot = path.join(outputDir, `${language}-native-window-interruptions.png`)
  await win.screenshot({ path: shot })
  report.screenshots.push(shot)
  point = await select()
  const composerProof = await proveProbe(composer, 'Original selected node composer is present before node deletion')
  await win.mouse.move(point.x, point.y)
  await win.mouse.down()
  await win.mouse.move(point.x + 35, point.y + 25, { steps: 5 })
  await expect(stage).toHaveAttribute('data-dragging', 'true')
  await win.locator(`.react-flow__node[data-id="${id}"]`).focus()
  await win.keyboard.press('Backspace')
  await expect.poll(() => win.evaluate(() => window.__nomiCanvasStore.getState().nodes.length)).toBe(0)
  await expect(stage).not.toHaveAttribute('data-dragging', 'true')
  await win.mouse.up()
  await expectAbsent(composer, { provenBy: composerProof, message: 'Deleting the original node unmounts its composer without remounting' })
  report.scenarios.push({ name: 'node-drag/original-node-deletion-unmount', status: 'passed' })
  await verifyNativeGroupPersistence(app, win, windowHandle)
  report.limitations.push('Application canvas host never changes its readOnly prop; that transition is component-level coverage, not a native app action. Node locked is a different field.', 'Native pointercancel/lostcapture device paths are not covered by window focus/minimize.')
}

async function verifyNativeGroupPersistence(app, win, windowHandle) {
  const stage = win.locator('.generation-canvas-v2__stage')
  for (let index = 0; index < 2; index++) await win.locator('.generation-canvas-v2-toolbar [data-node-kind="image"]').click()
  const node = win.locator('.react-flow__node').first()
  await node.focus()
  await win.keyboard.press('ControlOrMeta+A')
  await expect.poll(() => win.evaluate(() => window.__nomiCanvasStore.getState().selectedNodeIds.length)).toBe(2)
  await win.keyboard.press('ControlOrMeta+G')
  await expect.poll(() => win.evaluate(() => window.__nomiCanvasStore.getState().groups.length)).toBe(1)
  await win.getByRole('button', { name: /^(适应视图|Fit view)$/ }).click()
  await waitForVisualQuiescence(win)
  const frame = win.locator('.generation-canvas-v2__group-box').first()
  const hit = await frame.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    for (const point of [{ x: bounds.x + bounds.width / 2, y: bounds.y + 8 }, { x: bounds.x + 8, y: bounds.y + bounds.height / 2 }]) {
      if (document.elementFromPoint(point.x, point.y)?.closest('[data-group-id]') === element) return point
    }
    return null
  })
  assert(hit, 'The original group frame must expose an actual visible drag target')
  const readGraph = () => win.evaluate(() => {
    const state = window.__nomiCanvasStore.getState()
    return { nodes: state.nodes.map(({ id, position }) => ({ id, position })), groups: state.groups, revision: state.persistRevision }
  })
  const before = await readGraph()
  await win.mouse.move(hit.x, hit.y)
  await win.mouse.down()
  await win.mouse.move(hit.x + 35, hit.y + 25, { steps: 5 })
  await expect(stage).toHaveAttribute('data-dragging', 'true')
  await expect.poll(async () => (await readGraph()).nodes[0].position.x).toBeGreaterThan(before.nodes[0].position.x)
  const eventsBefore = await app.evaluate(() => globalThis.__t7NativeEvents.length)
  await app.evaluate(({ BrowserWindow }) => {
    globalThis.__t7FocusWindow = new BrowserWindow({ width: 300, height: 160, show: true })
    globalThis.__t7FocusWindow.focus()
  })
  await expect.poll(() => windowHandle.evaluate(window => window.isFocused())).toBe(false)
  await expect(stage).not.toHaveAttribute('data-dragging', 'true')
  const settled = await readGraph()
  assert.equal(settled.revision, before.revision + 1, 'Interrupted original group drag must persist exactly one gesture')
  const nativeEvents = await app.evaluate((_, start) => globalThis.__t7NativeEvents.slice(start), eventsBefore)
  assert(nativeEvents.some(event => event.type === 'blur'), 'Group interruption must include a real native blur')
  await app.evaluate(() => { globalThis.__t7FocusWindow.close(); globalThis.__t7FocusWindow = null })
  await windowHandle.evaluate(window => { window.show(); window.focus() })
  await win.mouse.move(hit.x + 80, hit.y + 60)
  await win.mouse.up()
  assert.deepEqual(await readGraph(), settled, 'Late pointer release must not settle the interrupted group twice')
  const readDisk = () => {
    const graph = JSON.parse(fs.readFileSync(path.join(projectRoot, '.nomi/project.json'), 'utf8')).payload.generationCanvas
    return { nodes: graph.nodes.map(({ id, position }) => ({ id, position })), groups: graph.groups }
  }
  const expected = { nodes: settled.nodes, groups: settled.groups }
  await expect.poll(readDisk, { message: 'Original autosave persists group and member positions after native interruption' }).toEqual(expected)
  const screenshot = path.join(outputDir, `${language}-native-group-settled.png`)
  await win.screenshot({ path: screenshot })
  report.screenshots.push(screenshot)
  await gui.close()
  gui = await launchNomiApp(launchOptions)
  await gui.win.locator('[data-project-card]', { hasText: 'T7 resource recovery' }).click()
  await gui.win.getByRole('button', { name: /^(生成|Generate)$/ }).click()
  await expect.poll(() => gui.win.evaluate(() => {
    const state = window.__nomiCanvasStore.getState()
    return { nodes: state.nodes.map(({ id, position }) => ({ id, position })), groups: state.groups }
  })).toEqual(expected)
  await gui.win.getByRole('button', { name: /^(适应视图|Fit view)$/ }).click()
  await waitForVisualQuiescence(gui.win)
  const reopenedShot = path.join(outputDir, `${language}-native-group-reopened.png`)
  await gui.win.screenshot({ path: reopenedShot })
  report.screenshots.push(reopenedShot)
  report.scenarios.push({ name: 'original-group-drag/native-focus/autosave/cold-reopen', status: 'passed', before, settled, nativeEvents, persisted: expected })
}


async function createOriginalSpendCard(win) {
  const planner = fixture.expectText({ label: 'EV01 original Agent creates a generation draft',
    match: body => flattenRequestText(body).includes('EV01_DRAFT'),
    reply: { type: 'tool', id: 'ev01-draft', name: 'draft_shots', args: { shots: [{ prompt: 'EV01 original canvas prompt',
      taskKind: 'text_to_image', candidate: { providerId: FIXTURE_VENDOR, modelId: FIXTURE_IMAGE_MODEL }, parameters: { size: '1024x1024' } }] } } })
  let operationId
  const drafted = fixture.expectText({ label: 'EV01 captures the real operation identity', match: body => {
    const result = (body.messages ?? []).find(message => message.role === 'tool' && message.tool_call_id === 'ev01-draft')
    if (!result) return false
    operationId = /"operationId":"([^"]+)"/.exec(String(result.content))?.[1]
    return true
  }, reply: { type: 'hold' } })
  const quoted = fixture.expectText({ label: 'EV01 original generation quote awaits approval',
    match: body => (body.messages ?? []).some(message => message.role === 'tool' && message.tool_call_id === 'ev01-generate'),
    reply: { type: 'text', text: 'EV01 ready for user approval' } })
  await sendCanvas(win, 'EV01_DRAFT：准备一张图片，等待确认。')
  await recorded(planner.received, 'EV01 draft request')
  await recorded(drafted.received, 'EV01 real operation result')
  assert(operationId, 'Original draft must return an operation identity')
  drafted.release({ type: 'tool', id: 'ev01-generate', name: 'generate', args: { operationId } })
  await recorded(quoted.received, 'EV01 original quote response')
  await expect(win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)).toBeVisible()
  assert.equal(fixture.images.length, 0, 'No quote is approved by this test')
}
