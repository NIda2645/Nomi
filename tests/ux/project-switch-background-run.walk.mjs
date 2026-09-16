// R13 走查 —— 后台生成 / 截图热键提交后切项目（PR 802 根因修复的真实入口验收）。
// 用法: node tests/ux/project-switch-background-run.walk.mjs   产出: tests/ux/shots/project-switch-background-run/*.png
//
// 已批准行为：已提交的后台生成属于**原项目**，切项目不取消它；结局落回原项目（原项目不在前台就写它的盘上
// 副本），新项目零副作用。这条走查像真人一样点：项目库新建 A → 画布加图片节点、写提示词 → 批量生成确认 →
// 供应商请求在途时回项目库新建 B → 放行供应商 → B 的画布与盘上文件都不变 → 从项目库回到 A，节点上就是结果。
//
// 诚实边界：供应商是本机 loopback HTTP（不付费、不出网）；UI、付费确认、队列、IPC、结果落盘、项目库都是生产路径。
// 截图热键那段需要 macOS 屏幕录制权限：开发 Electron 没授权时如实记为 skipped，不假装验过。
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchNomiApp } from './_launchApp.mjs'
import { findCanvasBlankPoint } from './_canvasHit.mjs'
import { clickOrFail, expect, expectAbsent, proveProbe, screenshotSettled } from './_assert.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const shotsDir = path.join(repoRoot, 'tests/ux/shots/project-switch-background-run')
fs.rmSync(shotsDir, { recursive: true, force: true })
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-project-switch-run-'))
const userDataDir = path.join(tempRoot, 'user-data')
const settingsDir = path.join(tempRoot, 'settings')
const projectsDir = path.join(tempRoot, 'projects')
for (const dir of [shotsDir, userDataDir, settingsDir, projectsDir]) fs.mkdirSync(dir, { recursive: true })

const NOW = '2026-09-17T00:00:00.000Z'
const VENDOR = 'switch-loopback'
const IMAGE_MODEL = 'switch-image'
const PROMPT = '切项目后仍属于原项目的后台图'
const imageBytes = fs.readFileSync(path.join(repoRoot, 'resources/onboarding-demo/shot-4.jpg'))
const imageDataUrl = `data:image/jpeg;base64,${imageBytes.toString('base64')}`

// ── loopback 供应商：请求进来先挂住，由走查在「已切到 B」之后才放行 ─────────────
const wireCalls = []
const heldResponses = []
const vendorServer = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { body = {} }
    if (req.method !== 'POST' || req.url !== '/v1/images/generations') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: `No route ${req.method} ${req.url}` } }))
      return
    }
    wireCalls.push({ model: String(body.model || ''), prompt: String(body.prompt || ''), at: Date.now() })
    heldResponses.push(() => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: [{ url: imageDataUrl }] }))
    })
  })
})
await new Promise((resolve) => vendorServer.listen(0, '127.0.0.1', resolve))
const port = vendorServer.address().port

fs.writeFileSync(path.join(settingsDir, 'model-catalog.json'), JSON.stringify({
  version: 8,
  vendors: [{
    key: VENDOR, name: 'Switch Loopback', enabled: true, baseUrlHint: `http://127.0.0.1:${port}`,
    assetIngestion: { strategy: 'inline-base64', accepts: ['image'] },
    authType: 'none', authHeader: null, authQueryParam: null, providerKind: 'openai-compatible',
    createdAt: NOW, updatedAt: NOW,
  }],
  models: [{ modelKey: IMAGE_MODEL, vendorKey: VENDOR, labelZh: '切项目图片', kind: 'image', enabled: true, meta: { archetypeId: 'agnes-image' }, createdAt: NOW, updatedAt: NOW }],
  mappings: [{
    id: `${IMAGE_MODEL}-text_to_image`, vendorKey: VENDOR, taskKind: 'text_to_image', modelKey: IMAGE_MODEL,
    name: `${IMAGE_MODEL} text_to_image`, enabled: true,
    create: {
      method: 'POST', path: '/v1/images/generations', headers: { 'Content-Type': 'application/json' },
      body: { model: '{{model.modelKey}}', prompt: '{{request.prompt}}', size: '{{request.params.size}}', extra_body: { response_format: 'url' } },
      response_mapping: { image_url: 'data.0.url' },
      defaultParams: { size: '1024x1024' },
    },
    createdAt: NOW, updatedAt: NOW,
  }],
  apiKeysByVendor: {},
}, null, 2))

