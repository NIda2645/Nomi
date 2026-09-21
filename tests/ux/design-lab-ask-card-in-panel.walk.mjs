// 反问卡**放进真面板之后**长什么样（2026-09-21 用户问「有弄我们的设计系统不？会不会格格不入？」）。
//
// 单件取景框证不了这件事：那里的卡是浅色底、孤零零一格，看不出它和邻居合不合得来。
// 这条走查把它放回真位置（上面对话流、下面 composer、外面面板壳），并且**和付费确认卡
// 用同一个取景**各拍一张，好让两张卡并排对账。
//
// 除了拍照，还**量**同槽两张卡的外壳：外框色/粗细、圆角、内边距、卡头条、按钮族、
// 卡宽是否与 composer 对齐。「用了 token」不等于「放进去不突兀」——差异要量得出来才谈得上统一。
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './design-lab/labStates.mjs'
import { assertLabPortOwnership, labPortFor } from './design-lab/labServer.mjs'

const ROLE = 'walk-agent-panel-v4'
const PORT = labPortFor(ROLE)
const BASE = `http://127.0.0.1:${PORT}`
const outDir = process.env.ASK_IN_PANEL_OUT || path.join(REPO_ROOT, 'tests/ux/shots/design-lab-ask-card-in-panel')
fs.mkdirSync(outDir, { recursive: true })

/**
 * 暗色**翻的是真 token**（`:root[data-mantine-color-scheme="dark"]`，tailwind.config 的暗色块），
 * 不是 `AgentPanelV4Panel` 的 `darkMode` prop——那个只把用户气泡从 ink 底换成 ink-10 底，
 * 面板底色、卡描边、文字全不动。第一版我拿它当暗色拍，拍出来的四张有两张是一样的浅色，
 * 「暗色下也不突兀」这句话等于没证。
 */
const STATES = [
  ['v4-panel-question-light', 'question', 'light'],
  ['v4-panel-question-light', 'question', 'dark'],
  ['v4-panel-spend-light', 'spend', 'light'],
  ['v4-panel-spend-light', 'spend', 'dark'],
]

const failures = []
const measured = []

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return resolve() } catch { /* not up */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('vite dev server 启动超时'))
      setTimeout(tick, 400)
    }
    tick()
  })
}

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'pipe'],
})
vite.stderr?.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
await waitForServer(`${BASE}/design-lab.html`)
assertLabPortOwnership(ROLE)

