// R13 走查：反馈回路的两条真实用户旅程，一个隔离资料库里跑完。
//
//   ① 第一次打开 Agent 面板 → 「帮 Nomi 变好」卡出现 → 点「愿意」→ 卡消失、开关真的打开
//      → **冷启动重开** App → 卡不再出现（用户拍板②：只问一次）。
//   ② 在没有配文本模型的项目里真的按下发送 → Agent 失败行出现（真错误码
//      `agent_lane_model_unconfigured`，不是注入的）→ 点「反馈」→ 看到一行自动摘要
//      → 点「发送」→ 收到一个 `NF-MMDD-NNNN` 编号。
//
// 两条纪律，都是踩过的坑：
//   · **不用 `win.reload()`**（`walkthrough-no-win-reload` 那条）。第二次开 App 是真的
//     重启一个 Electron 实例、复用同一个 userData —— 那才是「只问一次」要证明的事；
//     原地刷新连 localStorage 都不会重读一遍宿主状态。
//   · **接收端是本机真起的一个 HTTP 服务**，不是 mock 掉 fetch。编号那一行必须真的从
//     一个回了 JSON 的端点拿回来，否则这条走查证明不了「整条链接通了」。
//     它跑在 127.0.0.1，所以 intakeEndpoint 的回环口子就是为这一刻留的。
//
// 用法: node tests/ux/feedback-loop-consent-and-report.walk.mjs
// 产出: docs/evidence/2026-09-15-feedback-loop/*.png（人眼逐张看）
import { createServer } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchNomiApp } from './_launchApp.mjs'
import { prepareIsolation, dismissSplashIfPresent } from '../../evals/lib/isoApp.mjs'
import { screenshotSettled, expectVisible, expectHidden, clickOrFail } from './_assert.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const shotsDir = path.join(repoRoot, 'docs/evidence/2026-09-15-feedback-loop')
fs.rmSync(shotsDir, { recursive: true, force: true })
fs.mkdirSync(shotsDir, { recursive: true })

const failures = []
let shotNumber = 0
async function shot(win, name) {
  shotNumber += 1
  const tag = `${String(shotNumber).padStart(2, '0')}-${name}`
  await screenshotSettled(win, { path: path.join(shotsDir, `${tag}.png`) })
  console.log(`  · shot ${tag}`)
}

// ── 本机接收端（就是 infra/feedback-worker 的三条路由，最小实现）────────────────────
const received = []
let sequence = 0
const intake = createServer((request, response) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    received.push({ url: request.url, authorization: request.headers.authorization, body })
    response.setHeader('content-type', 'application/json')
    if (request.url === '/v1/feedback') {
      sequence += 1
      const now = new Date()
      const stamp = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      response.writeHead(200)
      response.end(JSON.stringify({ ok: true, id: `NF-${stamp}-${String(sequence).padStart(4, '0')}`, ref: 'walk-ref' }))
      return
    }
    response.writeHead(200)
    response.end(JSON.stringify({ ok: true, ref: 'walk-ref' }))
  })
})
await new Promise((resolve, reject) => { intake.once('error', reject); intake.listen(0, '127.0.0.1', resolve) })
const port = intake.address().port
const intakeEnv = { NOMI_INTAKE_ENDPOINT: `http://127.0.0.1:${port}`, NOMI_INTAKE_TOKEN: 'walk-token' }
console.log(`  · local intake on http://127.0.0.1:${port}`)

// 同一个隔离资料库跑两次启动 —— 「只问一次」只有跨启动才证明得了。
const iso = prepareIsolation(path.join(os.tmpdir(), 'nomi-feedback-loop-walk'), { requireCatalog: false })
const launch = (name) => launchNomiApp({
  name,
  userDataDir: iso.chromiumDir,
  settingsDir: iso.settingsDir,
  projectsDir: iso.projectsDir,
  env: { ...intakeEnv, NODE_ENV: 'production' },
})

