// Shared infra for real-process MCP journeys (extends the pattern proven in
// production-mcp-journey.e2e.mjs). Kept as a helper so J-MCP1 (mcp-journey.e2e.mjs) and any future
// real-transport MCP test reuse ONE spawn/framing/teardown/mock-vendor implementation (P1: no copy-paste).
//
// Transport under test = the REAL in-Electron MCP stdio server: `electron <repoRoot>` with
// NOMI_MCP_STDIO=1. That process is genuinely headless (no window, app.dock.hide, disk gateway) and
// speaks real newline-delimited JSON-RPC 2.0 over stdio — the exact framing mcpProtocol.ts implements.
// It is the same real-process transport production-mcp-journey uses; see mcp-journey.e2e.mjs header for
// why this (not the bare-Node mcpNodeLauncher wrapper) is the faithful path for a zero-dialog headless
// spend: the launcher always ensures a *GUI* app instance whose unopened-project spend routes through
// the renderer confirm card (createHybridGateway) and cannot complete without a human click, whereas the
// headless stdio server routes spend through elicitation → makeConfirmedGateway (mcpStdioServer.ts:99).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { withLinuxNoSandbox } from './_launchApp.mjs'

const require = createRequire(import.meta.url)
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Assert dist-electron is built (the stdio server runs compiled JS, mirroring _launchApp.assertBuilt). */
export function assertBuilt() {
  const mainEntry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).main
  const entryPath = path.join(repoRoot, mainEntry)
  if (!fs.existsSync(entryPath)) {
    throw new Error(
      `Electron main entry missing: ${mainEntry}\n→ the MCP stdio server runs the dist-electron build, run: pnpm run build`,
    )
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A tiny loopback "vendor" HTTP server. runTask's no-mapping fallback POSTs to
 * `{baseUrl}/v1/images/generations` and `{baseUrl}/v1/videos/generations` (runtime.ts). We answer with an
 * OpenAI-images-shaped body carrying a `data:` URL, so the REAL request pipeline (requestJson → fetch) and
 * REAL asset store (importRemoteAsset decodes the data URL → writeAsset → nomi-local:// asset) both run,
 * with zero provider quota. The image is a real, decodable PNG so T2's nativeImage thumbnail block fires.
 *
 * Returns { origin, url(s hit), close }. Records every request for assertion/debugging.
 */
export async function startMockVendorServer() {
  const http = await import('node:http')
  const hits = []
  // A real 16x16 opaque PNG (deterministic bytes) — decodable by nativeImage.createFromBuffer so the
  // thumbnail enrichment can resize + re-encode it to a JPEG image content block.
  const pngBytes = buildTinyPng()
  const pngDataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`

  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      hits.push({ url: req.url, method: req.method })
      // Image + video both resolve to the same tiny PNG data URL. Video's fallback localizer sets
      // thumbnailUrl:null (runtime.localizeTaskAsset), so the video result legitimately carries no image
      // block — exactly T2's "video may omit" rule; the harness asserts images strictly, video loosely.
      const payload = JSON.stringify({ created: Date.now(), data: [{ url: pngDataUrl }] })
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) })
      res.end(payload)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    origin: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/** Deterministic minimal PNG (16x16, single IDAT, solid teal). Hand-built so no asset file is needed. */
function buildTinyPng() {
  const zlib = require('node:zlib')
  const width = 16
  const height = 16
  // Raw RGBA scanlines, each prefixed with a filter byte (0 = none).
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4)
    raw[rowStart] = 0
    for (let x = 0; x < width; x += 1) {
      const p = rowStart + 1 + x * 4
      raw[p] = 32 // R
      raw[p + 1] = 160 // G
      raw[p + 2] = 160 // B
      raw[p + 3] = 255 // A
    }
  }
  const idat = zlib.deflateSync(raw)
  const chunk = (type, data) => {
    const typeBuf = Buffer.from(type, 'ascii')
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(data.length, 0)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0)
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff]
  return crc ^ -1
}

/**
 * Write an ISOLATED synthetic model catalog into settingsDir/model-catalog.json.
 * Shapes it for J-MCP1 step (e): a usable no-key mock vendor (authType none → keyStatus ok) exposing an
 * image and a video model, PLUS a real no-key vendor kept enabled so nomi_list_models must flag it
 * not-usable (keyStatus missing) rather than hide it. mockOrigin points the mock vendor at the loopback
 * server so runTask's fallback path reaches it.
 */
export function writeIsolatedCatalog(settingsDir, mockOrigin) {
  const now = new Date().toISOString()
  const catalog = {
    version: 3,
    vendors: [
      {
        key: 'nomi-mock', name: 'Nomi Mock Vendor', enabled: true,
        baseUrlHint: mockOrigin, authType: 'none', providerKind: 'openai-compatible',
        createdAt: now, updatedAt: now,
      },
      {
        // A real no-key vendor left enabled on purpose: list_models must say "missing key", not hide it.
        key: 'apimart', name: 'APImart', enabled: true,
        baseUrlHint: 'https://api.apimart.ai', authType: 'bearer', authHeader: 'Authorization',
        providerKind: 'openai-compatible', createdAt: now, updatedAt: now,
      },
    ],
    models: [
      { modelKey: 'nomi-mock-image', vendorKey: 'nomi-mock', labelZh: 'Mock 图片', kind: 'image', enabled: true, createdAt: now, updatedAt: now },
      { modelKey: 'nomi-mock-video', vendorKey: 'nomi-mock', labelZh: 'Mock 视频', kind: 'video', enabled: true, createdAt: now, updatedAt: now },
      { modelKey: 'apimart-image-nokey', vendorKey: 'apimart', labelZh: 'APImart 图片(无Key)', kind: 'image', enabled: true, createdAt: now, updatedAt: now },
    ],
    mappings: [],
    apiKeysByVendor: {},
  }
  fs.writeFileSync(path.join(settingsDir, 'model-catalog.json'), JSON.stringify(catalog), 'utf8')
}

/**
 * Spawn the real in-Electron MCP stdio server (headless) and return a JSON-RPC client.
 * The client:
 *   · declares elicitation capability at initialize (so plan/spend confirmations route to chat), and
 *   · attaches _meta.progressToken on long calls (so notifications/progress frames are emitted),
 *   · auto-accepts every server→client elicitation/create (records elicitationUsed), and
 *   · buffers notifications/progress per progressToken (records progressNotifs).
 *
 * env is fully isolated: caller passes settingsDir / userDataDir / projectsDir / capabilityDir.
 * NOMI_LOOP_SPEND_OK is intentionally NOT set — spend must flow through elicitation → makeConfirmedGateway,
 * proving the headless zero-dialog spend path (mcpStdioServer.ts:99), not an env escape hatch.
 */
export function spawnMcpStdioClient({ settingsDir, userDataDir, projectsDir, capabilityDir, clientInfo }) {
  const child = spawn(require('electron'), withLinuxNoSandbox([repoRoot, '--disable-gpu']), {
    cwd: repoRoot,
    env: {
      ...process.env,
      NOMI_E2E: '1',
      NOMI_E2E_ALLOW_MULTI_INSTANCE: '1',
      NOMI_MCP_STDIO: '1',
      NOMI_SETTINGS_DIR: settingsDir,
      NOMI_ELECTRON_USER_DATA_DIR: userDataDir,
      NOMI_PROJECTS_DIR: projectsDir,
      NOMI_CAPABILITY_DIR: capabilityDir,
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  const pending = new Map()
  let seq = 0
  // Progress frames observed per progressToken (token → count). elicitation acceptance counter.
  const progressByToken = new Map()
  let elicitationCount = 0
  let childExit = null

  child.on('exit', (code, signal) => { childExit = { code, signal } })

  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const text = line.trim()
    if (!text.startsWith('{')) return
    let msg
    try { msg = JSON.parse(text) } catch { return }
    // Server→client request: elicitation/create → auto-accept (headless test authorization).
    if (msg.method === 'elicitation/create' && msg.id != null) {
      elicitationCount += 1
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { action: 'accept', content: { confirm: true } } }) + '\n')
      return
    }
    // Server→client notification: progress frame → tally per token.
    if (msg.method === 'notifications/progress' && msg.params) {
      const token = String(msg.params.progressToken)
      progressByToken.set(token, (progressByToken.get(token) || 0) + 1)
      return
    }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, timer } = pending.get(msg.id)
      clearTimeout(timer)
      pending.delete(msg.id)
      resolve(msg)
    }
  })

  function rpc(method, params, timeoutMs = 30_000, meta) {
    const id = (seq += 1)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timeout: ${method}`)) }, timeoutMs)
      pending.set(id, { resolve, timer })
      const message = { jsonrpc: '2.0', id, method, params }
      if (meta) message.params = { ...params, _meta: meta }
      child.stdin.write(JSON.stringify(message) + '\n')
    })
  }

  /**
   * Call a tool. If progressToken given, attach it under _meta so the server emits notifications/progress.
   * Returns the raw CallToolResult (content[] + structuredContent + isError). Throws on protocol error.
   */
  async function callTool(name, args, { timeoutMs = 60_000, progressToken } = {}) {
    const meta = progressToken != null ? { progressToken } : undefined
    const response = await rpc('tools/call', { name, arguments: args }, timeoutMs, meta)
    if (response?.error) {
      const err = new Error(response.error.message || JSON.stringify(response.error))
      err.rpcError = response.error
      throw err
    }
    return response.result
  }

  async function initialize(timeoutMs = 4_000) {
    return rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: { elicitation: {} },
      clientInfo: clientInfo || { name: 'Claude Code', version: 'jmcp1-e2e' },
    }, timeoutMs)
  }

  async function terminate(graceMs = 2_000) {
    try { child.stdin.end() } catch { /* already closed */ }
    if (child.exitCode !== null || child.signalCode !== null) return
    try { child.kill('SIGTERM') } catch { /* best effort */ }
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(graceMs),
    ])
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGKILL') } catch { /* best effort */ }
    }
  }

  return {
    child,
    initialize,
    rpc,
    callTool,
    terminate,
    progressForToken: (token) => progressByToken.get(String(token)) || 0,
    elicitationCount: () => elicitationCount,
    childExited: () => childExit,
  }
}

