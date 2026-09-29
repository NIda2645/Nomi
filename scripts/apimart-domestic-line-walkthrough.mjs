// R13 真机走查 · 设置页亲手改 APIMart 接口地址（2026-09-29 用户反馈：新电脑上改成国内地址，保存报
// 「Certification-owned connection changes require a new integration session」；主域不翻墙用不了）。
//
// 零额度、零真 key：主进程出站全部经 scripts/apimart-line-netsim.cjs——api.apimart.ai 像被墙一样连接
// 超时，国内线路 api.apib.ai 由一个 APIMart 形状的假服务应答，其余域名一律「DNS 查不到」。
// 每一次出站都记账，走查按账本核对「请求到底发去了哪台主机」。临时资料目录，从不碰用户真实的 %APPDATA%\Nomi。
//
// 六个场景（编号与测试表 D:\tmp\apimart-endpoint-test\测试表.md 一一对应）：
//   new-zh        新装机·中文：接入页上改地址 → 保存验证 → 重开还在 → 生成发往国内域 → 写错地址的两种提示
//   keyfirst-zh   新装机·中文：先填 key（主域被墙 → 已保存·未验证）→ 再改地址 → 重新保存验证 → 接上
//   trap-zh       新装机·中文：点过「继续验证 → 自检」的连接（报错用户的真实状态）→ 改地址能存
//   old-zh        老装机升级·中文：APIMart 早已接好（官方默认地址 + 占位 key）→ 改地址 → 重开还在 → 生成发往国内域
//   new-en        新装机·英文界面：同 new-zh（改地址、写错提示①、保存验证、重开、生成）
//   old-en        老装机升级·英文界面：同 old-zh，外加写错提示②（域名拼错）
//
// 用法：pnpm build 后  node scripts/apimart-domestic-line-walkthrough.mjs [场景…]
//       截图目录可用 NOMI_WALK_OUT 指定（默认仓库根 .apimart-line-walk/）；
//       NOMI_WALK_OLD_CATALOG 指向一份老版本写下的 model-catalog.json 时，老装机场景从它起步。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outRoot = path.resolve(process.env.NOMI_WALK_OUT || path.join(repoRoot, '.apimart-line-walk'))
const NETSIM = path.join(repoRoot, 'scripts', 'apimart-line-netsim.cjs')
const IMAGE = path.join(repoRoot, 'tests', 'ux', 'fixtures', 'hires-detail-1024x1792.png')
const PRIMARY = 'https://api.apimart.ai'
const DOMESTIC = 'https://api.apib.ai'
const FIXTURE_KEY = 'sk-walkthrough-placeholder-not-a-real-key'

/** 界面文案（两种语言只在这一处）。 */
const UI = {
  'zh-CN': {
    settings: '设置', models: '模型', back: '返回', saveVerify: '保存验证', editAddress: '编辑 APIMart 接入地址',
    invalidAddress: '接入地址需以 http(s):// 开头。', unreachable: '连不上这个地址：', nextStep: '下一步：',
    newBlank: '新建空白项目', workspace: '工作区切换', generateTab: '生成', addImageNode: '添加图片节点', model: '模型', generateAsset: '生成素材', confirm: '生成',
  },
  en: {
    settings: 'Settings', models: 'Models', back: 'Back', saveVerify: 'Save Verify', editAddress: 'Edit APIMart connection address',
    invalidAddress: 'The connection address must start with http(s)://.', unreachable: "Can't reach this address:", nextStep: 'Next:',
    newBlank: 'New blank project', workspace: 'Switch workspace', generateTab: 'Generate', addImageNode: 'Add Image node', model: 'Model', generateAsset: 'Generate asset', confirm: 'Generate',
  },
}
const OLD_ERROR = /Certification-owned connection changes require a new integration session/

const results = []
/**
 * `knownGap`：这次改动之外的旧问题，照实记成「没通过」、单独列出，但不算本次改动的失败
 * （不许把它记成通过，也不许让它把本次改动的判据淹掉）。
 */