const browser = await chromium.launch({ headless: true })
try {
  for (const locale of ['zh-CN', 'en']) {
    const context = await browser.newContext({ viewport: { width: 520, height: 960 }, deviceScaleFactor: 2 })
    await context.addInitScript(([key, value]) => { window.localStorage.setItem(key, value) }, ['nomi:locale:v1', locale])
    const page = await context.newPage()
    const tag = locale === 'zh-CN' ? 'zh' : 'en'
    for (const [state, kind, theme] of STATES) {
      await page.goto(`${BASE}/design-lab.html?screen=agent-panel-v4&frame=1&state=${state}`, { waitUntil: 'networkidle' })
      await page.waitForFunction(() => window.__designLabReady === true, null, { timeout: 20000 })
      await page.evaluate((scheme) => {
        document.documentElement.setAttribute('data-mantine-color-scheme', scheme)
      }, theme)
      // token 翻转带 transition，不等就会拍到插值中的那一帧（灰不灰、蓝不蓝）。
      await page.waitForTimeout(400)
      const shot = page.locator(`[data-design-lab-shot="${state}"]`)
      await shot.waitFor({ state: 'visible', timeout: 10000 })
      await page.waitForTimeout(300)
      await shot.screenshot({ path: path.join(outDir, `${tag}-${theme}-${kind}.png`) })

      /**
       * 量这张卡的外壳，以及它和 composer 的关系。
       * 两张卡量的是**同一批字段**，报告里才能并排成一张表。
       */
      const shape = await shot.evaluate((element) => {
        const card = element.querySelector('[data-v4-block="intervention"]')
        if (!card) return { missing: true }
        const cs = getComputedStyle(card)
        const rect = card.getBoundingClientRect()
        const composer = element.querySelector('[data-v4-block="composer"]')
          ?? element.querySelector('textarea')?.closest('div[class]')
        const composerRect = composer?.getBoundingClientRect()
        // 卡头条 = 卡里第一个有非透明背景的块级子元素
        const head = [...card.children].find((child) => {
          const style = getComputedStyle(child)
          return style.backgroundColor !== 'rgba(0, 0, 0, 0)' && child.getBoundingClientRect().height > 0
        })
        const primary = card.querySelector('[data-v4-control="confirm"], [data-v4-control="ask-continue"]')
        const primaryRect = primary?.getBoundingClientRect()
        const close = card.querySelector('[data-v4-control="reject"], [data-v4-control="ask-dismiss"]')
        const closeRect = close?.getBoundingClientRect()
        const body = card.querySelector('[data-v4-block="ask-question"]')?.closest('div[class*="p-"]')
          ?? [...card.children].find((child) => child.querySelector('[data-v4-row]') || child.querySelector('p'))
        return {
          width: Math.round(rect.width),
          border: `${cs.borderTopWidth} ${cs.borderTopColor}`,
          radius: cs.borderTopLeftRadius,
          shadow: cs.boxShadow === 'none' ? 'none' : 'yes',
          background: cs.backgroundColor,
          headBand: head ? getComputedStyle(head).backgroundColor : 'none',
          headPad: head ? getComputedStyle(head).padding : '—',
          bodyPad: body ? getComputedStyle(body).padding : '—',
          primary: primary ? {
            label: (primary.textContent || '').trim().slice(0, 10),
            radius: getComputedStyle(primary).borderTopLeftRadius,
            height: Math.round(primaryRect.height),
            bg: getComputedStyle(primary).backgroundColor,
            // 主按钮在卡里靠左还是靠右
            side: primaryRect.left - rect.left < rect.right - primaryRect.right ? 'left' : 'right',
          } : null,
          close: close ? {
            size: `${Math.round(closeRect.width)}×${Math.round(closeRect.height)}`,
            // × 在卡顶还是卡底
            where: closeRect.top - rect.top < rect.bottom - closeRect.bottom ? 'top' : 'bottom',
          } : null,
          scheme: document.documentElement.getAttribute('data-mantine-color-scheme'),
          composerWidth: composerRect ? Math.round(composerRect.width) : null,
          composerGap: composerRect ? Math.round(composerRect.top - rect.bottom) : null,
        }
      })
      measured.push({ locale: tag, theme, kind, ...shape })
      if (shape.missing) failures.push(`${tag}/${theme}/${kind}：面板里没渲染出介入槽`)
      if (shape.scheme !== theme) failures.push(`${tag}/${theme}/${kind}：主题没翻过去（量到 ${shape.scheme}）`)
    }
    await context.close()
  }

  // 同槽两张卡的外壳必须**同族**。这几条不是审美偏好，是「一眼看出是不是一家人」的机器判据。
  for (const kind of ['question', 'spend']) {
    const light = measured.find((row) => row.locale === 'zh' && row.theme === 'light' && row.kind === kind)
    const dark = measured.find((row) => row.locale === 'zh' && row.theme === 'dark' && row.kind === kind)
    if (light && dark && light.background === dark.background) {
      failures.push(`${kind}：亮暗两轨卡底色一样（${light.background}）——token 没翻，这张「暗色」什么都没证`)
    }
  }
  for (const theme of ['light', 'dark']) {
    const ask = measured.find((row) => row.locale === 'zh' && row.theme === theme && row.kind === 'question')
    const spend = measured.find((row) => row.locale === 'zh' && row.theme === theme && row.kind === 'spend')
    if (!ask || !spend || ask.missing || spend.missing) continue
    if (ask.width !== spend.width) failures.push(`${theme}：两张卡不一样宽（反问 ${ask.width} / 付费 ${spend.width}）——同一个槽里宽度必须一致`)
    if (ask.radius !== spend.radius) failures.push(`${theme}：圆角不一样（反问 ${ask.radius} / 付费 ${spend.radius}）`)
    if (ask.border !== spend.border) failures.push(`${theme}：外框不一样（反问「${ask.border}」/ 付费「${spend.border}」）`)
    if (ask.primary && spend.primary && ask.primary.radius !== spend.primary.radius) {
      failures.push(`${theme}：主按钮圆角不一样（反问 ${ask.primary.radius} / 付费 ${spend.primary.radius}）——按钮族要同一套`)
    }
    if (ask.primary && spend.primary && ask.primary.height !== spend.primary.height) {
      failures.push(`${theme}：主按钮高度不一样（反问 ${ask.primary.height} / 付费 ${spend.primary.height}）`)
    }
    if (ask.composerGap !== null && spend.composerGap !== null && ask.composerGap !== spend.composerGap) {
      failures.push(`${theme}：卡与 composer 的间距不一样（反问 ${ask.composerGap} / 付费 ${spend.composerGap}）`)
    }
  }
} catch (error) {
  failures.push(`走查中断：${error?.message || error}`)
} finally {
  await browser.close().catch(() => undefined)
  vite.kill('SIGTERM')
}

const report = [
  '# design lab · ask card inside the real panel',
  '',
  `result: ${failures.length ? 'failed' : 'passed'}`,
  `shots: ${outDir} (question/spend × light/dark × zh/en = 8)`,
  `measured: ${JSON.stringify(measured, null, 2)}`,
  'covers: the ask card rendered in its real place (conversation above, composer below, panel shell around) next to the paid confirm card in the same slot, with shell metrics (width, border, radius, shadow, head band, padding, primary button family, close button, composer gap) measured on both so they can be reconciled side by side.',
  failures.length ? `failures: ${failures.join(' | ')}` : 'failures: none',
].join('\n')
fs.writeFileSync(path.join(outDir, 'report.md'), `${report}\n`)
console.log(report)
if (failures.length) process.exit(1)
