// 真实用户操作走查：把一个**本地网关**接进 Nomi（issue #62 / 2026-08-11 群反馈现场复刻）。
//
// 复刻的现场：用户填 http://127.0.0.1:8080/v1（sub2api / 自建网关），测试连接显示「已连上」，
// 但接入结果是「0 / 13 个模型已有可用能力」+ 红字 Invalid URL。根因是 127.0.0.1 被当域名截成
// "0.1" 拼出 http://docs.0.1，new URL 直接抛。修复见 electron/providerAdapter/docsDiscovery.ts。
//
// 本走查不打真实上游、不花额度：自带一个假的 OpenAI 兼容网关跑在 127.0.0.1 随机端口。
// 用法: node tests/ux/local-gateway-onboarding.walk.mjs
// 产出: tests/ux/shots/local-gateway/*.png —— 人眼判断，不只看断言。
import { _electron as electron } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const shotsDir = path.join(repoRoot, 'tests/ux/shots/local-gateway')
fs.rmSync(shotsDir, { recursive: true, force: true })
fs.mkdirSync(shotsDir, { recursive: true })
const userData = path.join(repoRoot, '.tmp', 'nomi-local-gateway-userdata')
fs.rmSync(userData, { recursive: true, force: true })
fs.mkdirSync(userData, { recursive: true })

// ── 假网关：模仿 sub2api / new-api 这类自建网关的 OpenAI 兼容口 ──
const MODELS = ['gpt-5.2', 'gpt-5.4-mini', 'gpt-image-2', 'kling-v2-master']
const gateway = http.createServer((req, res) => {
  const url = req.url || ''
  const send = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (url.startsWith('/v1/models')) {
    return send(200, { object: 'list', data: MODELS.map((id) => ({ id, object: 'model', owned_by: 'local' })) })
  }
  if (url.startsWith('/v1/chat/completions')) {
    return send(200, { id: 'c1', choices: [{ index: 0, message: { role: 'assistant', content: 'ready' }, finish_reason: 'stop' }] })
  }
  if (url.startsWith('/v1/images/generations')) {
    return send(200, { created: 1, data: [{ b64_json: 'aGVsbG8=' }] })
  }
  return send(404, { error: { message: 'not found' } })
})
await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve))
const gatewayBase = `http://127.0.0.1:${gateway.address().port}/v1`
console.log(`— 假网关就绪: ${gatewayBase} —`)

let n = 0
async function snap(win, name) {
  n += 1
  const tag = `${String(n).padStart(2, '0')}-${name}`
  await win.screenshot({ path: path.join(shotsDir, `${tag}.png`) })
  console.log(`  · shot ${tag}`)
}

const app = await electron.launch({
  executablePath: require('electron'),
  args: ['.', `--user-data-dir=${userData}`],
  cwd: repoRoot,
  env: {
    ...process.env,
    NOMI_E2E: '1',
    // 不加这条会被单实例锁挡住直接超时（model-onboarding.walk.mjs 就是栽在这）。
    NOMI_E2E_ALLOW_MULTI_INSTANCE: '1',
    NOMI_ELECTRON_USER_DATA_DIR: userData,
    NOMI_SETTINGS_DIR: userData,
    NOMI_PROJECTS_DIR: path.join(userData, 'projects'),
  },
})
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1800)

// 清场：跳过 splash / 引导。
await win.evaluate(() => {
  for (const k of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) {
    window.localStorage.setItem(k, 'seen')
  }
})
await win.reload()
await win.waitForTimeout(1500)
for (let i = 0; i < 5; i += 1) {
  const skip = win.locator('button, [role="button"], a', { hasText: /跳过|开始创作|进入|完成/ }).first()
  if (await skip.count()) await skip.click({ timeout: 1000 }).catch(() => {})
  await win.keyboard.press('Escape').catch(() => {})
  await win.waitForTimeout(300)
}
await snap(win, 'app-ready')

async function clickFirst(patterns, label) {
  for (const pattern of patterns) {
    const target = win.locator('button, [role="button"], a, div[role="menuitem"]', { hasText: pattern }).first()
    if (await target.count()) {
      await target.click({ timeout: 3000 }).catch(() => {})
      await win.waitForTimeout(900)
      console.log(`  → 点了「${label}」(${pattern})`)
      return true
    }
  }
  console.log(`  ! 没找到「${label}」`)
  return false
}