function record(id, ok, detail, shots = [], { knownGap = false } = {}) {
  results.push({ id, ok, detail, shots, ...(knownGap ? { knownGap } : {}) })
  console.log(`  ${ok ? '✓' : knownGap ? '△' : '✗'} ${id} ${detail}${shots.length ? `  [${shots.join(', ')}]` : ''}`)
}

function netLog(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

function readCatalog(settingsDir) {
  return JSON.parse(fs.readFileSync(path.join(settingsDir, 'model-catalog.json'), 'utf8'))
}
const apimartRow = (settingsDir) => readCatalog(settingsDir).vendors.find((vendor) => vendor.key === 'apimart')

/** 一个场景一份临时资料目录；同一场景的多次启动共用它（「重开 App」就是重启同一份资料）。 */
function profile(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `nomi-apimart-line-${name}-`))
  const out = path.join(outRoot, name)
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  return {
    name, root, out,
    settingsDir: path.join(root, 'settings'),
    projectsDir: path.join(root, 'projects'),
    userDataDir: path.join(root, 'user-data'),
    netLog: path.join(out, 'network.jsonl'),
  }
}

async function launch(p, { locale = 'zh-CN', blocked = 'api.apimart.ai', mocked = 'api.apib.ai,apib.ai' } = {}) {
  return launchNomiApp({
    name: `apimart-line-${p.name}`,
    tempRoot: p.root,
    settingsDir: p.settingsDir,
    projectsDir: p.projectsDir,
    userDataDir: p.userDataDir,
    mainRequire: [NETSIM],
    initialLocalStorage: { 'nomi:locale:v1': locale },
    env: {
      NOMI_NETSIM_LOG: p.netLog,
      NOMI_NETSIM_IMAGE: IMAGE,
      NOMI_NETSIM_BLOCKED: blocked,
      NOMI_NETSIM_MOCK: mocked,
      NOMI_RENDERER_URL: `file://${path.join(repoRoot, 'dist', 'index.html')}`,
    },
    settleMs: 2500,
  })
}

async function shot(win, p, name) {
  await win.screenshot({ path: path.join(p.out, name) })
  return path.join(p.out, name)
}

async function openModels(win, t) {
  await win.getByRole('button', { name: t.settings, exact: true }).first().click()
  await win.getByRole('dialog', { name: t.settings }).getByRole('button', { name: t.models, exact: true }).click()
  await win.waitForSelector('[data-settings-section="models"]')
}

/** 地址行：点「修改」→ 填 → 保存。返回保存后那一行下面的报错（没有就是空串）。 */
async function saveAddress(win, t, address) {
  await win.getByRole('button', { name: t.editAddress }).click()
  const field = win.locator('[data-model-connection-field="baseUrl"]')
  await field.fill(address)
  await win.locator('[data-model-connection-save="baseUrl"]').click()
  await win.waitForTimeout(700)
  return (await win.locator('[data-model-connection-field="baseUrl"]').count())
    ? (await field.locator('xpath=../..').innerText()).trim()
    : ''
}

/** 关掉设置窗（Esc 一次退一层：连接页 → 模型首页 → 关窗）。 */
async function closeSettings(win) {
  for (let i = 0; i < 4 && await win.locator('[data-settings-overlay]').count(); i += 1) {
    await win.keyboard.press('Escape')
    await win.waitForTimeout(300)
  }
  if (await win.locator('[data-settings-overlay]').count()) throw new Error('settings dialog did not close')
}

/** 编辑态里的「取消」（VendorBaseUrlField 给它挂了 data-model-connection-edit）。按 Esc 会连设置窗一起关掉。 */
async function cancelAddressEdit(win) {
  await win.locator('[data-model-connection-edit="baseUrl"]').click()
}

async function addressShown(win) {
  return (await win.locator('[data-settings-section="models"]').innerText()).includes(DOMESTIC)
}

