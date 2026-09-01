// 2026-09-01 · 反馈与分享中心（PR #271）真机走查。
//
// 锁两件用户看得见的事：
//   ① 规范入口（设置→关于→「反馈与分享」）与情境入口（生成失败卡上「反馈此问题」）都能打开同一个对话框；
//   ② 对话框构造的外发 URL（私密 Tally / 公开 GitHub）只带**有界字段**，
//      且**永不携带用户自定义供应商的字符串**——失败卡的 vendorKey 由用户 base-url 派生
//      （deriveVendorKeyFromBaseUrl → 主机名 slug，可能是内网地址），必须在信封边界被映射成字面量 "custom"。
//
// 为什么用真 Electron + 隔离 profile：这条路径跨「设置弹窗外壳 / About 区块 / 画布失败卡 /
// 全局 FeedbackShareHost / feedbackDiagnostics 信封 / communityLinks URL 构造」六处，
// 单测各测一段证不了「点进去真的不漏」。这里把六段串起来跑一遍。
//
// 外发拦截：openExternal 走 window.open('_blank')，生产里被 electron/main.ts setWindowOpenHandler
// 拦成 shell.openExternal。走查在渲染层把 window.open **替换成记录器**——只记 URL、不真的开浏览器
// （任务红线：不代用户外发，URL 构造断言即可）。记录器装在 window.__nomiOpenLog 上，从主流程外取。
import { launchNomiApp } from './_launchApp.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clickOrFail, expectVisible, proveProbe, expectAbsent, screenshotSettled } from './_assert.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = path.join(repoRoot, '.feedback-share-center-walk')
const profileRoot = path.join(os.tmpdir(), 'nomi-feedback-share-center-profile')
for (const target of [outDir, profileRoot]) fs.rmSync(target, { recursive: true, force: true })
for (const target of [outDir, profileRoot]) fs.mkdirSync(target, { recursive: true })

// A user-defined relay/custom vendor: its catalog key is minted from the user's own base URL
// (deriveVendorKeyFromBaseUrl → hostname slug). This one carries a *private internal* address.
const PRIVATE_VENDOR_KEY = 'internal-proxy-corp-local'
const PRIVATE_MODEL_KEY = 'exec-secret-model'

const settingsDir = path.join(profileRoot, 'settings')
const projectsDir = path.join(profileRoot, 'projects')
const userDataDir = path.join(profileRoot, 'user-data')
const capabilityDir = path.join(profileRoot, 'capability')

const launch = () =>
  launchNomiApp({
    name: 'feedback-share-center',
    tempRoot: profileRoot,
    settingsDir,
    projectsDir,
    userDataDir,
    capabilityDir,
    env: { NOMI_RENDERER_URL: `file://${path.join(repoRoot, 'dist', 'index.html')}` },
    settleMs: 1600,
  })

const shot = async (target, name) => {
  await screenshotSettled(target, { path: path.join(outDir, name) })
  console.log(`  📸 ${name}`)
}

// Install a renderer-side window.open recorder that swallows the real external open
// and records the URL. Returns nothing; read via drainOpenLog().
async function installOpenRecorder(win) {
  await win.evaluate(() => {
    const w = /** @type {any} */ (window)
    w.__nomiOpenLog = []
    if (!w.__nomiOpenPatched) {
      w.__nomiOpenPatched = true
      w.open = (url) => {
        w.__nomiOpenLog.push(String(url))
        return null // never actually open a browser (test asserts construction only)
      }
    }
  })
}
async function drainOpenLog(win) {
  return win.evaluate(() => {
    const w = /** @type {any} */ (window)
    const log = Array.isArray(w.__nomiOpenLog) ? w.__nomiOpenLog.slice() : []
    w.__nomiOpenLog = []
    return log
  })
}
async function readOutbox(win) {
  return win.evaluate(() => {
    try {
      return JSON.parse(window.localStorage.getItem('nomi:feedback-outbox:v1') || '[]')
    } catch {
      return null
    }
  })
}

// A bounded URL is only allowed to carry these query keys (communityLinks buildPrivateFeedbackUrl).
const ALLOWED_TALLY_KEYS = new Set(['nomi_version', 'nomi_platform', 'nomi_arch', 'nomi_stage', 'nomi_provider', 'nomi_model'])

