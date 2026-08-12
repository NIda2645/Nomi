// R13 真机走查：ComfyUI ws 进度环 + 活预览帧 + 遮罩取消（P 轨 · 拍板 A 位）。
// mock ComfyUI：HTTP(/prompt /history /object_info /queue /interrupt) + 手搓 RFC6455 ws
// 服务器（零依赖）持续推 executing/progress 事件与二进制预览帧；/history 永不完成 →
// 只有取消能结束任务。验：① 遮罩出现确定圆环+节点人话+取消钮+预览帧 ② 点取消 → /interrupt
// 被打 + 节点回 idle（无红错误卡）。
// 用法：pnpm build && node scripts/comfyui-progress-walkthrough.mjs
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'
import http from 'node:http'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, '.comfyui-progress-walk')
mkdirSync(outDir, { recursive: true })
const settingsDir = mkdtempSync(path.join(os.tmpdir(), 'comfyui-progress-walk-'))
const shot = async (win, name) => { await win.screenshot({ path: path.join(outDir, name) }); console.log('  📸 ' + name) }

// 预置 catalog：只启用 comfyui-local（seed 会补 curated 模型/映射）→ 图片节点默认模型 = 本地文生图。
writeFileSync(path.join(settingsDir, 'model-catalog.json'), JSON.stringify({
  version: 8,
  vendors: [
    { key: 'comfyui-local', name: '本地 ComfyUI', enabled: true, baseUrlHint: 'http://127.0.0.1:8188', authType: 'none', authHeader: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
    // 其它免 key 本地后端显式停用（enabled 属用户数据、seed 尊重）→ ComfyUI 成为唯一可执行模型 = 默认模型。
    { key: 'dreamina', name: '即梦', enabled: false, authType: 'none', authHeader: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
    { key: 'codex-local', name: 'Codex', enabled: false, authType: 'none', authHeader: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
  ],
  models: [], mappings: [], apiKeysByVendor: {},
}))

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const PROMPT_ID = 'walk-progress-1'
let interruptHits = 0
let promptSubmitted = false

// ── 手搓 ws（只需要 server→client 单向推送；client 帧全忽略）──
const wsClients = new Set()
const wsFrame = (payload, opcode) => {
  const len = payload.length
  const head = len < 126 ? Buffer.from([0x80 | opcode, len])
    : Buffer.concat([Buffer.from([0x80 | opcode, 126]), (() => { const b = Buffer.alloc(2); b.writeUInt16BE(len); return b })()])
  return Buffer.concat([head, payload])
}
const wsSendJson = (obj) => { const f = wsFrame(Buffer.from(JSON.stringify(obj)), 0x1); for (const s of wsClients) s.write(f) }
const wsSendBinary = (buf) => { const f = wsFrame(buf, 0x2); for (const s of wsClients) s.write(f) }

const mock = http.createServer((req, res) => {
  const url = req.url || ''
  if (url.startsWith('/system_stats')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ system: { python_version: '3.11.9', comfyui_version: '0.3.30' }, devices: [{ name: 'cuda:0', vram_total: 1 }] }))
    return
  }
  if (url.startsWith('/object_info/CheckpointLoaderSimple')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [['walk-sd15.safetensors']] } } } }))
    return
  }
  if (req.method === 'POST' && url === '/prompt') {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      promptSubmitted = true
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ prompt_id: PROMPT_ID, number: 1 }))
    })
    return
  }
  if (url.startsWith('/history/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    // 取消前永不完成；取消后回 interrupted（真实 ComfyUI 行为）
    res.end(interruptHits === 0 ? JSON.stringify({}) : JSON.stringify({
      [PROMPT_ID]: { status: { status_str: 'error', completed: false, messages: [['execution_interrupted', { prompt_id: PROMPT_ID }]] }, outputs: {} },
    }))
    return
  }
  if (url.startsWith('/queue') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ queue_running: [], queue_pending: [] }))
    return
  }
  if (req.method === 'POST' && (url === '/interrupt' || url === '/queue')) {
    interruptHits += 1
    res.writeHead(200); res.end('{}')
    return
  }
  res.writeHead(404); res.end()
})
mock.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n')
  wsClients.add(socket)
  socket.on('close', () => wsClients.delete(socket))
  socket.on('error', () => wsClients.delete(socket))
  socket.on('data', () => {}) // client 帧（含 close）忽略
})
await new Promise((r) => mock.listen(8188, '127.0.0.1', r))