const report = { provider: 'loopback-http', paidCalls: 0, wireCalls, screenshots: [], screenshotHotkey: 'not-run', checks: [] }
let shotIndex = 0
async function snap(win, name) {
  shotIndex += 1
  const file = path.join(shotsDir, `${String(shotIndex).padStart(2, '0')}-${name}.png`)
  await screenshotSettled(win, { path: file })
  report.screenshots.push(file)
  console.log(`  screenshot: ${path.basename(file)}`)
}
function check(condition, message, details = '') {
  if (!condition) throw new Error(`${message}${details ? `: ${details}` : ''}`)
  report.checks.push(message)
  console.log(`  ok: ${message}`)
}

async function currentProjectId(win) {
  return win.evaluate(() => {
    const url = new URL(location.href)
    return url.searchParams.get('projectId') ?? new URLSearchParams(url.hash.split('?')[1] ?? '').get('projectId')
  })
}
async function projectRoot(win, projectId) {
  const summaries = await win.evaluate(() => window.nomiDesktop.projects.listAsync())
  const root = summaries.find((item) => item.id === projectId)?.rootPath
  check(Boolean(root) && !path.relative(projectsDir, root).startsWith('..'), `项目 ${projectId} 落在隔离项目目录里`)
  return root
}
function readCanvas(root) {
  const file = path.join(root, '.nomi', 'project.json')
  return JSON.parse(fs.readFileSync(file, 'utf8')).payload.generationCanvas ?? { nodes: [], edges: [] }
}
/** 项目目录下每个文件的 路径→大小（不含 .nomi 元数据），用来证明「零副作用」。 */
function mediaFiles(root) {
  const out = {}
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      const rel = path.relative(root, full)
      if (rel === '.nomi') continue
      if (entry.isDirectory()) walk(full)
      else out[rel] = fs.statSync(full).size
    }
  }
  walk(root)
  return out
}

async function newBlankProject(win) {
  await clickOrFail(win.getByRole('button', { name: /^新建空白项目/ }).first(), '新建空白项目')
  await expect.poll(() => currentProjectId(win), { message: '新建后地址栏带上新项目 id', timeout: 30_000 }).toMatch(/^project-/)
  await clickOrFail(win.locator('[aria-label="工作区切换"]').getByText('生成', { exact: true }), '切到生成区')
  await expect(win.locator('.generation-canvas-v2__stage')).toBeVisible({ timeout: 30_000 })
  return currentProjectId(win)
}
async function backToLibrary(win) {
  await clickOrFail(win.getByRole('button', { name: '返回项目库', exact: true }), '返回项目库')
  await expect(win.getByRole('button', { name: /^新建空白项目/ }).first()).toBeVisible({ timeout: 30_000 })
}
async function openFromLibrary(win, projectId) {
  const card = win.locator(`[data-project-card="true"][data-project-id="${projectId}"]`)
  await expect(card, '项目库里看得见原项目卡片').toBeVisible({ timeout: 30_000 })
  await card.hover()
  await clickOrFail(card.getByRole('button', { name: /继续创作/ }), '继续创作原项目')
  await expect.poll(() => currentProjectId(win), { message: '回到原项目', timeout: 30_000 }).toBe(projectId)
}

