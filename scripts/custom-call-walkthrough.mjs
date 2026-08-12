// R13 真机走查：自定义调用编辑器全链（模型行入口 → 编辑器弹窗 → 插入模板 → 试跑失败态摊开 → 试跑成功）。
// 试跑打到本脚本起的 mock 中转（先 400 再 200），验证 transcript 摊开与 AI 修复入口。截图人眼判断。
// 用法：node scripts/custom-call-walkthrough.mjs
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, mkdtempSync } from 'node:fs'
import os from 'node:os'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, '.custom-call-recon')
mkdirSync(outDir, { recursive: true })
const settingsDir = mkdtempSync(path.join(os.tmpdir(), 'custom-call-walk-'))
const shot = async (win, name) => { await win.screenshot({ path: path.join(outDir, name) }); console.log('  📸 ' + name) }

// mock 中转：第一发 /images/generations 返回 400（unknown field），第二发起返回 200 图。
let hits = 0
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const mock = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    hits += 1
    if (hits === 1) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown field: image_url, did you mean first_frame_image?' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: [{ b64_json: PNG }] }))
  })
})
await new Promise((r) => mock.listen(8791, '127.0.0.1', r))
console.log('  🟢 mock relay on 127.0.0.1:8791')

const { app, win } = await launchNomiApp({
  name: 'custom-call',
  settingsDir,
  env: { NOMI_RENDERER_URL: 'file://' + path.join(repoRoot, 'dist', 'index.html') },
  settleMs: 1600,
})
const errors = []
try {
  const bw = await app.browserWindow(win)
  await bw.evaluate((w) => w.setBounds({ x: 0, y: 0, width: 1440, height: 1000 })).catch(() => {})
  win.on('pageerror', (e) => errors.push(String(e)))
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  const skip = win.getByRole('button', { name: /跳过|Skip/ }).first()
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await win.waitForTimeout(300)

  // 种一个自定义中转家（地址=mock，一个图像模型 seedream，一个文本模型当 AI 帮写脑）。
  await win.evaluate(() => {
    const b = window.nomiDesktop
    b.modelCatalog.upsertVendor({ key: 'custom-mock-relay', name: '我的中转站', baseUrlHint: 'http://127.0.0.1:8791/v1', protocol: 'openai', authType: 'bearer' })
    b.modelCatalog.upsertVendorApiKey('custom-mock-relay', { apiKey: 'sk-mock', enabled: true })
    b.modelCatalog.upsertModel({ vendorKey: 'custom-mock-relay', modelKey: 'seedream-4', labelZh: 'seedream-4', kind: 'image', enabled: true })
    window.dispatchEvent(new CustomEvent('nomi-model-catalog-changed'))
  })
  await win.waitForTimeout(300)

  // 打开模型设置面板 + 展开卡。
  const openBtn = win.getByRole('button', { name: /模型接入|模型设置/ }).first()
  if (await openBtn.isVisible().catch(() => false)) await openBtn.click()
  else await win.evaluate(() => window.dispatchEvent(new CustomEvent('nomi-open-model-catalog')))
  await win.waitForTimeout(700)
  await win.getByText('我的中转站', { exact: false }).first().click()
  await win.waitForTimeout(500)
  await shot(win, 'w1-model-row-with-customcall-icon.png')

  // 点模型行的「自定义调用」图标（IconCode，title=自定义调用）。
  await win.locator('[title="自定义调用"]').first().click()
  await win.waitForTimeout(600)
  await shot(win, 'w2-editor-opened.png')

  // 插入「OpenAI 图」模板。
  const tplBtn = win.getByRole('button', { name: /OpenAI 图/ }).first()
  if (await tplBtn.isVisible().catch(() => false)) await tplBtn.click()
  await win.waitForTimeout(300)
  await shot(win, 'w3-template-inserted.png')

  // 试跑（第一发 400 → 失败态摊开 transcript + AI 修复入口）。
  await win.getByRole('button', { name: /试跑一次/ }).first().click()
  await win.waitForTimeout(2500)
  await shot(win, 'w4-testrun-failed.png')

  // 再试跑（第二发 200 → 成功 + 缩略图）。
  await win.getByRole('button', { name: /试跑一次/ }).first().click()
  await win.waitForTimeout(2500)
  await shot(win, 'w5-testrun-ok.png')

  console.log('  ℹ️ mock hits=' + hits + ' pageErrors=' + errors.length)
  if (errors.length) console.log('  ⚠️ ' + errors.slice(0, 4).join(' | '))
} finally {
  await app.close().catch(() => {})
  mock.close()
}
console.log('done → ' + outDir)
