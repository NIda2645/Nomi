import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

import { afterEach, describe, expect, it } from 'vitest'

type RpcFrame = { id?: unknown; result?: Record<string, unknown>; error?: { message?: string } }

const require = createRequire(import.meta.url)
const launcherSource = path.join(process.cwd(), 'electron', 'capabilityCore', 'mcpNodeLauncher.ts')
const tsxCli = require.resolve('tsx/cli')
const roots: string[] = []
const children = new Set<ChildProcessWithoutNullStreams>()

function fakeNomiScript(root: string): string {
  const target = path.join(root, 'fake-nomi.mjs')
  fs.writeFileSync(target, `
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const capabilityDir = process.argv[2]
fs.mkdirSync(capabilityDir, { recursive: true })
const lockPath = path.join(capabilityDir, 'fake-app.lock')
let lock
try {
  lock = fs.openSync(lockPath, 'wx')
} catch {
  process.exit(0)
}

const token = 'launcher-race-token'
const server = http.createServer((request, response) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => {
    const frame = JSON.parse(body || '{}')
    const result = frame.method === 'project.list' ? { projects: [{ id: 'race-project' }] } : {}
    const payload = JSON.stringify({ ok: true, result })
    response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) })
    response.end(payload)
  })
})

const cleanup = () => {
  try { fs.closeSync(lock) } catch {}
  try { fs.rmSync(lockPath, { force: true }) } catch {}
  try { fs.rmSync(path.join(capabilityDir, 'instance.json'), { force: true }) } catch {}
}
process.on('SIGTERM', () => server.close(() => { cleanup(); process.exit(0) }))
process.on('exit', cleanup)

setTimeout(() => {
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    fs.writeFileSync(path.join(capabilityDir, 'instance.json'), JSON.stringify({
      pid: process.pid,
      port: address.port,
      token,
      startedAt: Date.now(),
      version: 'test',
    }))
  })
}, 250)
`, 'utf8')
  return target
}

function startLauncher(capabilityDir: string, fakeApp: string) {
  const child = spawn(process.execPath, [tsxCli, launcherSource], {
    env: {
      ...process.env,
      NOMI_CAPABILITY_DIR: capabilityDir,
      NOMI_MCP_APP_COMMAND: process.execPath,
      NOMI_MCP_APP_ARGS: JSON.stringify([fakeApp, capabilityDir]),
      NOMI_MCP_EXIT_BOOTSTRAPPED_APP: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  children.add(child)
  const pending = new Map<number, { resolve: (frame: RpcFrame) => void; reject: (error: Error) => void }>()
  let sequence = 0
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let frame: RpcFrame
    try { frame = JSON.parse(line) as RpcFrame } catch { return }
    const id = Number(frame.id)
    const waiter = pending.get(id)
    if (!waiter) return
    pending.delete(id)
    waiter.resolve(frame)
  })
  child.on('exit', (code, signal) => {
    children.delete(child)
    for (const waiter of pending.values()) waiter.reject(new Error(`launcher exited code=${code} signal=${signal}: ${stderr}`))
    pending.clear()
  })
  const rpc = (method: string, params: Record<string, unknown> = {}) => new Promise<RpcFrame>((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  return { child, rpc }
}

afterEach(async () => {
  for (const child of children) {
    child.stdin.end()
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }
  children.clear()
  await new Promise((resolve) => setTimeout(resolve, 50))
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('mcpNodeLauncher cold start', () => {
  it('lets concurrent helpers share the single Nomi instance that wins the launch race', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-mcp-launcher-race-'))
    roots.push(root)
    const capabilityDir = path.join(root, 'capability')
    const fakeApp = fakeNomiScript(root)
    const first = startLauncher(capabilityDir, fakeApp)
    const second = startLauncher(capabilityDir, fakeApp)

    await Promise.all([first, second].map(({ rpc }) => rpc('initialize', {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'launcher-race-test', version: '1' },
    })))
    const responses = await Promise.all([first, second].map(({ rpc }) => rpc('tools/call', {
      name: 'nomi_list_projects', arguments: {},
    })))

    for (const response of responses) {
      expect(response.error).toBeUndefined()
      expect(JSON.stringify(response.result)).toContain('race-project')
    }
  }, 15_000)
})
