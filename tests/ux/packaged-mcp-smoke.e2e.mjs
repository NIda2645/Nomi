// Release smoke: launch the packaged MCP server from an isolated cwd so repository files cannot
// mask a missing package asset. No project or provider call is made.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const bundlePath = path.resolve(process.argv[2] || '')
const executablePath = process.platform === 'darwin'
  ? path.join(bundlePath, 'Contents', 'MacOS', 'Nomi')
  : bundlePath
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-packaged-mcp-smoke-'))

if (!fs.existsSync(executablePath)) {
  throw new Error(`Packaged Nomi executable not found: ${executablePath}`)
}

const child = spawn(executablePath, [], {
  cwd: tempRoot,
  env: {
    ...process.env,
    NOMI_MCP_STDIO: '1',
    NOMI_SETTINGS_DIR: tempRoot,
    NOMI_ELECTRON_USER_DATA_DIR: tempRoot,
    NOMI_CAPABILITY_DIR: path.join(tempRoot, 'capability'),
  },
  stdio: ['pipe', 'pipe', 'inherit'],
})

const pending = new Map()
let sequence = 0
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  const entry = pending.get(message.id)
  if (!entry) return
  clearTimeout(entry.timer)
  pending.delete(message.id)
  entry.resolve(message)
})

function rpc(method, params = {}, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Packaged MCP timeout: ${method}`))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(`PACKAGED MCP SMOKE FAIL: ${message}`)
}

async function terminateChild() {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let exitCode = 0
try {
  const initialized = await rpc('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'nomi-packaged-smoke', version: '1.0' },
  }, 60_000)
  assert(initialized.result?.serverInfo?.name === 'nomi-capability-core', 'initialize handshake')

  const tools = (await rpc('tools/list')).result?.tools || []
  assert(tools.length === 13, `expected 13 tools, got ${tools.length}`)
  for (const name of ['nomi_start_playbook', 'nomi_get_run', 'nomi_subscribe_run', 'nomi_get_artifact']) {
    assert(tools.some((tool) => tool.name === name), `${name} is missing`)
  }

  const resources = (await rpc('resources/list')).result?.resources || []
  const director = resources.find((resource) => resource.uri === 'nomi-skill://director-cinematography')
  assert(director, 'director cinematography resource is missing')
  const body = (await rpc('resources/read', { uri: director.uri })).result?.contents?.[0]?.text || ''
  assert(body.includes('镜头语言') && body.length > 1_000, 'director cinematography body is incomplete')

  console.log(`PACKAGED MCP SMOKE PASS: ${tools.length} tools, ${resources.length} resources, director body ${body.length} chars`)
} catch (error) {
  exitCode = 1
  console.error(error instanceof Error ? error.message : String(error))
} finally {
  for (const entry of pending.values()) clearTimeout(entry.timer)
  await terminateChild()
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}

process.exitCode = exitCode
