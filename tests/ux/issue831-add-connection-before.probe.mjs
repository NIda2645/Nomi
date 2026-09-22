// issue #831 方案阶段的「先看它真实样子」探针（R8）：把**添加连接表单**的真实布局拍下来，
// zh / en 两轨各一张，作为「同域名已有连接」内联提示行的 before 基线。
//
// 只拍照、不改状态：隔离 profile、假网关只提供 /v1/models，不接真上游、不花额度。
// 用法：node tests/ux/issue831-add-connection-before.probe.mjs
// 刻意**不叫** *.walk.mjs：它是方案阶段的取证探针（只拍 before），不是验收走查——
// 验收走查在实施阶段另建 tests/ux/vendor-connection-identity.walk.mjs（见方案 §6.4）。
// 产出：docs/plan/assets/2026-09-22-vendor-connection-identity/*.png
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import { screenshotSettled } from './_assert.mjs'

const shotsDir = path.join(repoRoot, 'docs/plan/assets/2026-09-22-vendor-connection-identity')
fs.mkdirSync(shotsDir, { recursive: true })
const userData = path.join(repoRoot, '.tmp', 'nomi-issue831-before-userdata')
fs.rmSync(userData, { recursive: true, force: true })
fs.mkdirSync(userData, { recursive: true })

const MODELS = ['seedance-2.0', 'seedance-2.0-mini', 'seedance-2.0-fast']
const gateway = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ object: 'list', data: MODELS.map((id) => ({ id, object: 'model' })) }))
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: { message: 'probe gateway: only /v1/models' } }))
})
await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve))
const gatewayBase = `http://127.0.0.1:${gateway.address().port}/v1`
console.log(`— 探针网关: ${gatewayBase} —`)

const { app, win } = await launchNomiApp({ name: 'issue831-before', userDataDir: userData })
await win.evaluate(() => {
  for (const k of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) {
    window.localStorage.setItem(k, 'seen')
  }
})
await win.reload()
await win.waitForTimeout(1800)
for (let i = 0; i < 5; i += 1) {
  const skip = win.locator('button, [role="button"], a', { hasText: /跳过|开始创作|进入|完成|Skip|Start/ }).first()
  if (await skip.count()) await skip.click({ timeout: 1000 }).catch(() => {})
  await win.keyboard.press('Escape').catch(() => {})
  await win.waitForTimeout(300)
}

let n = 0
async function snap(name) {
  n += 1
  const tag = `${String(n).padStart(2, '0')}-${name}`
  await screenshotSettled(win, { path: path.join(shotsDir, `${tag}.png`) })
  console.log(`  · shot ${tag}`)
}

async function clickFirst(patterns, label) {
  for (const pattern of patterns) {
    const target = win.locator('button, [role="button"], a, div[role="menuitem"], summary', { hasText: pattern }).first()
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

/** 走到「添加连接」那张表单（OnboardingWizard 的自定义中转入口）并把地址 + 名称填上。 */
async function openAddConnectionForm(tagPrefix, hints) {
  await clickFirst(hints.modelAccess, '连接模型入口')
  await win.waitForTimeout(600)
  // 「自定义 API / 中转站」住在「本地运行时与即梦会员」那一组里（data-model-home-action="custom-api"）。
  await clickFirst(hints.otherWays, '展开其他接入方式')
  await win.waitForTimeout(500)
  const customRow = win.locator('[data-model-home-action="custom-api"]').first()
  await customRow.waitFor({ state: 'visible', timeout: 8000 })
  await customRow.click({ timeout: 6000 })
  await win.waitForTimeout(1200)
  await snap(`${tagPrefix}-add-connection-form-empty`)
  await dumpClickables(`${tagPrefix}-表单`)

  const inputs = win.locator('input')
  const count = await inputs.count()
  console.log(`  · 表单里有 ${count} 个输入框`)
  for (let i = 0; i < count; i += 1) {
    const box = inputs.nth(i)
    const placeholder = (await box.getAttribute('placeholder')) || ''
    const type = (await box.getAttribute('type')) || ''
    if (/搜索|Search/i.test(placeholder)) continue
    if (/TikHub/i.test(placeholder)) continue
    if (/socks5|7897|代理|proxy/i.test(placeholder)) continue
    if (/http|api\.|地址|url|base/i.test(placeholder)) {
      await box.fill(gatewayBase).catch(() => {})
      console.log(`  → #${i} 地址 (placeholder="${placeholder}")`)
    } else if (type === 'password' || /key|密钥/i.test(placeholder)) {
      await box.fill('sk-probe-B').catch(() => {})
      console.log(`  → #${i} key (placeholder="${placeholder}")`)
    } else if (/TOAPI|来源|名称|Source|name/i.test(placeholder)) {
      await box.fill(hints.connectionName).catch(() => {})
      console.log(`  → #${i} 连接名 (placeholder="${placeholder}")`)
    }
  }
  await win.waitForTimeout(600)
  await snap(`${tagPrefix}-add-connection-form-filled`)
}

async function closeOverlays() {
  for (let i = 0; i < 6; i += 1) {
    await win.keyboard.press('Escape').catch(() => {})
    await win.waitForTimeout(250)
  }
}

// ── zh 轨 ──
await snap('zh-app-ready')
await openAddConnectionForm('zh', {
  modelAccess: [/连接模型/],
  otherWays: [/本地运行时与即梦会员/, /其他接入方式/],
  connectionName: '满血组',
})
await closeOverlays()

// ── 切 en：走真实用户路径（连接模型 → 通用 → English），不 reload。 ──
await clickFirst([/连接模型/], '打开设置')
await win.waitForTimeout(700)
await clickFirst([/通用/, /General/], '通用 tab')
await win.waitForTimeout(500)
const enBtn = win.locator('[data-settings-locale="en"]').first()
if (await enBtn.count()) {
  await enBtn.click({ timeout: 6000 }).catch(() => {})
  await win.waitForTimeout(1000)
  console.log('  → 点了 [data-settings-locale="en"]')
} else {
  await dumpClickables('通用面板')
  throw new Error('找不到 [data-settings-locale="en"]：en 轨不成立，不许把没切过去当切过去')
}
const locale = await win.evaluate(() => window.localStorage.getItem('i18nextLng') || document.documentElement.lang || '')
console.log(`  · locale 锚点 = ${locale}`)
await closeOverlays()
await snap('en-app-ready')

// ── en 轨 ──
await openAddConnectionForm('en', {
  modelAccess: [/Connect Model/i, /连接模型/],
  otherWays: [/Local runtimes and Dreamina/i, /本地运行时与即梦会员/],
  connectionName: 'Full tier',
})

console.log(`\n✅ 截图落在 ${shotsDir}`)
await app.close()
gateway.close()