/** Fail hard if any private user string appears in a captured URL, or an unexpected key rides along. */
function assertUrlIsBoundedAndClean(url, label) {
  if (!url) throw new Error(`${label}：一个外发 URL 都没被记录到——提交按钮没走到 openExternal，或记录器没装上。`)
  for (const needle of [PRIVATE_VENDOR_KEY, PRIVATE_MODEL_KEY, 'corp-local', 'exec-secret']) {
    if (url.includes(needle)) {
      throw new Error(`${label}：外发 URL 里出现了用户私有字符串「${needle}」——脱敏边界漏了。\n  URL: ${url}`)
    }
  }
  const parsed = new URL(url)
  if (parsed.hostname === 'tally.so') {
    for (const key of parsed.searchParams.keys()) {
      if (!ALLOWED_TALLY_KEYS.has(key)) {
        throw new Error(`${label}：Tally URL 出现了预算外的查询键「${key}」——只允许有界上下文字段。\n  URL: ${url}`)
      }
    }
  }
  return parsed
}

// ─────────────────────────────────────────────────────────────────────────────
// 先建一个真实注册的工作区（首启空白项目），再把画布内容替换成一个「失败节点」，
// 其 meta.modelVendor = 用户 base-url 派生的私有 key。
// ─────────────────────────────────────────────────────────────────────────────
{
  const { app, win } = await launch()
  const skip = win.getByText('跳过', { exact: true }).first()
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await clickOrFail(win.getByText('新建空白项目', { exact: false }).first(), '新建空白项目')
  await win.waitForTimeout(1700)
  await win.keyboard.press('Escape').catch(() => {})
  await app.close()
}

const projectRoot = fs
  .readdirSync(projectsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(projectsDir, entry.name))[0]
if (!projectRoot) throw new Error('首启没有创建出注册工作区——无法继续走查')
const projectFile = path.join(projectRoot, '.nomi', 'project.json')
const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'))
project.payload.generationCanvas = {
  nodes: [
    {
      id: 'failed-shot',
      kind: 'image',
      title: '镜头一',
      categoryId: 'shots',
      position: { x: 320, y: 240 },
      size: { width: 420, height: 250 },
      status: 'error',
      error: 'Provider request failed: 502 Bad Gateway',
      prompt: '雨夜街道，角色回头',
      // 用户自定义中转家：vendorKey 由 base-url 派生（内网主机名），modelKey 是用户填的私有别名。
      meta: { modelVendor: PRIVATE_VENDOR_KEY, modelKey: PRIVATE_MODEL_KEY, imageModel: PRIVATE_MODEL_KEY },
    },
  ],
  edges: [],
  groups: [],
  selectedNodeIds: [],
}
fs.writeFileSync(projectFile, `${JSON.stringify(project, null, 2)}\n`)