async function saveKeyOnConnectPage(win, t) {
  await win.locator('#key-only-apimart').fill(FIXTURE_KEY)
  await win.getByRole('button', { name: t.saveVerify, exact: true }).click()
  await win.locator('[data-key-only-success]').waitFor({ timeout: 30_000 })
}

async function generateOnce(win, t) {
  await win.getByText(t.newBlank, { exact: false }).first().click()
  await win.locator(`[aria-label="${t.workspace}"]`).getByText(t.generateTab, { exact: true }).click()
  await win.locator(`[aria-label="${t.addImageNode}"]`).first().click()
  // 新节点的提示词框挂在画布浮框里，出现前 contenteditable 的最后一个是创作区那块（不可见）。
  await win.locator('[data-node-id]').first().waitFor()
  await win.waitForTimeout(1200)
  await win.locator('div[contenteditable="true"]').last().click()
  await win.keyboard.type('一只棕灰色短毛猫侧身蜷卧在浅灰色平面上', { delay: 8 })
  await win.locator(`[aria-label="${t.model}"]`).first().click()
  await win.getByRole('option', { name: /GPT Image 2(?!\.)/ }).first().click()
  await win.locator(`[aria-label="${t.generateAsset}"]`).first().click()
  const confirm = win.locator('.fixed.inset-0').last().getByRole('button', { name: t.confirm, exact: true })
  if (await confirm.count()) await confirm.first().click()
  // 等到节点里那张图真的解码出来（不是占位）：截图要拍得到结果。
  await win.waitForFunction(() => [...document.querySelectorAll('[data-node-id] img')]
    .some((img) => img.complete && img.naturalWidth > 200), undefined, { timeout: 60_000 })
  await win.waitForTimeout(800)
}

function hostsHit(p, since = 0) {
  return netLog(p.netLog).slice(since).filter((entry) => entry.kind !== 'netsim-loaded' && !String(entry.url).includes('raw.githubusercontent'))
}

// ── 新装机 · 中文 ──────────────────────────────────────────────────────────────────
async function newInstall(locale, name) {
  const t = UI[locale]
  const p = profile(name)
  let { app, win } = await launch(p, { locale })
  try {
    await openModels(win, t)
    await win.locator('[data-model-home-available="apimart"]').click()
    await win.waitForSelector('[data-key-only-vendor="apimart"]')
    const before = await shot(win, p, '01-connect-page-address-row.png')
    record(`${name}/地址行在接入页上`, (await win.locator('[data-key-only-vendor="apimart"]').innerText()).includes(PRIMARY), `接入页显示默认地址 ${PRIMARY} 与「修改」`, [before])

    const malformed = await saveAddress(win, t, 'apib.ai/v1')
    const malformedShot = await shot(win, p, '02-malformed-address.png')
    record(`${name}/写错地址①少了https`, malformed.includes(t.invalidAddress) && apimartRow(p.settingsDir).baseUrlHint === PRIMARY,
      `提示「${t.invalidAddress}」，地址没被改`, [malformedShot])
    await cancelAddressEdit(win)

    const error = await saveAddress(win, t, DOMESTIC)
    const savedShot = await shot(win, p, '03-domestic-address-saved.png')
    record(`${name}/改成国内地址保存`, !error && apimartRow(p.settingsDir).baseUrlHint === DOMESTIC && !OLD_ERROR.test(error),
      `地址行显示 ${DOMESTIC}，没有报错`, [savedShot])

    await saveKeyOnConnectPage(win, t)
    const keyShot = await shot(win, p, '04-key-saved-published.png')
    const probe = hostsHit(p).find((entry) => entry.url.endsWith('/v1/balance'))
    record(`${name}/保存验证走国内线路`, probe?.url === `${DOMESTIC}/v1/balance` && apimartRow(p.settingsDir).enabled === true,
      `验证请求 → ${probe?.url ?? '（没有）'}；APIMart 已接入`, [keyShot])

    await app.close()
    ;({ app, win } = await launch(p, { locale }))
    await openModels(win, t)
    await win.locator('[data-model-home-connection="apimart"]').click()
    const reopened = await shot(win, p, '05-reopened-address-kept.png')
    record(`${name}/重开App地址还在`, await addressShown(win) && apimartRow(p.settingsDir).baseUrlHint === DOMESTIC,
      `重开后地址仍是 ${DOMESTIC}`, [reopened])

    await closeSettings(win)
    const mark = netLog(p.netLog).length
    await generateOnce(win, t)
    const generated = await shot(win, p, '06-generated-via-domestic.png')
    const traffic = hostsHit(p, mark)
    const submit = traffic.find((entry) => entry.method === 'POST' && entry.url.endsWith('/v1/images/generations'))
    const primaryTouched = traffic.some((entry) => entry.url.startsWith(PRIMARY))
    record(`${name}/生成请求发往新地址`, submit?.url === `${DOMESTIC}/v1/images/generations` && !primaryTouched,
      `提交 → ${submit?.url ?? '（没有）'}；轮询/取图 ${traffic.filter((e) => e.url.startsWith(DOMESTIC)).length} 次都在国内域；主域 0 次`, [generated])
    fs.writeFileSync(path.join(p.out, '06-network.json'), JSON.stringify(traffic, null, 2))
    return p
  } finally {
    await app.close().catch(() => undefined)
  }
}