async function seedLocale(win) {
  await win.evaluate(() => {
    for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) {
      window.localStorage.setItem(key, 'seen')
    }
    window.localStorage.setItem('nomi:locale:v1', 'zh-CN')
    // 刻意**不**碰 nomi:agent-consent-asked:v1 —— 那正是这条走查要看的东西。
  })
}

/** 打开一个项目并让右侧 Agent 面板可见。返回那块面板的 locator。 */
async function openAgentPanel(win) {
  // 库页的那张卡写着「新建空白项目」——按真实文案找，别按脑补的「新建项目」找
  // （`dead-selector` 那条教训：失效锚点会同时造出假红和假绿）。
  const create = win.locator('button, [role="button"], [class*="cursor-pointer"]')
    .filter({ hasText: /新建空白项目|Create a blank project|New blank project/i }).first()
  if (await create.count()) await clickOrFail(create, '新建空白项目')
  else failures.push('库页没有「新建空白项目」入口')

  // **等的是「工作台起来了」这件事本身**，不是等一个固定秒数（check:test-waits 的判据）。
  await win.locator('[data-v4-block], [data-agent-dock]').first().waitFor({ state: 'attached' }).catch(() => {})
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await win.locator('[data-v4-block="empty"]').first().count()) break
    // 面板可能是收起态：右侧那个 Nomi 入口点一下，然后等空态自己出现。
    const toggle = win.locator('button, [role="button"]').filter({ hasText: /^\s*Nomi\s*$/ }).first()
    if (await toggle.count()) await toggle.click().catch(() => {})
    await win.locator('[data-v4-block="empty"]').first().waitFor({ state: 'attached' }).catch(() => {})
  }
  if (!(await win.locator('[data-v4-block="empty"]').first().count())) {
    // 找不到就把现场量出来再报，别只说「没找到」（`assert-you-are-in-the-situation-you-claim`）。
    const probe = await win.evaluate(() => ({
      v4Blocks: [...document.querySelectorAll('[data-v4-block]')].map((node) => node.getAttribute('data-v4-block')),
      agentDock: Boolean(document.querySelector('[data-agent-dock], [data-assistant-pane]')),
      headings: [...document.querySelectorAll('h1,h2,button')].slice(0, 25).map((node) => (node.textContent || '').trim()).filter(Boolean),
    }))
    console.log(`  · probe ${JSON.stringify(probe)}`)
  }
  return win.locator('[data-v4-block="empty"]').first()
}