// ─────────────────────────────────────────────────────────────────────────────
// 路径 A：规范入口（设置 → 关于 → 反馈与分享），全 UI 驱动，走私密 Tally 提交。
// ─────────────────────────────────────────────────────────────────────────────
{
  const { app, win } = await launch()
  const continueButton = win.getByText('继续创作', { exact: true }).first()
  if (await continueButton.isVisible().catch(() => false)) await continueButton.click()
  await win.waitForTimeout(2000)
  await installOpenRecorder(win)

  // 打开设置并落在「关于」tab（生产事件约定 nomi-open-settings + detail.tab）。
  await win.evaluate(() => window.dispatchEvent(new CustomEvent('nomi-open-settings', { detail: { tab: 'about' } })))
  const settingsDialog = win.getByRole('dialog', { name: '设置' })
  await expectVisible(settingsDialog, '设置弹窗没打开')
  await shot(settingsDialog, 'A01-settings-about.png')

  // 规范入口按钮（About 区块里的行；此时设置弹窗仍在，用 About 区块内的标题定位避免歧义）。
  await clickOrFail(
    settingsDialog.getByText('反馈与分享', { exact: true }).first(),
    '关于页「反馈与分享」入口',
  )

  // 对话框按稳定标题定位（内容会在 home/feedback/success 之间切，别绑页面专属文案）。
  const feedbackDialog = win.getByRole('dialog', { name: '反馈与分享' })
  await expectVisible(feedbackDialog, '反馈对话框没从 About 入口打开')
  await expectVisible(win.getByText('告诉我们哪里卡住了', { exact: false }), '反馈对话框 home 页没渲染')
  await shot(feedbackDialog, 'A02-feedback-home.png')

  // 进「告诉我们一件事」表单。
  await clickOrFail(win.getByText('告诉我们一件事', { exact: true }).first(), '反馈首页「告诉我们一件事」')
  await expectVisible(win.getByText('一句话说说发生了什么', { exact: true }), '反馈表单没出现（缺 summary 字段）')

  // 填一句话，选一个阶段。
  await win.getByPlaceholder('例如：接入模型后，点击生成一直没有反应').fill('从关于页进来测试反馈入口')

  // 展开「查看将附带的脱敏信息」——用户在此亲眼核对将带走的字段。
  await clickOrFail(win.getByText('查看将附带的脱敏信息', { exact: true }).first(), '展开脱敏信息 details')
  const diagPre = win.locator('details pre').first()
  await expectVisible(diagPre, '脱敏诊断预览没展开')
  const diagText = await diagPre.innerText()
  await shot(feedbackDialog, 'A03-feedback-diagnostics-expanded.png')

  // About 入口无 vendor 上下文 → 诊断包里根本不该出现 provider/model 键，更不该有任何私有串。
  for (const needle of [PRIVATE_VENDOR_KEY, PRIVATE_MODEL_KEY, 'corp-local']) {
    if (diagText.includes(needle)) {
      throw new Error(`About 入口的诊断预览里出现了不该有的私有串「${needle}」：\n${diagText}`)
    }
  }
  if (!/"stage"/.test(diagText) || !/"version"/.test(diagText)) {
    throw new Error(`诊断预览缺有界字段（应含 stage/version）：\n${diagText}`)
  }

  // 私密提交 → 记录外发 URL。
  await clickOrFail(win.getByRole('button', { name: '私密提交' }).first(), '私密提交')
  await expectVisible(win.getByText('反馈草稿已保存在本机，浏览器页面会继续提交', { exact: false }), '提交后没到 success 屏')
  await shot(feedbackDialog, 'A04-feedback-success.png')

  const openedA = await drainOpenLog(win)
  const tallyUrlA = openedA.find((u) => u.includes('tally.so'))
  const parsedA = assertUrlIsBoundedAndClean(tallyUrlA, 'A 路径私密提交')
  if (parsedA.searchParams.get('nomi_stage') == null) throw new Error('A 路径 Tally URL 缺 nomi_stage')
  console.log(`  ✓ A 路径 Tally URL 有界且干净：${parsedA.origin}${parsedA.pathname}?…（${[...parsedA.searchParams.keys()].join(',')}）`)

  // 本地草稿留痕：outbox 里有一条，destination=tally，且不含私有串。
  const outboxA = await readOutbox(win)
  if (!Array.isArray(outboxA) || outboxA.length < 1) throw new Error('A 路径提交后 outbox 没留下草稿')
  if (JSON.stringify(outboxA).includes(PRIVATE_VENDOR_KEY)) throw new Error('A 路径 outbox 草稿里混入了私有 vendor 串')

  await app.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// 路径 B：情境入口（生成失败卡上「反馈此问题」）——vendorKey 是私有 base-url 派生 key。
// 这条是本走查的核心断言：私有字符串必须在信封边界被换成 "custom"，不进 URL、不进 outbox。
// ─────────────────────────────────────────────────────────────────────────────
{
  const { app, win } = await launch()
  const continueButton = win.getByText('继续创作', { exact: true }).first()
  if (await continueButton.isVisible().catch(() => false)) await continueButton.click()
  await win.waitForTimeout(2200)
  await installOpenRecorder(win)

  // 切到「生成」工作区，让画布挂载。
  await clickOrFail(win.locator('[aria-label="工作区切换"]').getByText('生成', { exact: true }), '工作区切换→生成')
  await win.waitForTimeout(1200)

  // 失败节点应渲染出错误卡与「反馈此问题」。先证探针在这一屏是活的（基线），再截图。
  const failedNode = win.locator('[data-node-id="failed-shot"]')
  await expectVisible(failedNode, '失败节点没渲染出来（种子工程没被读到？）')
  const feedbackLink = failedNode.getByText('反馈此问题', { exact: true })
  const proof = await proveProbe(feedbackLink, '失败卡上「反馈此问题」链接存在')
  await shot(win, 'B01-canvas-failed-node.png')

  // 点情境入口。
  await clickOrFail(feedbackLink, '失败卡「反馈此问题」')
  const feedbackDialog = win.getByRole('dialog', { name: '反馈与分享' })
  await expectVisible(feedbackDialog, '失败卡没打开反馈对话框')
  await expectVisible(win.getByText('一句话说说发生了什么', { exact: true }), '失败卡进来没直达反馈表单')
  await shot(feedbackDialog, 'B02-feedback-from-failure.png')

  // 展开脱敏预览：私有 vendor / model 串一个都不能出现；provider 必须已是 "custom"。
  await clickOrFail(win.getByText('查看将附带的脱敏信息', { exact: true }).first(), '展开脱敏信息 details（B）')
  const diagPre = win.locator('details pre').first()
  await expectVisible(diagPre, '脱敏诊断预览没展开（B）')
  const diagText = await diagPre.innerText()
  await shot(feedbackDialog, 'B03-feedback-diagnostics-custom.png')
  for (const needle of [PRIVATE_VENDOR_KEY, PRIVATE_MODEL_KEY, 'corp-local', 'exec-secret']) {
    if (diagText.includes(needle)) {
      throw new Error(`失败卡诊断预览泄露了用户私有串「${needle}」——信封边界没把自定义 vendor 换成 custom：\n${diagText}`)
    }
  }
  let diag
  try {
    diag = JSON.parse(diagText)
  } catch {
    throw new Error(`诊断预览不是合法 JSON：\n${diagText}`)
  }
  if (diag?.context?.provider !== 'custom') {
    throw new Error(`失败卡诊断 provider 应为 "custom"，实际为 ${JSON.stringify(diag?.context?.provider)}`)
  }
  if (diag?.context?.model != null) {
    throw new Error(`失败卡诊断 model 应被丢弃（自定义 vendor 的 model 是用户输入），实际为 ${JSON.stringify(diag?.context?.model)}`)
  }

  // 填一句话并私密提交，捕获 URL。
  await win.getByPlaceholder('例如：接入模型后，点击生成一直没有反应').fill('失败卡进来的反馈，vendor 应脱敏')
  await clickOrFail(win.getByRole('button', { name: '私密提交' }).first(), '私密提交（B）')
  await expectVisible(win.getByText('反馈草稿已保存在本机，浏览器页面会继续提交', { exact: false }), '失败卡提交后没到 success 屏')

  const openedB = await drainOpenLog(win)
  const tallyUrlB = openedB.find((u) => u.includes('tally.so'))
  const parsedB = assertUrlIsBoundedAndClean(tallyUrlB, 'B 路径私密提交')
  if (parsedB.searchParams.get('nomi_provider') !== 'custom') {
    throw new Error(`B 路径 Tally URL 的 nomi_provider 应为 "custom"，实际 ${JSON.stringify(parsedB.searchParams.get('nomi_provider'))}\n  URL: ${tallyUrlB}`)
  }
  if (parsedB.searchParams.get('nomi_model') !== '') {
    throw new Error(`B 路径 Tally URL 的 nomi_model 应为空（自定义 model 丢弃），实际 ${JSON.stringify(parsedB.searchParams.get('nomi_model'))}`)
  }
  console.log(`  ✓ B 路径 Tally URL 已脱敏：nomi_provider=custom, nomi_model 空, 无私有串`)

  const outboxB = await readOutbox(win)
  if (JSON.stringify(outboxB).includes(PRIVATE_VENDOR_KEY) || JSON.stringify(outboxB).includes(PRIVATE_MODEL_KEY)) {
    throw new Error('B 路径 outbox 草稿里混入了私有 vendor/model 串')
  }

  // 收尾：关掉对话框后，失败卡上的「反馈此问题」应仍在（入口没被这次提交吃掉）。
  await win.keyboard.press('Escape').catch(() => {})
  await win.waitForTimeout(400)
  await expectVisible(win.locator('[data-node-id="failed-shot"]').getByText('反馈此问题', { exact: true }), '提交后情境入口消失了')

  // 反向对照：换一个**不含** vendor 串的探针，证明 expectAbsent 这套尺子在这一屏确实测得到——
  // 用同屏必然不存在的私有串做负向断言（provenBy 用上面证过的活探针）。
  await expectAbsent(win.getByText(PRIVATE_VENDOR_KEY, { exact: false }), {
    provenBy: proof,
    message: `画布任何可见文本里都不该出现私有 vendor 主机名「${PRIVATE_VENDOR_KEY}」`,
  })

  await app.close()
}

console.log('\n✓ feedback & share center walkthrough passed')
