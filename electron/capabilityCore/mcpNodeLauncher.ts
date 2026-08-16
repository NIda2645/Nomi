// MCP stdio entry that runs under Electron's bundled Node runtime. It never creates an
// NSApplication: an existing Nomi is reached over loopback RPC, and a missing Nomi is started once.
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

import { createMcpProtocol, type McpInvokeOptions } from './mcpProtocol'

type LiveInstance = {
  pid: number
  port: number
  token: string
  startedAt: number
  version: string
}

const CAPABILITY_DIR_ENV = 'NOMI_CAPABILITY_DIR'
const CLIENT_ENV = 'NOMI_MCP_CLIENT'
const CLIENT_PROOF_ENV = 'NOMI_MCP_CLIENT_PROOF'
const APP_COMMAND_ENV = 'NOMI_MCP_APP_COMMAND'
const APP_ARGS_ENV = 'NOMI_MCP_APP_ARGS'
const BOOT_TIMEOUT_MS = 60_000

function rpcTimeoutMs(): number {
  const configured = Number(process.env.NOMI_RPC_TIMEOUT_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : 360_000
}

function capabilityDir(): string {
  return String(process.env[CAPABILITY_DIR_ENV] || '').trim()
    || path.join(os.homedir(), '.nomi', 'capability-core')
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function readLiveInstance(): LiveInstance | null {
  const file = path.join(capabilityDir(), 'instance.json')
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<LiveInstance>
    if (!processAlive(Number(value.pid)) || !Number.isInteger(value.port) || !value.token) return null
    return value as LiveInstance
  } catch {
    return null
  }
}

function appArgs(): string[] {
  try {
    const value = JSON.parse(String(process.env[APP_ARGS_ENV] || '[]'))
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

let bootedApp: ChildProcess | null = null
let bootFailure = ''
let bootExitDetail = ''

function startNomi(): void {
  if (bootedApp && bootedApp.exitCode === null && bootedApp.signalCode === null) return
  const command = String(process.env[APP_COMMAND_ENV] || '').trim()
  if (!command) throw new Error('Nomi MCP launcher is missing its app command. Reconnect this client in Nomi settings.')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NOMI_MCP_STDIO
  delete env[APP_COMMAND_ENV]
  delete env[APP_ARGS_ENV]
  delete env[CLIENT_ENV]
  delete env[CLIENT_PROOF_ENV]
  bootFailure = ''
  bootExitDetail = ''
  bootedApp = spawn(command, appArgs(), { env, stdio: 'ignore' })
  bootedApp.on('error', (error) => {
    bootFailure = error.message
  })
  bootedApp.on('exit', (code, signal) => {
    // Another MCP helper may have won Nomi's single-instance race. Its sibling exits normally
    // before the winning process advertises RPC, so keep polling instead of failing this client.
    bootExitDetail = `Nomi launcher exited before MCP was ready (code=${code} signal=${signal})`
  })
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function ensureLiveInstance(): Promise<LiveInstance> {
  const current = readLiveInstance()
  if (current) return current
  startNomi()
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const instance = readLiveInstance()
    if (instance) return instance
    if (bootFailure) throw new Error(bootFailure)
    await delay(200)
  }
  throw new Error(`Nomi did not become ready within 60 seconds. Open Nomi once, then retry the MCP action.${bootExitDetail ? ` ${bootExitDetail}` : ''}`)
}

async function callViaRpc(
  instance: LiveInstance,
  method: string,
  params: Record<string, unknown>,
  _options?: McpInvokeOptions,
): Promise<unknown> {
  const client = String(process.env[CLIENT_ENV] || '').trim()
  const proof = String(process.env[CLIENT_PROOF_ENV] || '').trim()
  const timeoutMs = rpcTimeoutMs()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(`http://127.0.0.1:${instance.port}/rpc`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${instance.token}`,
        ...(client && proof ? { 'x-nomi-mcp-client': client, 'x-nomi-mcp-client-proof': proof } : {}),
      },
      body: JSON.stringify({ method, params }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Nomi did not respond within ${Math.round(timeoutMs / 1000)} seconds. The task may still be running; check Nomi before retrying.`, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
  const body = await response.json() as { ok?: boolean; error?: string; result?: unknown }
  if (!body.ok) throw new Error(body.error || `Nomi RPC failed (${response.status})`)
  return body.result
}

const protocol = createMcpProtocol({
  send: (message) => process.stdout.write(`${JSON.stringify(message)}\n`),
  invoke: async (method, params, options) => callViaRpc(await ensureLiveInstance(), method, params, options),
  isAppOpen: () => Boolean(readLiveInstance()),
})

const input = readline.createInterface({ input: process.stdin })
input.on('line', (line) => {
  const text = line.trim()
  if (!text) return
  try {
    protocol.handleIncoming(JSON.parse(text))
  } catch {
    // Invalid/non-JSON stdio noise is ignored; valid requests receive protocol-level errors.
  }
})

let closing = false
function close(): void {
  if (closing) return
  closing = true
  if (process.env.NOMI_MCP_EXIT_BOOTSTRAPPED_APP === '1' && bootedApp?.pid) {
    try { bootedApp.kill('SIGTERM') } catch { /* best effort test cleanup */ }
  }
  process.exit(0)
}

input.on('close', close)
process.stdin.on('end', close)