async function dumpClickables(label) {
  const texts = await win.evaluate(() => {
    const nodes = document.querySelectorAll('button, [role="button"], a, summary, [role="menuitem"]')
    return [...nodes]
      .filter((el) => el.offsetParent !== null)
      .map((el) => (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 40)
  })
  console.log(`  [可点元素 @${label}] ${JSON.stringify(texts)}`)
}

// 1. 进入模型接入
await clickFirst([/接入模型/, /模型接入/], '接入模型入口')
await snap(win, 'model-access-panel')
await dumpClickables('面板打开')

// 2. 展开「接入生成模型」分组
await clickFirst([/接入生成模型/], '展开接入生成模型')
await snap(win, 'expanded-generation-models')
await dumpClickables('展开后')

// 3. 选「自定义 / 其他」走自建网关
await clickFirst([/添加模型 ?\/ ?中转站/, /添加模型/, /中转站/, /自定义/], '添加模型 / 中转站')
await snap(win, 'add-model-dialog')
await dumpClickables('对话框')

// 3. 填地址 + key —— 复刻用户填本地网关的操作
const baseInput = win.locator('input').filter({ hasNot: win.locator('[type="password"]') })
const inputs = win.locator('input')
const count = await inputs.count()
console.log(`  · 对话框里有 ${count} 个输入框`)
for (let i = 0; i < count; i += 1) {
  const box = inputs.nth(i)
  const placeholder = (await box.getAttribute('placeholder')) || ''
  const type = (await box.getAttribute('type')) || ''
  if (/搜索/.test(placeholder)) continue // 项目库搜索框，不是接入表单
  if (/http|地址|url|base/i.test(placeholder)) {
    await box.fill(gatewayBase).catch(() => {})
    console.log(`  → 输入框#${i} 填地址 ${gatewayBase} (placeholder="${placeholder}")`)
  } else if (type === 'password' || /key|密钥/i.test(placeholder)) {
    await box.fill('sk-local-probe').catch(() => {})
    console.log(`  → 输入框#${i} 填 key (placeholder="${placeholder}")`)
  }
}
void baseInput
await win.waitForTimeout(500)
await snap(win, 'filled-base-url')

// 4. 拉取模型
await dumpClickables('填完表单')
await clickFirst([/拉取可用模型/, /拉取模型/, /重新拉取/, /拉取/], '拉取模型')
await win.waitForTimeout(2500)
await snap(win, 'fetched-models')

// 5. 进选择模型屏 → 全选 → 接入并验证
await clickFirst([/选择模型/, /还没选/], '选择模型')
await win.waitForTimeout(1200)
await snap(win, 'pick-models')
await dumpClickables('选择模型屏')
const groupAll = win.locator('button', { hasText: /全选本组/ })
const groups = await groupAll.count()
console.log(`  · 有 ${groups} 个「全选本组」`)
for (let g = 0; g < groups; g += 1) {
  await groupAll.nth(g).click({ timeout: 2000 }).catch(() => {})
  await win.waitForTimeout(250)
}
await win.waitForTimeout(600)
await snap(win, 'picked-all')
await clickFirst([/接入并验证 [1-9]/, /接入并验证/], '接入并验证')
await win.waitForTimeout(8000)
await snap(win, 'verify-result')
await win.waitForTimeout(12000)
await snap(win, 'verify-result-late')

// ── 断言：屏幕上不许再出现 Invalid URL ──
const bodyText = await win.evaluate(() => document.body.innerText)
fs.writeFileSync(path.join(shotsDir, 'body-text.txt'), bodyText)
const hasInvalidUrl = /Invalid URL/i.test(bodyText)
console.log(`\n— 断言 —`)
console.log(`  屏幕含 "Invalid URL": ${hasInvalidUrl}`)
const docsHostLeak = /docs\.\d/.test(bodyText)
console.log(`  屏幕含 "docs.<数字>" 畸形域名: ${docsHostLeak}`)

await app.close()
await new Promise((resolve) => gateway.close(resolve))

if (hasInvalidUrl || docsHostLeak) {
  console.error('\nWALK FAIL: 本地网关接入仍出现 Invalid URL / 畸形文档域名')
  process.exit(1)
}
console.log('\nWALK DONE：截图在 tests/ux/shots/local-gateway/，请人眼确认接入结果。')