/** Parse a CallToolResult into the fields J-MCP1 records: parsed JSON (from first text block if JSON), image-block count, deep link. */
export function parseToolResult(result) {
  const content = Array.isArray(result?.content) ? result.content : []
  const textBlock = content.find((block) => block?.type === 'text')
  const imageBlocks = content.filter((block) => block?.type === 'image' && typeof block.data === 'string' && block.data).length
  let json = null
  if (textBlock && typeof textBlock.text === 'string') {
    // Generate/read results embed JSON in the text; try direct parse, else the first {...} slice.
    try { json = JSON.parse(textBlock.text) } catch {
      const start = textBlock.text.indexOf('{')
      const end = textBlock.text.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try { json = JSON.parse(textBlock.text.slice(start, end + 1)) } catch { json = null }
      }
    }
  }
  const outcome = result?.structuredContent?.nomiOutcome || result?.structuredContent?.nomiRunData || {}
  const deepLink = typeof outcome.openInNomi === 'string' && outcome.openInNomi
    ? outcome.openInNomi
    : (typeof outcome.nomiUri === 'string' && outcome.nomiUri ? outcome.nomiUri : null)
  // outcome = the stable structured field (e.g. list_models entries live in nomiOutcome.models, not the
  // human-readable text block); callers that need structured data read it here rather than parsing prose.
  return { json, outcome, imageBlocks, deepLink, isError: Boolean(result?.isError), text: textBlock?.text || '' }
}

/** Make an isolated temp root with the four sandbox dirs J-MCP1 needs. */
export function makeIsolatedDirs(prefix = 'nomi-mcp-journey-') {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const dirs = {
    tempRoot,
    settingsDir: tempRoot,
    userDataDir: path.join(tempRoot, 'user-data'),
    projectsDir: path.join(tempRoot, 'projects'),
    capabilityDir: path.join(tempRoot, 'capability'),
  }
  for (const dir of [dirs.userDataDir, dirs.projectsDir, dirs.capabilityDir]) fs.mkdirSync(dir, { recursive: true })
  return dirs
}