const pageErrors = []
const { app, win } = await launchNomiApp({
  name: 'project-switch-background-run',
  userDataDir, settingsDir, projectsDir,
  settleMs: 0,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  initialLocalStorage: { 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen', 'nomi:canvas-gesture-hint:v1': 'seen' },
  env: { NOMI_RENDERER_URL: `file://${path.join(repoRoot, 'dist/index.html')}` },
})
win.on('pageerror', (error) => pageErrors.push(String(error)))

try {
  // ── 幕一 · 项目 A：真人点出一个图片节点并提交生成 ───────────────────────────────
  const projectA = await newBlankProject(win)
  const rootA = await projectRoot(win, projectA)
  await clickOrFail(win.locator('[aria-label="添加图片节点"]').first(), '添加图片节点')
  const nodeA = win.locator('[data-kind="image"][data-node-id]').last()
  await expect(nodeA).toBeVisible({ timeout: 10_000 })
  const nodeId = await nodeA.getAttribute('data-node-id')
  const editor = win.locator(`[data-node-id="${nodeId}"] div[contenteditable="true"]`).last()
  await editor.click()
  await editor.fill(PROMPT)
  const blank = await findCanvasBlankPoint(win)
  check(Boolean(blank), '画布上找得到空白处取消选择')
  await win.mouse.click(blank.x, blank.y)

  const generateAll = win.locator('[data-batch-scope="all"]')
  await expect(generateAll, '有待生成节点时出现批量生成入口').toBeVisible({ timeout: 10_000 })
  await clickOrFail(generateAll, '生成全部')
  const spend = win.locator('div.fixed.inset-0').filter({ hasText: /开始生成/ }).last()
  await expect(spend, '提交前先看报价确认').toBeVisible({ timeout: 10_000 })
  await clickOrFail(spend.getByRole('button', { name: '生成', exact: true }), '确认生成')
  await expect.poll(() => wireCalls.length, { message: '供应商收到请求（挂住未回）', timeout: 30_000 }).toBe(1)
  check(wireCalls[0].prompt.includes(PROMPT), '请求就是 A 节点的提示词')
  await expect(win.locator(`[data-node-id="${nodeId}"]`)).toHaveAttribute('data-status', /queued|running/)
  await snap(win, 'a-generation-in-flight')

  // ── 幕二 · 请求在途时切到新项目 B ───────────────────────────────────────────────
  await backToLibrary(win)
  const projectB = await newBlankProject(win)
  check(projectB !== projectA, '切到的是另一个项目')
  const rootB = await projectRoot(win, projectB)
  const bNodesProbe = await proveProbe(win.locator('.generation-canvas-v2__stage'), 'B 的画布舞台已渲染（节点缺席断言有信号）')
  const bFilesBefore = mediaFiles(rootB)

  // 放行供应商：结果必须回 A，不能落进正打开的 B。
  heldResponses.splice(0).forEach((release) => release())
  await expect.poll(() => readCanvas(rootA).nodes.find((node) => node.id === nodeId)?.status,
    { message: 'A 在后台（盘上副本）收到成功结局', timeout: 60_000 }).toBe('success')
  const deliveredA = readCanvas(rootA).nodes.find((node) => node.id === nodeId)
  const resultUrl = String(deliveredA?.result?.url || '')
  check(Boolean(resultUrl) && !resultUrl.startsWith('data:'), 'A 节点结果已本地化为项目素材', resultUrl.slice(0, 80))
  const aFiles = Object.keys(mediaFiles(rootA))
  check(aFiles.some((file) => /\.(jpe?g|png|webp)$/i.test(file)), 'A 项目目录里有这张图', aFiles.join(','))

  await expectAbsent(win.locator('.react-flow__node'), { provenBy: bNodesProbe, message: 'B 画布上没有冒出任何节点' })
  const bCanvasNodes = (() => { try { return readCanvas(rootB).nodes } catch { return [] } })()
  check(bCanvasNodes.length === 0, 'B 的盘上画布零节点', JSON.stringify(bCanvasNodes.map((node) => node.id)))
  check(JSON.stringify(mediaFiles(rootB)) === JSON.stringify(bFilesBefore), 'B 项目目录文件零变化')
  check(wireCalls.length === 1, '全程只发了 1 次供应商请求（切项目没有重发）')
  await snap(win, 'b-untouched-after-a-result')

  // ── 幕三 · 回到 A：节点上就是结果 ───────────────────────────────────────────────
  await backToLibrary(win)
  await openFromLibrary(win, projectA)
  await clickOrFail(win.locator('[aria-label="工作区切换"]').getByText('生成', { exact: true }), '切到生成区')
  await expect(win.locator(`[data-node-id="${nodeId}"]`), '回到 A 节点显示成功').toHaveAttribute('data-status', 'success', { timeout: 30_000 })
  await expect(win.locator(`[data-node-id="${nodeId}"] img`).first(), 'A 节点上看得见生成图').toBeVisible({ timeout: 30_000 })
  await snap(win, 'a-result-on-return')

  // ── 幕四 · 截图热键：A 里抓屏后切到 B，截图不落 B ─────────────────────────────
  const screenAccess = await app.evaluate(async ({ systemPreferences }) => {
    try { return process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted' } catch { return 'unknown' }
  })
  if (screenAccess !== 'granted') {
    report.screenshotHotkey = `skipped: screen recording permission is ${screenAccess} for the development Electron binary`
    console.log(`  · ${report.screenshotHotkey}`)
  } else {
    const aFilesBefore = new Set(Object.keys(mediaFiles(rootA)))
    await win.evaluate(() => window.nomiDesktop.screenshot.e2eCapture())
    const crop = win.locator('[data-screenshot-crop]')
    await expect(crop, 'A 里抓屏弹出选区面板').toBeVisible({ timeout: 30_000 })
    const aNewFiles = Object.keys(mediaFiles(rootA)).filter((file) => !aFilesBefore.has(file))
    check(aNewFiles.some((file) => /screenshot-\d+\.png$/.test(file)), '整屏原图落进 A 的素材', aNewFiles.join(','))
    const cropProbe = await proveProbe(crop, '选区面板在 A 里确实可见')
    await win.keyboard.press('Escape')
    await expectAbsent(crop, { provenBy: cropProbe, message: 'Esc 关闭选区面板' })
    await backToLibrary(win)
    await openFromLibrary(win, projectB)
    await clickOrFail(win.locator('[aria-label="工作区切换"]').getByText('生成', { exact: true }), '切到生成区')
    await expectAbsent(crop, { provenBy: cropProbe, message: 'B 里不会弹出 A 的选区面板' })
    check(readCanvas(rootB).nodes.length === 0 && JSON.stringify(mediaFiles(rootB)) === JSON.stringify(bFilesBefore), '截图后切到 B：B 画布与文件仍零变化')
    // 抓屏在途时就切项目：不等 e2eCapture 返回，立刻回项目库打开 B。无论抓屏赶在切走前还是后完成，
    // B 都不能弹面板、不能多文件；A 是否多一张原图只记录不判定（取决于 desktopCapturer 快慢）。
    await backToLibrary(win)
    await openFromLibrary(win, projectA)
    await clickOrFail(win.locator('[aria-label="工作区切换"]').getByText('生成', { exact: true }), '切到生成区')
    const aBeforeRace = new Set(Object.keys(mediaFiles(rootA)))
    const inFlightCapture = win.evaluate(() => window.nomiDesktop.screenshot.e2eCapture().then(() => 'ok', (error) => String(error)))
    await backToLibrary(win)
    await openFromLibrary(win, projectB)
    report.screenshotRaceCaptureResult = await inFlightCapture
    await clickOrFail(win.locator('[aria-label="工作区切换"]').getByText('生成', { exact: true }), '切到生成区')
    await expectAbsent(crop, { provenBy: cropProbe, message: '抓屏在途切到 B：B 里不弹选区面板' })
    check(readCanvas(rootB).nodes.length === 0 && JSON.stringify(mediaFiles(rootB)) === JSON.stringify(bFilesBefore), '抓屏在途切到 B：B 画布与文件零变化')
    report.screenshotRaceNewFilesInA = Object.keys(mediaFiles(rootA)).filter((file) => !aBeforeRace.has(file))
    report.screenshotHotkey = 'passed'
    await snap(win, 'b-after-screenshot-in-a')
  }

  check(pageErrors.length === 0, '页面无 pageerror', pageErrors.join(' | '))
  report.result = 'passed'
  console.log('PROJECT SWITCH BACKGROUND RUN WALK: PASS')
} catch (error) {
  report.result = 'failed'
  report.error = String(error?.stack || error)
  await win.screenshot({ path: path.join(shotsDir, 'failure.png') }).catch(() => {})
  throw error
} finally {
  heldResponses.splice(0).forEach((release) => release())
  fs.writeFileSync(path.join(shotsDir, 'report.json'), JSON.stringify(report, null, 2))
  await app.close().catch(() => {})
  await new Promise((resolve) => vendorServer.close(resolve))
}
