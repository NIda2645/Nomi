// 本机 HTTP 直连只属于 HTTP 的那几条边界（协议行为的 38 条在 mcpWireContract.test.ts 里四种连接器各跑一遍）：
// 只听 127.0.0.1、Host / Origin 只认本机（防 DNS 重绑定）、会话不许换人、端口怎么选、宿主配置那一条长什么样、
// 转发口在 Nomi 没开时给宿主回什么。capability 目录指到临时目录，token 现铸，不碰 ~/.nomi。
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bridgeStdioToHttp, NOMI_UNREACHABLE_MESSAGE } from './mcpHttpBridge'
import {
  buildMcpHttpHostEntry, MCP_HTTP_DEFAULT_PORT, mcpHttpIdentityHeaders, readMcpHttpEndpoint,
  resolveForwarderUrl, resolveMcpHttpPort, writeMcpHttpEndpoint, clearMcpHttpEndpoint,
} from './mcpHttpEndpoint'
import { startMcpHttpServer, type McpHttpServerHandle } from './mcpHttpServer'
import { createNomiMcpServer } from './mcpProtocol'
import { ensureToken, signMcpClient, verifyMcpClient } from './security'

const previousCapabilityDir = process.env.NOMI_CAPABILITY_DIR
let server: McpHttpServerHandle

beforeAll(async () => {
  process.env.NOMI_CAPABILITY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-mcp-http-'))
  ensureToken()
  server = await startMcpHttpServer({
    port: 0,
    maxSessions: 2,
    sessionFor: (identity) => createNomiMcpServer({
      invoke: async () => ({}),
      isAppOpen: () => true,
      getAuthenticatedClient: () => identity.connection.authenticatedClient,
    }),
  })
})

afterAll(async () => {
  await server.close()
  if (previousCapabilityDir === undefined) delete process.env.NOMI_CAPABILITY_DIR
  else process.env.NOMI_CAPABILITY_DIR = previousCapabilityDir
})

const initializeBody = (id = 1) => JSON.stringify({ jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'http-test', version: '1' } } })
const identity = (client: string) => mcpHttpIdentityHeaders(client, signMcpClient(client) ?? '')
const post = (body: string, headers: Record<string, string> = {}) => fetch(server.url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
  body,
})

async function openSession(client: string): Promise<string> {
  const response = await post(initializeBody(), identity(client))
  expect(response.status).toBe(200)
  await response.text()
  const sessionId = response.headers.get('mcp-session-id')
  expect(sessionId).toBeTruthy()
  return sessionId as string
}

describe('本机 HTTP 直连 · HTTP 这一层的边界', () => {
  it('只听 127.0.0.1，地址是 /mcp', () => {
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/mcp`)
  })

  it('Host 不是本机（DNS 重绑定）→ 403，帧不进协议层', async () => {
    // fetch 不许改 Host 头（禁用头），用 node:http 原样发一个被重绑定过来的请求。
    const status = await new Promise<number>((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1', port: server.port, path: '/mcp', method: 'POST',
        headers: { host: `evil.example:${server.port}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...identity('codex') },
      }, (response) => { response.resume(); resolve(response.statusCode ?? 0) })
      request.on('error', reject)
      request.end(initializeBody())
    })
    expect(status).toBe(403)
    expect(server.sessionCount()).toBe(0)
  })

  it('网页来源（Origin 不是本机）→ 403', async () => {
    const response = await post(initializeBody(), { origin: 'https://evil.example', ...identity('codex') })
    expect(response.status).toBe(403)
  })

  it('没带身份 / 签名不对 → 同一帧 -32001（与 stdio 逐字相同），不开会话', async () => {
    for (const headers of [{}, mcpHttpIdentityHeaders('codex', 'not-a-proof')]) {
      const response = await post(initializeBody(7), headers)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 7, error: { code: -32001, message: 'A verified MCP client connection is required', data: { code: 'mcp_connection_unauthenticated' } } })
      expect(response.headers.get('mcp-session-id')).toBeNull()
    }
  })

  it('已开的会话不许换人：别的客户端拿着会话号来 → -32001', async () => {
    const sessionId = await openSession('codex')
    const response = await post(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }), { ...identity('claude'), 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-11-25' })
    expect((await response.json()).error.code).toBe(-32001)
  })

  it('不认识的会话号 → 404；没握手就发请求 → 400（Streamable HTTP 规范）', async () => {
    const unknown = await post(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }), { ...identity('codex'), 'mcp-session-id': 'no-such-session' })
    expect(unknown.status).toBe(404)
    const sessionless = await post(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }), identity('codex'))
    expect(sessionless.status).toBe(400)
  })

  it('会话数有上限：宿主不发 DELETE 也不会无限攒（挤掉最久没动静的那条）', async () => {
    await openSession('codex')
    await openSession('codex')
    await openSession('codex')
    expect(server.sessionCount()).toBeLessThanOrEqual(2)
  })
})

