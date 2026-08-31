import process from 'node:process'
import console from 'node:console'
import path from 'node:path'
import fs from 'node:fs'
import readline from 'node:readline'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { launchNomiApp } from '../../tests/ux/_launchApp.mjs'

const root = process.cwd()
const out = path.join(root, 'outputs/agnes-latest-main-ui-walk-20260826')
const projectId = 'workspace-6c604c6d-0157-4b57-b798-0727808e9889'
const tempRoot = '/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/agnes-9NlGXE'
const main = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main
const build = {
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  main,
  mainMtime: fs.statSync(path.join(root, main)).mtime.toISOString(),
  mainSha256: createHash('sha256').update(fs.readFileSync(path.join(root, main))).digest('hex'),
  rendererIndexSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'dist/index.html'))).digest('hex'),
  rendererIndexMtime: fs.statSync(path.join(root, 'dist/index.html')).mtime.toISOString(),
}
const runLabel = process.env.AGNES_READONLY_RUN || 'first'
const report = { build, projectId, zeroGeneration: true, actions: [], observations: [], pageErrors: [] }
const save = () => fs.writeFileSync(path.join(out, runLabel + '-observations.json'), JSON.stringify(report, null, 2))
const { win, close } = await launchNomiApp({ name: 'agnes-readonly-ui', tempRoot, timeout: 45000 })
win.on('pageerror', (error) => { report.pageErrors.push({ name: error.name, message: error.message.slice(0, 220) }); save() })
async function inspect() {
  const result = await win.evaluate(() => ({
    title: globalThis.document.title,
    headings: [...globalThis.document.querySelectorAll('h1,h2,h3')].map((e) => e.textContent?.trim()),
    buttons: [...globalThis.document.querySelectorAll('button,[role="button"],[role="tab"]')].filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0).map((e) => ({ text: e.textContent?.trim().slice(0, 100), aria: e.getAttribute('aria-label'), title: e.getAttribute('title'), testid: e.getAttribute('data-testid') })).slice(0, 90),
    settingsPages: [...globalThis.document.querySelectorAll('[data-model-settings-page]')].map((e) => ({ page: e.getAttribute('data-model-settings-page'), vendor: e.getAttribute('data-model-settings-vendor'), model: e.getAttribute('data-model-settings-model') })),
    nodeCount: globalThis.document.querySelectorAll('.react-flow__node').length,
    capabilityFields: [...globalThis.document.querySelectorAll('[data-model-settings-page="capability"] input[data-capability-field]')].filter((e) => /^modes\.\d+\.(?:slots\.\d+\.(?:min|max|label)|parameters\.\d+\.(?:key|label))$/.test(e.getAttribute('data-capability-field') || '')).map((e) => ({ path: e.getAttribute('data-capability-field'), value: e.value })),
    images: [...globalThis.document.images].filter((e) => e.getBoundingClientRect().width > 20).map((e) => ({ alt: e.alt, loaded: e.complete && e.naturalWidth > 0, width: e.naturalWidth, height: e.naturalHeight, local: e.src.startsWith('nomi-local:') })),
  }))
  report.observations.push(result); save(); return result
}
async function snapshot(name) {
  const file = path.join(out, `${name}.png`)
  await win.screenshot({ path: file })
  report.actions.push({ action: 'screenshot', file }); save(); return { file }
}
async function catalog() {
  const value = await win.evaluate(() => {
    const bridge = globalThis.window.nomiDesktop
    const v = bridge.modelCatalog.listVendors().find((item) => item.key === 'agnes')
    return { hasApiKey: Boolean(v?.hasApiKey), enabled: v?.enabled, models: bridge.modelCatalog.listModels().filter((m) => m.vendorKey === 'agnes').map((m) => ({ modelKey: m.modelKey, labelZh: m.labelZh, kind: m.kind, enabled: m.enabled })) }
  })
  report.catalog = value; save(); return value
}
async function assets() {
  const value = await win.evaluate(async (id) => {
    const result = await globalThis.window.nomiDesktop.assets.list({ projectId: id })
    const rows = Array.isArray(result) ? result : result.items || []
    return { count: rows.length, assets: rows.map((a) => ({ id: a.id, name: a.name, kind: a.data?.kind || a.data?.assetType || (a.name.endsWith('.png') ? 'image' : a.name.endsWith('.mp4') ? 'video' : 'unknown') })) }
  }, projectId)
  report.assetSnapshots = [...(report.assetSnapshots || []), value]; save(); return value
}
console.log(JSON.stringify({ ready: true, build, catalog: await catalog(), initial: await inspect(), screenshot: await snapshot(runLabel === 'latest187' ? 'latest187-01-library' : runLabel === 'fixed' ? '11-fixed-build-library' : runLabel === 'reopen' ? '09-reopened-library' : '01-initial') }))
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
try {
  for await (const line of input) {
    if (!line.trim()) continue
    const command = JSON.parse(line)
    try {
      let result
      if (command.action === 'close') { console.log(JSON.stringify({ closed: true })); break }
      if (command.action === 'click') { await win.locator(command.selector).click({ timeout: 6000 }); result = { clicked: command.selector } }
      else if (command.action === 'doubleClick') { await win.locator(command.selector).dblclick({ timeout: 6000 }); result = { doubleClicked: command.selector } }
      else if (command.action === 'key') { await win.keyboard.press(command.key); result = { key: command.key } }
      else if (command.action === 'snapshot') result = await snapshot(command.name)
      else if (command.action === 'wait') { await win.locator(command.selector).waitFor({ state: 'visible', timeout: 15000 }); result = { visible: command.selector } }
      else if (command.action === 'inspect') result = await inspect()
      else if (command.action === 'catalog') result = await catalog()
      else if (command.action === 'assets') result = await assets()
      else if (command.action === 'scroll') { await win.locator(command.selector).scrollIntoViewIfNeeded(); result = { scrolled: command.selector } }
      else if (command.action === 'reload') { await win.reload(); await win.waitForLoadState('domcontentloaded'); result = { reloaded: true } }
      else if (command.action === 'visibleText') result = await win.locator(command.selector).innerText()
      else throw new Error('Unknown readonly walkthrough command')
      report.actions.push(command); save(); console.log(JSON.stringify({ ok: true, result }))
    } catch (error) { report.actions.push({ ...command, failed: true, reason: String(error.message).slice(0, 200) }); save(); console.log(JSON.stringify({ ok: false, error: String(error.message).slice(0, 400) })) }
  }
} finally { input.close(); save(); await close() }