/** 写错地址②：域名拼错。格式合法所以能存，已接入卡片上的连接状态要说人话（这里的截图就是证据）。 */
async function typoHost(p, locale) {
  const t = UI[locale]
  const { app, win } = await launch(p, { locale })
  try {
    await openModels(win, t)
    await win.locator('[data-model-home-connection="apimart"]').click()
    await saveAddress(win, t, 'https://api.apib.ai.cn')
    const notice = win.locator('[data-settings-section="models"]').getByText(t.unreachable)
    await notice.first().waitFor({ timeout: 20_000 })
    const text = (await notice.first().innerText()).trim()
    const typoShot = await shot(win, p, '07-typo-host-notice.png')
    const englishLeak = locale === 'zh-CN' && /Network error|Next: check/.test(text)
    record(`${p.name}/写错地址②域名拼错`, text.includes(t.nextStep) && !englishLeak, `连接状态：${text}`, [typoShot])
    if (locale !== 'zh-CN') {
      // 原因那半句来自 systemProxy.describeNetworkError，它只有中文（渲染层还按这些中文子串给错误分类），
      // 不是这次改动引入的；英文界面上照实记一条没通过。
      record(`${p.name}/英文界面的原因句`, !/[一-鿿]/.test(text), '原因句（DNS 解析失败…）仍是中文——旧问题，本次未改', [typoShot], { knownGap: true })
    }
    await saveAddress(win, t, DOMESTIC)
  } finally {
    await app.close().catch(() => undefined)
  }
}

// ── 新装机 · 先填 key 再改地址（主域被墙的用户最可能的顺序）──────────────────────
async function keyFirst() {
  const t = UI['zh-CN']
  const p = profile('keyfirst-zh')
  const { app, win } = await launch(p)
  try {
    await openModels(win, t)
    await win.locator('[data-model-home-available="apimart"]').click()
    await saveKeyOnConnectPage(win, t)
    const pendingShot = await shot(win, p, '01-key-pending.png')
    const pending = readCatalog(p.settingsDir).apiKeysByVendor.apimart
    record('keyfirst-zh/主域被墙时key存成未验证', pending?.verificationPending === true && apimartRow(p.settingsDir).enabled === false,
      '显示「已保存 · 未验证」，APIMart 还没接上（验证请求只发去了被墙的主域）', [pendingShot])
    await win.getByRole('button', { name: t.back }).first().click()
    await win.locator('[data-model-home-available="apimart"]').click()
    await saveAddress(win, t, DOMESTIC)
    await saveKeyOnConnectPage(win, t)
    const doneShot = await shot(win, p, '02-address-then-key-published.png')
    const lastProbe = hostsHit(p).filter((entry) => entry.url.endsWith('/v1/balance')).at(-1)
    record('keyfirst-zh/改地址后重新保存验证', lastProbe?.url === `${DOMESTIC}/v1/balance` && apimartRow(p.settingsDir).enabled === true,
      `第二次验证 → ${lastProbe?.url ?? '（没有）'}；APIMart 接上了`, [doneShot])
  } finally {
    await app.close().catch(() => undefined)
  }
}