// 提交后持续推 ws 事件：4 节点图（内置文生图），走到第 3 个节点 KSampler 的一半（永不完成）。
const NODES = ['4', '5', '6', '3'] // CheckpointLoader → EmptyLatent → CLIPTextEncode → KSampler
const CLASSES = { 4: 'CheckpointLoaderSimple', 5: 'EmptyLatentImage', 6: 'CLIPTextEncode', 3: 'KSampler' }
let tick = 0
const pump = setInterval(() => {
  if (!promptSubmitted || wsClients.size === 0) return
  tick += 1
  if (tick === 1) wsSendJson({ type: 'execution_start', data: { prompt_id: PROMPT_ID } })
  const nodeIndex = Math.min(NODES.length - 1, Math.floor(tick / 3))
  const node = NODES[nodeIndex]
  wsSendJson({ type: 'executing', data: { prompt_id: PROMPT_ID, node } })
  wsSendJson({ type: 'progress', data: { prompt_id: PROMPT_ID, node, value: (tick % 3) + 1, max: 4 } })
  void CLASSES
  if (tick >= 4) {
    // 二进制预览帧：[>I 1=PREVIEW_IMAGE][>I 2=PNG][png bytes]
    const head = Buffer.alloc(8)
    head.writeUInt32BE(1, 0)
    head.writeUInt32BE(2, 4)
    wsSendBinary(Buffer.concat([head, PNG_1x1]))
  }
}, 600)

const { app, win } = await launchNomiApp({
  name: 'comfyui-progress',
  settingsDir,
  projectsDir: mkdtempSync(path.join(os.tmpdir(), 'comfyui-progress-proj-')),
  env: { NOMI_RENDERER_URL: 'file://' + path.join(repoRoot, 'dist', 'index.html') },
  settleMs: 1800,
})
const errors = []
try {
  const bw = await app.browserWindow(win)
  await bw.evaluate((w) => w.setBounds({ x: 0, y: 0, width: 1680, height: 1020 })).catch(() => {})
  win.on('pageerror', (e) => errors.push(String(e)))
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await win.getByText('新建空白项目', { exact: false }).first().click()
  await win.waitForTimeout(2500)
  await win.locator('[aria-label="工作区切换"]').getByText('生成', { exact: true }).click()
  await win.waitForTimeout(1500)

  await win.locator('[aria-label="添加图片节点"]').first().click()
  await win.waitForTimeout(1200)
  const editor = win.locator('div[contenteditable="true"]').last()
  await editor.click()
  await win.keyboard.type('一只奔跑的橘猫', { delay: 10 })
  await win.waitForTimeout(400)

  // 单节点：直接点 composer 的「生成素材」按钮 → 轻确认
  await win.getByRole('button', { name: '生成素材', exact: true }).first().click()
  await win.getByText('开始生成', { exact: true }).first().waitFor({ timeout: 8000 })
  await win.locator('.fixed.inset-0').last().getByRole('button', { name: '生成', exact: true }).first().click()

  // 等 ws 进度爬起来（提交 + watch + 几拍事件）
  await win.waitForTimeout(5000)
  await shot(win, '01-progress-ring-and-label.png') // 验：确定圆环 + 「XX · 第 N/4 个节点」chip + 取消 pill + 活预览帧
  const cancelBtn = win.getByRole('button', { name: '取消这次 ComfyUI 生成', exact: true })
  const cancelCount = await cancelBtn.count()
  console.log('  取消钮可见: ' + (cancelCount > 0))
  if (cancelCount === 0) throw new Error('遮罩取消钮没出现')

  await cancelBtn.first().click()
  await win.waitForTimeout(2500)
  await shot(win, '02-cancelled-back-to-idle.png') // 验：遮罩消失、节点回 idle、无红错误卡
  console.log('  /interrupt 或 /queue delete 命中次数: ' + interruptHits)
  if (interruptHits === 0) throw new Error('取消没有打到 /interrupt')
  const overlayGone = (await win.locator('.generation-canvas-v2-node__generating-overlay').count()) === 0
  console.log('  遮罩已消失: ' + overlayGone)

  console.log(errors.length ? ('  ⚠️ console/page errors:\n' + errors.slice(0, 8).join('\n')) : '  ✅ 无 console/page error')
} catch (e) {
  console.error('  ❌ 走查失败：', e)
  try { const w = await app.firstWindow(); await shot(w, 'ERROR.png') } catch { /* noop */ }
  process.exitCode = 1
} finally {
  clearInterval(pump)
  await app.close()
  mock.close()
  for (const s of wsClients) try { s.destroy() } catch { /* noop */ }
}