describe('端口与地址', () => {
  it('正常实例占默认端口；走查 / 隔离实例不抢，除非显式给端口', () => {
    expect(resolveMcpHttpPort({})).toBe(MCP_HTTP_DEFAULT_PORT)
    expect(resolveMcpHttpPort({ NOMI_E2E: '1' })).toBeNull()
    expect(resolveMcpHttpPort({ NOMI_CAPABILITY_DIR: '/tmp/x' })).toBeNull()
    expect(resolveMcpHttpPort({ NOMI_E2E: '1', NOMI_MCP_HTTP_PORT: '0' })).toBe(0)
    expect(resolveMcpHttpPort({ NOMI_MCP_HTTP_PORT: '99999' })).toBeNull()
  })

  it('端点文件：写进 capability 目录，转发口据此找地址；只清自己写的', () => {
    writeMcpHttpEndpoint(12345)
    expect(readMcpHttpEndpoint()).toEqual({ url: 'http://127.0.0.1:12345/mcp', port: 12345, pid: process.pid })
    expect(resolveForwarderUrl({})).toBe('http://127.0.0.1:12345/mcp')
    expect(resolveForwarderUrl({ NOMI_MCP_HTTP_URL: 'http://127.0.0.1:1/mcp' })).toBe('http://127.0.0.1:1/mcp')
    clearMcpHttpEndpoint()
    expect(readMcpHttpEndpoint()).toBeNull()
  })

  it('第 3 段要写进宿主配置的那一条：直连地址 + 能验过的身份头', () => {
    const entry = buildMcpHttpHostEntry('codex')
    expect(entry?.url).toBe(`http://127.0.0.1:${MCP_HTTP_DEFAULT_PORT}/mcp`)
    expect(verifyMcpClient(entry?.headers['x-nomi-mcp-client'], entry?.headers['x-nomi-mcp-client-proof'])).toBe('codex')
  })
})

describe('Desktop 转发口', () => {
  it('Nomi 没开（地址连不上）：宿主那个请求立刻拿到一句「请先打开 Nomi」，不干等', async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const lines: string[] = []
    stdout.setEncoding('utf8')
    stdout.on('data', (chunk: string) => lines.push(...chunk.split('\n').filter(Boolean)))
    const upstream = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:9/mcp'), { requestInit: { headers: identity('claude-desktop') } })
    const bridged = bridgeStdioToHttp(new StdioServerTransport(stdin, stdout), upstream)
    stdin.write(`${initializeBody(11)}\n`)
    const reply = await vi.waitFor(() => {
      const frame = lines.map((line) => JSON.parse(line) as { id?: number; error?: { message?: string } }).find((item) => item.id === 11)
      if (!frame) throw new Error('no reply yet')
      return frame
    }, { timeout: 5000 })
    expect(reply.error?.message).toBe(NOMI_UNREACHABLE_MESSAGE)
    stdin.end()
    await bridged
  })
})