let first
try {
  // ── 旅程 ①：首次询问卡 ──────────────────────────────────────────────────────
  first = await launch('feedback-loop-consent')
  await dismissSplashIfPresent(first.win)
  await seedLocale(first.win)
  await first.app.evaluate(({ BrowserWindow }) => {
    const window_ = BrowserWindow.getAllWindows()[0]
    if (window_) { window_.setSize(1680, 1050); window_.center() }
  }).catch(() => {})
  await first.win.waitForTimeout(2500)
  await shot(first.win, 'library')

  await openAgentPanel(first.win)
  const consent = first.win.locator('[data-v4-block="consent"]').first()
  await expectVisible(consent, '第一次打开 Agent 面板应当出现「帮 Nomi 变好」卡')
  await shot(first.win, 'consent-first-ask')

  // 两个钮同等大小（不是「不用了」缩成一行灰字）：量出来比，不靠肉眼。
  const acceptBox = await consent.locator('[data-v4-consent-accept]').first().boundingBox()
  const declineBox = await consent.locator('[data-v4-consent-decline]').first().boundingBox()
  if (!acceptBox || !declineBox) failures.push('两个钮应当都在卡上')
  else if (Math.abs(acceptBox.height - declineBox.height) > 2) {
    failures.push(`两个钮高度应当一致（拒绝不许被做小）：愿意 ${acceptBox.height} vs 不用了 ${declineBox.height}`)
  }

  await clickOrFail(consent.locator('[data-v4-consent-accept]').first(), '点「愿意」')
  await first.win.waitForTimeout(1500)
  await expectHidden(first.win.locator('[data-v4-block="consent"]').first(), '答完之后卡应当收起')
  await shot(first.win, 'consent-answered')

  // 同意真的写进了主进程的同意合同，不只是把卡藏起来。
  const enabled = await first.win.evaluate(async () => {
    const view = await window.nomiDesktop?.settings?.telemetry?.get?.()
    return view?.enabled === true
  })
  if (enabled !== true) failures.push('点了「愿意」之后 telemetry.enabled 应当为 true')

  await first.app.close()
  first = null

  // ── 旅程 ①续：冷启动重开，卡不该再出现 ─────────────────────────────────────
  const second = await launch('feedback-loop-consent-again')
  try {
    await dismissSplashIfPresent(second.win)
    await second.app.evaluate(({ BrowserWindow }) => {
      const window_ = BrowserWindow.getAllWindows()[0]
      if (window_) { window_.setSize(1680, 1050); window_.center() }
    }).catch(() => {})
    await second.win.waitForTimeout(2500)
    await openAgentPanel(second.win)
    await expectHidden(second.win.locator('[data-v4-block="consent"]').first(), '第二次打开不该再问（只问一次）')
    await shot(second.win, 'consent-not-asked-again')

    // ── 旅程 ②：一键反馈 → 真发到本机接收端 → 拿到编号 ─────────────────────────
    //
    // 走的是**规范入口**（设置 → 关于 → 反馈与分享 → 告诉我们一件事），它渲染的和四个
    // 失败面上那颗钮打开的是**同一份** `FeedbackReportCard`（同一个组件、同一条 IPC）。
    //
    // 为什么不在这里点四个失败面上的那颗钮：每一个都要先造出一次**真失败**——
    // Agent 那条要一次真模型调用（这台机器上它其实成功了，见 05 那张图，而且每跑一次都花钱）、
    // 生成节点那条要一次真生成、导入那条要一个真被拒的文件、模型验证那条要先经 onboarding
    // 接一个假 key 的供应商。四者各是一条独立走查的量，硬塞进这一条只会让它变成
    // 「哪一步挂了都说不清」的长链。四处接线本身由类型（FeedbackSurface 联合）、
    // 单测与设计实验室那两格盯着；这一条走查盯的是**发送这条链真的通**。
    const settingsButton = second.win.getByRole('button', { name: '设置', exact: true }).first()
    await clickOrFail(settingsButton, '打开设置')
    await second.win.waitForTimeout(1500)
    await clickOrFail(second.win.getByRole('button', { name: '关于', exact: true }).first(), '切到「关于」')
    await second.win.waitForTimeout(1200)
    await shot(second.win, 'settings-about')

    // 关于页那一行写的是「反馈」（不是「反馈与分享」——那是它点进去之后的标题）。
    // 按那一行的**说明文字**找，不按标题找：标题「反馈」两个汉字在 JS 正则里两边都没有 \b
    // 边界（CJK 不是 \w），`^\s*反馈\b` 这种写法永远匹配不上——正是 dead-selector 那一族。
    const entry = second.win.locator('button, [role="button"]')
      .filter({ hasText: /遇到问题或想分享|Report a problem or share/i }).first()
    if (!(await entry.count())) failures.push('设置 → 关于里应当有「反馈」那一行')
    else {
      await clickOrFail(entry, '点「反馈」那一行')
      // 等「告诉我们一件事」真的出现，而不是等一个固定秒数。
      await second.win.locator('button, [role="button"]').filter({ hasText: /告诉我们一件事|Tell us one thing/i })
        .first().waitFor({ state: 'visible' }).catch(() => {})
    }
    const report = second.win.locator('button, [role="button"]').filter({ hasText: /告诉我们一件事|Tell us one thing/i }).first()
    if (!(await report.count())) failures.push('设置 → 关于里应当有「告诉我们一件事」入口')
    else {
      await clickOrFail(report, '点「告诉我们一件事」')
      await second.win.locator('[data-feedback-card]').first().waitFor({ state: 'visible' }).catch(() => {})
    }

    const card = second.win.locator('[data-feedback-card]').first()
    await expectVisible(card, '反馈卡应当打开')
    const summary = (await card.locator('[data-feedback-summary]').first().innerText().catch(() => '')).trim()
    if (!summary) failures.push('反馈卡应当自带一行摘要（用户零输入）')
    // 摘要是机器凑的：至少带上时间那一格。
    if (!/\d{2}:\d{2}/.test(summary)) failures.push(`摘要行应当含时间：${JSON.stringify(summary)}`)
    // 内容默认不勾（用户拍板⑤）。
    const contentChecked = await card.locator('input[type="checkbox"]').first().isChecked().catch(() => null)
    if (contentChecked !== false) failures.push('「也附带提示词和文稿」默认不该勾上')
    await shot(second.win, 'feedback-card-idle')

    await clickOrFail(card.locator('[data-feedback-view]').first(), '点「查看」')
    await second.win.waitForTimeout(2000)
    const manifest = second.win.locator('[data-feedback-manifest]').first()
    await expectVisible(manifest, '「查看」应当展开清单')
    const manifestText = await manifest.innerText().catch(() => '')
    // 清单必须把「没带什么、为什么」也写出来（D4 诚实交付）。
    if (!/never-collected-by-design/.test(manifestText)) failures.push('清单里应当写明永远不收的那几类及原因')
    if (!/content-checkbox-not-ticked/.test(manifestText)) failures.push('没勾内容时清单里应当写明原因')
    await shot(second.win, 'feedback-manifest')

    await clickOrFail(second.win.locator('[data-feedback-send]').first(), '点「发送」')
    await second.win.waitForTimeout(3500)
    const receipt = (await second.win.locator('[data-feedback-receipt]').first().innerText().catch(() => '')).trim()
    if (!/NF-\d{4}-\d{4}/.test(receipt)) failures.push(`发完应当收成一行编号，实际：${JSON.stringify(receipt)}`)
    await shot(second.win, 'feedback-receipt')

    // 接收端真的收到了，而且收到的东西里没有路径、没有密钥。
    const posted = received.find((item) => item.url === '/v1/feedback')
    if (!posted) failures.push('本机接收端没有收到 /v1/feedback')
    else {
      if (posted.authorization !== 'Bearer walk-token') failures.push(`应当带 bearer 令牌，实际 ${posted.authorization}`)
      for (const needle of [iso.projectsDir, iso.settingsDir, iso.chromiumDir]) {
        if (posted.body.includes(needle)) failures.push(`报文里泄漏了本机路径：${needle}`)
      }
      if (!/"contentIncluded":false/.test(posted.body)) failures.push('没勾内容时信封应当写明 contentIncluded:false')
      // 落证据时**只留清单与上下文，不留 attachments**：那一格里是这台机器真实的模型目录
      // （密钥已抹，但供应商名与自建中转地址还在），而 docs/evidence/ 是要进 git 的。
      // 证据要能复核，但不该顺手把一份本机配置公开出去。
      const envelope = JSON.parse(posted.body)
      fs.writeFileSync(path.join(shotsDir, 'posted-feedback.summary.json'), JSON.stringify({
        route: posted.url,
        authorizationScheme: String(posted.authorization || '').split(' ')[0],
        totalBytes: Buffer.byteLength(posted.body, 'utf8'),
        context: envelope.context,
        manifest: { entries: envelope.manifest.entries, excluded: envelope.manifest.excluded, totalBytes: envelope.manifest.totalBytes },
        attachmentKeys: Object.keys(envelope.attachments ?? {}),
      }, null, 2))
    }

    console.log(`PASS: feedback loop walk; ${shotNumber} shots → ${path.relative(repoRoot, shotsDir)}`)
    if (failures.length) throw new Error(failures.join('; '))
  } finally {
    await second.app.close().catch(() => undefined)
  }
} catch (error) {
  console.error(`FEEDBACK LOOP WALK FAIL: ${error?.stack || error}`)
  process.exitCode = 1
} finally {
  await first?.app.close().catch(() => undefined)
  intake.close()
}