// ── 新装机 · 点过「继续验证 → 自检」的连接（报错用户电脑上的真实状态）─────────────
async function selfCheckTrap() {
  const t = UI['zh-CN']
  const p = profile('trap-zh')
  const { app, win } = await launch(p)
  try {
    await openModels(win, t)
    await win.locator('[data-model-home-available="apimart"]').click()
    await saveKeyOnConnectPage(win, t)
    await win.getByRole('button', { name: /继续验证/ }).first().click()
    const manual = win.getByPlaceholder('没列出来的，输入模型 id 回车添加')
    await manual.fill('gpt-image-1')
    await manual.press('Enter')
    await win.getByRole('button', { name: /自检 1 个/ }).click()
    await win.getByText('自检没有通过').first().waitFor({ timeout: 30_000 })
    const marked = readCatalog(p.settingsDir).models.some((model) => model.vendorKey === 'apimart' && model.meta && 'adapter' in model.meta)
    for (let i = 0; i < 4 && await win.locator('[data-model-home-connection="apimart"]').count() === 0; i += 1) {
      await win.getByRole('button', { name: t.back }).first().click()
    }
    await win.locator('[data-model-home-connection="apimart"]').click()
    const error = await saveAddress(win, t, DOMESTIC)
    const trapShot = await shot(win, p, '01-self-checked-connection-address-saved.png')
    record('trap-zh/自检过的连接也能改地址', marked && !error && apimartRow(p.settingsDir).baseUrlHint === DOMESTIC,
      `连接带着自检标记（修之前这里报 Certification-owned…）；现在保存成功：${apimartRow(p.settingsDir).baseUrlHint}`, [trapShot])
  } finally {
    await app.close().catch(() => undefined)
  }
}

// ── 老装机升级 ──────────────────────────────────────────────────────────────────────
/** 造一份「老电脑」资料：主域能通的时候接好的 APIMart（官方默认地址 + 占位 key）。 */
async function buildOldProfile(name, locale) {
  // 界面语言是这份资料自己的偏好（localStorage），造资料时就定下来——之后的启动不会覆盖它。
  const t = UI[locale]
  const p = profile(name)
  // 老版本写下的目录（例如 0.22.4 形状的 model-catalog.json）：给了就先放进资料目录，新版本启动时照常升级它。
  const oldCatalog = process.env.NOMI_WALK_OLD_CATALOG
  if (oldCatalog) {
    fs.mkdirSync(p.settingsDir, { recursive: true })
    fs.copyFileSync(oldCatalog, path.join(p.settingsDir, 'model-catalog.json'))
  }
  const { app, win } = await launch(p, { locale, blocked: '', mocked: 'api.apimart.ai,api.apib.ai,apib.ai' })
  try {
    await openModels(win, t)
    await win.locator('[data-model-home-available="apimart"]').click()
    await saveKeyOnConnectPage(win, t)
  } finally {
    await app.close().catch(() => undefined)
  }
  const row = apimartRow(p.settingsDir)
  if (row.baseUrlHint !== PRIMARY || row.enabled !== true || row.credentialBinding?.origin !== PRIMARY) {
    throw new Error(`old profile was not built as an already-connected APIMart: ${JSON.stringify(row)}`)
  }
  fs.writeFileSync(path.join(p.out, '00-old-profile-before.json'), JSON.stringify({ oldCatalog: oldCatalog || null, baseUrlHint: row.baseUrlHint, binding: row.credentialBinding }, null, 2))
  return p
}

