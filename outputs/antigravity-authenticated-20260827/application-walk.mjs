/* global window, document, crypto */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import console from 'node:console'
import readline from 'node:readline'
import { createHash } from 'node:crypto'
import { launchNomiApp } from '../../tests/ux/_launchApp.mjs'

const out = path.join(process.cwd(), 'outputs/antigravity-authenticated-20260827/application')
const tempRoot = '/tmp/nomi-antigravity-application-20260827'
fs.mkdirSync(out, { recursive: true })
const report = { tempRoot, build: createHash('sha256').update(fs.readFileSync('dist-electron/ai/antigravityProcess.js')).digest('hex'), actions: [], errors: [] }
if (fs.existsSync(path.join(out, 'report.json'))) fs.copyFileSync(path.join(out, 'report.json'), path.join(out, `report-${Date.now()}.json`))
const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
const { app, win: initialWin, close } = await launchNomiApp({ name: 'antigravity-application', tempRoot,
  env: { HTTPS_PROXY: 'http://127.0.0.1:7897', HTTP_PROXY: 'http://127.0.0.1:7897', NO_PROXY: 'localhost,127.0.0.1,::1' } })
let win = initialWin
win.on('pageerror', (error) => { report.errors.push(error.message); save() })
const nativeWindow = await app.browserWindow(win)
await nativeWindow.evaluate((window) => window.setBounds({ width: 1600, height: 1000 }))
await win.evaluate(() => {
  for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1', 'nomi-onboarding-checklist:v1']) window.localStorage.setItem(key, 'seen')
})
await win.reload(); await win.waitForLoadState('domcontentloaded')
async function inspect() {
  return win.evaluate(() => ({
    pages: [...document.querySelectorAll('[data-model-settings-page]')].map((e) => e.getAttribute('data-model-settings-page')),
    buttons: [...document.querySelectorAll('button,[role="button"],summary')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({
      text: e.textContent?.trim().slice(0, 100), aria: e.getAttribute('aria-label'), testid: e.getAttribute('data-testid'),
      available: e.getAttribute('data-model-home-available'), connection: e.getAttribute('data-model-home-connection'), disabled: e.disabled,
    })).slice(0, 100),
    nodes: [...document.querySelectorAll('[data-node-id][data-kind]')].map((e) => ({ id: e.getAttribute('data-node-id'), kind: e.getAttribute('data-kind') })),
    images: [...document.images].filter((e) => e.getBoundingClientRect().width > 20).map((e) => ({alt:e.alt,loaded:e.complete && e.naturalWidth > 0, width:e.naturalWidth,height:e.naturalHeight})),
  }))
}
async function screenshot(name) {
  const file = path.join(out, name + '.png'); await win.screenshot({ path: file }); return file
}
const catalog = () => win.evaluate(() => window.nomiDesktop.modelCatalog.listModels().filter((m) => m.vendorKey === 'antigravity-cli').map((m) => ({modelKey:m.modelKey,kind:m.kind,enabled:m.enabled,meta:m.meta})))
console.log(JSON.stringify({ ready:true, tempRoot, initial:await inspect(), screenshot:await screenshot('01-initial') })); save()
const input = readline.createInterface({ input:process.stdin, crlfDelay:Infinity })
try {
  for await (const line of input) {
    if (!line.trim()) continue
    const command = JSON.parse(line)
    try {
      const live = app.windows().filter((page) => !page.isClosed())
      win = live.find((page) => /projectId=/.test(page.url())) || live[live.length - 1] || win
      let result
      if (command.action === 'close') break
      if (command.action === 'inspect') result = await inspect()
      else if (command.action === 'click') { await win.locator(command.selector).click({timeout:8000}); result = {clicked:command.selector} }
      else if (command.action === 'textClick') { await win.getByText(command.text,{exact:command.exact ?? true}).first().click({timeout:8000}); result = {clicked:command.text} }
      else if (command.action === 'fill') { await win.locator(command.selector).fill(command.value); result = {filled:true} }
      else if (command.action === 'insert') { await win.locator(command.selector).click(); await win.keyboard.insertText(command.value); result = {inserted:true} }
      else if (command.action === 'key') { await win.keyboard.press(command.key); result = {key:command.key} }
      else if (command.action === 'wait') { await win.locator(command.selector).waitFor({state:command.state || 'visible',timeout:command.timeout || 30000}); result = {waited:command.selector} }
      else if (command.action === 'screenshot') result = await screenshot(command.name)
      else if (command.action === 'scroll') { await win.locator(command.selector).scrollIntoViewIfNeeded(); result = {scrolled:true} }
      else if (command.action === 'resize') { await (await app.browserWindow(win)).evaluate((window, bounds) => window.setBounds(bounds), { width:command.width, height:command.height }); result = {resized:true} }
      else if (command.action === 'catalog') result = await catalog()
      else if (command.action === 'status') result = await win.evaluate(() => window.nomiDesktop.onboarding.antigravityStatus())
      else if (command.action === 'test') result = await win.evaluate((request) => window.nomiDesktop.onboarding.antigravityTest(request),command.request)
      else if (command.action === 'enable') result = await win.evaluate((modelKey) => {
        window.nomiDesktop.modelCatalog.upsertModel({vendorKey:'antigravity-cli',modelKey,enabled:true})
        window.nomiDesktop.modelCatalog.upsertVendor({key:'antigravity-cli',enabled:true}); return {enabled:modelKey}
      },command.modelKey)
      else if (command.action === 'projects') result = await win.evaluate(() => window.nomiDesktop.projects.list().map((p) => ({id:p.id,name:p.name})))
      else if (command.action === 'assets') result = await win.evaluate(async (projectId) => window.nomiDesktop.assets.list({projectId}),command.projectId)
      else if (command.action === 'task') result = await win.evaluate(async (value) => {
        const b = window.nomiDesktop; const nodeId = 'agy-walk-' + crypto.randomUUID()
        const {grantId} = await b.tasks.grantSpend({nodeIds:[nodeId],maxAttemptsPerNode:1})
        return b.tasks.run({vendor:'antigravity-cli',request:{kind:value.kind,prompt:value.prompt,
          extras:{projectId:value.projectId,modelKey:value.modelKey,nodeId,spendGrantId:grantId,idempotencyKey:nodeId,...(value.refs?{reference_images:value.refs}:{})}}})
      },command)
      else if (command.action === 'result') result = await win.evaluate((payload) => window.nomiDesktop.tasks.result(payload),command.payload)
      else if (command.action === 'cancel') result = await win.evaluate((taskId) => window.nomiDesktop.tasks.cancel(taskId),command.taskId)
      else if (command.action === 'matrix') {
        const discovery = await win.evaluate(() => window.nomiDesktop.onboarding.antigravityStatus())
        const results = []
        for (const model of discovery.models) {
          for (const capability of ['text','vision']) {
            const status = await win.evaluate((request) => window.nomiDesktop.onboarding.antigravityTest(request),{capability,modelId:model.id})
            const check = status.checks?.find((c) => c.modelId === model.id && c.capability === capability)
            results.push({modelId:model.id,capability,...check,code:status.code})
            if (check?.state === 'passed') await win.evaluate((modelKey) => {
              window.nomiDesktop.modelCatalog.upsertModel({vendorKey:'antigravity-cli',modelKey,enabled:true})
              window.nomiDesktop.modelCatalog.upsertVendor({key:'antigravity-cli',enabled:true})
            },model.id)
            fs.writeFileSync(path.join(out,'model-matrix.json'),JSON.stringify(results,null,2))
            console.log(JSON.stringify({matrixProgress:results.at(-1)}))
            if (status.code === 'ANTIGRAVITY_QUOTA' || status.state === 'login-required') throw new Error(status.code)
          }
        }
        result = results
      } else throw new Error('Unknown walkthrough command')
      report.actions.push({command,result}); save(); console.log(JSON.stringify({ok:true,result}))
    } catch (error) { report.actions.push({command,error:error.message}); save(); console.log(JSON.stringify({ok:false,error:error.message})) }
  }
} finally { input.close(); save(); await close() }
