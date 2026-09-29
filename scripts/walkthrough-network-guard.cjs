// 走查专用的主进程网络闸：只放行本机（loopback / file / data / nomi-local），其余一律拦下并记账。
//
// 为什么要它：走查要证明「零供应商调用」，而 App 启动时自己就会出门——catalogReconcile 会对每个
// 有钥匙、有文本模型的供应商做一次健康探测（vendorHealth.startCatalogReconciliation）。夹具里的钥匙
// 是占位串，探测本身免费，但「免费」不等于「没有调用」。所以不靠推理，而是在进程入口把门关上：
// 主进程所有 HTTP 都经 appFetch → globalThis.fetch（appFetch 在模块加载时绑定它），本文件由启动器的
// mainRequire 作为 `-r` 放在 App 入口之前加载，在 App 代码加载之前换掉 globalThis.fetch 与 http(s).request，
// 并把每一次被拦下的尝试写进 NOMI_WALK_NET_LOG，走查结束时逐条列出。
//
// 只给走查用：它从不进产品构建（只有走查脚本经 launchNomiApp({ mainRequire }) 把它挂上）。
'use strict'
const fs = require('node:fs')

const LOG = process.env.NOMI_WALK_NET_LOG || ''

function note(entry) {
  if (!LOG) return
  try {
    fs.appendFileSync(LOG, `${JSON.stringify({ ...entry, pid: process.pid, at: new Date().toISOString() })}\n`)
  } catch {
    // 记账失败不能影响被测 App；走查末尾会因为缺 guard-loaded 记录而判「未证明零调用」。
  }
}

function isLocal(rawUrl) {
  let url
  try {
    url = new URL(String(rawUrl))
  } catch {
    return true
  }
  if (['file:', 'data:', 'blob:', 'nomi-local:'].includes(url.protocol)) return true
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
}

/** 记账只留 origin + path：query 里可能有别的东西，走查报告不需要它。 */
function redact(rawUrl) {
  try {
    const url = new URL(String(rawUrl))
    return `${url.origin}${url.pathname}`
  } catch {
    return String(rawUrl).slice(0, 200)
  }
}

note({ kind: 'guard-loaded', processType: process.type || 'node' })

const realFetch = globalThis.fetch
if (typeof realFetch === 'function') {
  globalThis.fetch = function walkthroughGuardedFetch(input, init) {
    const target = typeof input === 'string' ? input : (input && input.url) || String(input)
    if (!isLocal(target)) {
      note({ kind: 'blocked', via: 'fetch', url: redact(target) })
      return Promise.reject(new TypeError('fetch failed (blocked by walkthrough network guard)'))
    }
    return realFetch.call(this, input, init)
  }
}

for (const moduleName of ['http', 'https']) {
  const mod = require(moduleName)
  for (const fn of ['request', 'get']) {
    const original = mod[fn]
    mod[fn] = function walkthroughGuardedRequest(...args) {
      const first = args[0]
      const target = typeof first === 'string'
        ? first
        : first instanceof URL
          ? first.href
          : `${moduleName}://${(first && (first.hostname || first.host)) || 'localhost'}${(first && first.path) || '/'}`
      if (!isLocal(target)) {
        note({ kind: 'blocked', via: `${moduleName}.${fn}`, url: redact(target) })
        throw new Error('network request blocked by walkthrough network guard')
      }
      return original.apply(this, args)
    }
  }
}
