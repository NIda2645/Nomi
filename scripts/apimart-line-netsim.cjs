// 走查专用的主进程网络模拟（只给 APIMart 线路走查用，从不进产品构建）。
//
// 为什么要它：要在本机复现「主域被墙、国内线路能通」，还要证明「生成请求真的发往用户填的新地址」，
// 而且一分钱不花、一个真 key 不用。所以在进程入口（launchNomiApp 的 mainRequire，`-r`）换掉主进程的
// globalThis.fetch（appFetch 在模块加载时绑定它）与 http(s).request：
//   · NOMI_NETSIM_BLOCKED 里的主机：像被墙一样连接超时（UND_ERR_CONNECT_TIMEOUT，请求从未离开本机）；
//   · NOMI_NETSIM_MOCK 里的主机：由本文件里一个 APIMart 形状的假服务应答（验 key / 提交 / 轮询 / 取图）；
//   · 其余主机：按 DNS 查不到处理（ENOTFOUND）——等价于用户把域名写错；
//   · 回环 / file / data 照常放行。
// 每一次出站尝试都记进 NOMI_NETSIM_LOG（JSONL：方法 + origin + path + 是否带了密钥），走查据此核对目标主机。
// 只记「带没带」，从不记密钥本身。
'use strict'
const fs = require('node:fs')
const dns = require('node:dns')
const net = require('node:net')

const LOG = process.env.NOMI_NETSIM_LOG || ''
const hosts = (value, fallback) => String(value ?? fallback).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
const BLOCKED = hosts(process.env.NOMI_NETSIM_BLOCKED, 'api.apimart.ai')
const MOCKED = hosts(process.env.NOMI_NETSIM_MOCK, 'api.apib.ai,apib.ai')
const PUBLIC_ADDRESS = '104.18.32.7'
const IMAGE = fs.readFileSync(process.env.NOMI_NETSIM_IMAGE)

function note(entry) {
  if (!LOG) return
  try { fs.appendFileSync(LOG, `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`) } catch { /* 记账失败不能拖垮被测 App */ }
}

function isLocal(url) {
  if (['file:', 'data:', 'blob:', 'nomi-local:'].includes(url.protocol)) return true
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
}

function json(status, value) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

let taskCounter = 0
/** APIMart 形状的假服务：只认本走查会走到的那几条路由。 */
function apimartMock(method, url, carriesKey) {
  const route = url.pathname
  if (!carriesKey) return json(401, { error: { message: 'invalid API key', type: 'apimart_error' } })
  // 连接健康检查拉的模型清单：假服务不提供（404 = 「这家没有可预检的接口」），不冒充「连得上」。
  if (method === 'GET' && (route === '/v1/models' || route === '/models')) return json(404, { error: { message: 'not found', type: 'apimart_error' } })
  if (method === 'GET' && route === '/v1/balance') return json(200, { remain_balance: 88.8, used_balance: 1.2 })
  if (method === 'POST' && route === '/v1/images/generations') {
    taskCounter += 1
    return json(200, { code: 200, data: [{ status: 'submitted', task_id: `task_netsim_${taskCounter}` }] })
  }
  const task = route.match(/^\/v1\/tasks\/([^/]+)$/)
  if (method === 'GET' && task) {
    return json(200, { code: 200, data: { id: task[1], status: 'completed', progress: 100, result: { images: [{ url: [`${url.origin}/netsim-assets/${task[1]}.png`] }] } } })
  }
  return json(404, { error: { message: `netsim has no route for ${method} ${route}`, type: 'apimart_error' } })
}

function connectTimeout(host) {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(`Connect Timeout Error (attempted address: ${host}:443)`), { code: 'UND_ERR_CONNECT_TIMEOUT' }) })
}
function nameNotFound(host) {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND', hostname: host }) })
}

const realFetch = globalThis.fetch
globalThis.fetch = async function netsimFetch(input, init) {
  const isRequest = typeof Request !== 'undefined' && input instanceof Request
  let url
  try { url = new URL(isRequest ? input.url : String(input)) } catch { return realFetch.call(this, input, init) }
  if (isLocal(url)) return realFetch.call(this, input, init)
  const method = String((init && init.method) || (isRequest ? input.method : 'GET')).toUpperCase()
  const headers = new Headers((init && init.headers) || (isRequest ? input.headers : undefined))
  const carriesKey = headers.has('authorization') || headers.has('x-api-key')
  const host = url.hostname.toLowerCase()
  const where = `${url.origin}${url.pathname}`
  if (BLOCKED.includes(host)) {
    note({ kind: 'blocked', method, url: where, credential: carriesKey })
    await new Promise((resolve) => setTimeout(resolve, 150))
    throw connectTimeout(host)
  }
  if (MOCKED.includes(host)) {
    note({ kind: 'served', method, url: where, credential: carriesKey })
    if (method === 'GET' && url.pathname.startsWith('/netsim-assets/')) {
      return new Response(IMAGE, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(IMAGE.length) } })
    }
    return apimartMock(method, url, carriesKey)
  }
  note({ kind: 'not-found', method, url: where, credential: carriesKey })
  throw nameNotFound(host)
}

for (const moduleName of ['http', 'https']) {
  const mod = require(moduleName)
  for (const fn of ['request', 'get']) {
    const original = mod[fn]
    mod[fn] = function netsimNodeRequest(...args) {
      const first = args[0]
      const target = typeof first === 'string'
        ? first
        : first instanceof URL ? first.href : `${moduleName}://${(first && (first.hostname || first.host)) || 'localhost'}${(first && first.path) || '/'}`
      let url
      try { url = new URL(target) } catch { return original.apply(this, args) }
      if (!isLocal(url)) {
        note({ kind: 'refused-node-http', via: `${moduleName}.${fn}`, url: `${url.origin}${url.pathname}` })
        throw new Error('network request refused by the walkthrough network simulator')
      }
      return original.apply(this, args)
    }
  }
}

// DNS 也钉死：假服务的主机解析成一个公网地址，其余一律 NXDOMAIN（出站策略的合成解析器探测看到的是正常解析器）。
const originalLookup = dns.promises.lookup
dns.promises.lookup = async function netsimLookup(hostname, options) {
  const host = String(hostname || '').toLowerCase()
  if (net.isIP(host)) return originalLookup.call(this, hostname, options)
  const found = MOCKED.includes(host) ? [{ address: PUBLIC_ADDRESS, family: 4 }] : host === 'localhost' ? [{ address: '127.0.0.1', family: 4 }] : null
  if (!found) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND', hostname })
  return typeof options === 'object' && options && options.all ? found : found[0]
}
note({ kind: 'netsim-loaded', blocked: BLOCKED, mocked: MOCKED })