async function oldInstall(locale, name) {
  const t = UI[locale]
  const p = await buildOldProfile(name, locale)
  let { app, win } = await launch(p, { locale })
  try {
    await openModels(win, t)
    await win.locator('[data-model-home-connection="apimart"]').click()
    const before = await shot(win, p, '01-connected-card-before.png')
    const error = await saveAddress(win, t, DOMESTIC)
    const after = await shot(win, p, '02-connected-card-address-saved.png')
    record(`${name}/已接入卡片改成国内地址`, !error && apimartRow(p.settingsDir).baseUrlHint === DOMESTIC,
      `地址 ${PRIMARY} → ${DOMESTIC}，没有报错`, [before, after])

    const malformed = await saveAddress(win, t, 'apib.ai/v1')
    const malformedShot = await shot(win, p, '03-malformed-address.png')
    record(`${name}/写错地址①少了https`, malformed.includes(t.invalidAddress) && apimartRow(p.settingsDir).baseUrlHint === DOMESTIC,
      `提示「${t.invalidAddress}」，地址没被改`, [malformedShot])
    await cancelAddressEdit(win)

    await app.close()
    ;({ app, win } = await launch(p, { locale }))
    await openModels(win, t)
    await win.locator('[data-model-home-connection="apimart"]').click()
    const reopened = await shot(win, p, '04-reopened-address-kept.png')
    record(`${name}/重开App地址还在`, await addressShown(win), `重开后地址仍是 ${DOMESTIC}`, [reopened])

    await closeSettings(win)
    const mark = netLog(p.netLog).length
    await generateOnce(win, t)
    const generated = await shot(win, p, '05-generated-via-domestic.png')
    const traffic = hostsHit(p, mark)
    const submit = traffic.find((entry) => entry.method === 'POST' && entry.url.endsWith('/v1/images/generations'))
    record(`${name}/生成请求发往新地址`, submit?.url === `${DOMESTIC}/v1/images/generations` && !traffic.some((entry) => entry.url.startsWith(PRIMARY)),
      `提交 → ${submit?.url ?? '（没有）'}；主域 0 次`, [generated])
    fs.writeFileSync(path.join(p.out, '05-network.json'), JSON.stringify(traffic, null, 2))
    return p
  } finally {
    await app.close().catch(() => undefined)
  }
}

const SCENARIOS = {
  'new-zh': async () => { const p = await newInstall('zh-CN', 'new-zh'); await typoHost(p, 'zh-CN') },
  'keyfirst-zh': keyFirst,
  'trap-zh': selfCheckTrap,
  'old-zh': async () => { await oldInstall('zh-CN', 'old-zh') },
  'new-en': async () => { await newInstall('en', 'new-en') },
  'old-en': async () => { const p = await oldInstall('en', 'old-en'); await typoHost(p, 'en') },
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS)
for (const name of wanted) {
  if (!SCENARIOS[name]) throw new Error(`unknown scenario: ${name}`)
  console.log(`\n── ${name}`)
  try {
    await SCENARIOS[name]()
  } catch (error) {
    record(`${name}/场景没跑完`, false, String(error?.stack || error).slice(0, 600))
  }
}
fs.mkdirSync(outRoot, { recursive: true })
fs.writeFileSync(path.join(outRoot, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok && !entry.knownGap)
const gaps = results.filter((entry) => !entry.ok && entry.knownGap)
if (gaps.length) console.log(`\n△ ${gaps.length} 条旧问题照实记为没通过：${gaps.map((entry) => entry.id).join('、')}`)
console.log(failed.length ? `\n✗ ${failed.length} 条没通过（${results.length} 条）` : `\n✓ 本次改动的 ${results.length - gaps.length} 条全部通过，零真实供应商调用`)
process.exit(failed.length ? 1 : 0)
