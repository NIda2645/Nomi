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

// 自己的角色 = 自己的端口（原来借的是 `walk-agent-panel-v4`：三份入口并行跑会抢同一口）。
const LAB = { role: 'walk-ask-card-in-panel' }
const ROLE = LAB.role
const PORT = labPortFor(ROLE)
const BASE = `http://127.0.0.1:${PORT}`
const outDir = process.env.ASK_IN_PANEL_OUT || path.join(REPO_ROOT, 'tests/ux/shots/design-lab-ask-card-in-panel')
fs.mkdirSync(outDir, { recursive: true })

/**
 * 暗色走实验室**自己的开关** `?scheme=dark`（`designLab.tsx` → `applyNomiColorScheme`），
 * 它和真 App 同一条路：一次落三样——`data-mantine-color-scheme` 属性、`data-theme`、
 * 以及根节点的**内联** `color-scheme`。
 *
 * 这里走错过两次，都拍出了假证据：
 * ① 用 `AgentPanelV4Panel` 的 `darkMode` prop——它只换用户气泡底色，面板和卡一点不动；
 * ② 只手动翻 `data-mantine-color-scheme` 属性——token 翻了，但根上那句内联 `color-scheme: light`
 *    还在，于是**原生控件**（反问卡的单选圆点、计划卡的勾选框）照旧按浅色方案画：
 *    暗色卡面上三个实心白圆盘，看起来像三个都选中了。真 App 里不会这样，是取景方式造的假象。
 */
const STATES = [
  ['v4-panel-question-light', 'question', 'light'],
  ['v4-panel-question-light', 'question', 'dark'],
  // 付费卡 = **真卡**：正文是节点参数条那个共享组件，数据由生产投影 `projectSpendCard` 算。
  ['v4-panel-spend-light', 'spend', 'light'],
  ['v4-panel-spend-light', 'spend', 'dark'],
  // 普通确认卡（可撤销档）——同族第三张，验的是「换壳是一处改、全族生效」。
  ['v4-panel-approval-light', 'approval', 'light'],
  ['v4-panel-approval-light', 'approval', 'dark'],
  // 收尾补的三种：多题反问卡 / 多镜付费卡 / 未知价付费卡。
  ['v4-panel-question-multi', 'question-multi', 'light'],
  ['v4-panel-question-multi', 'question-multi', 'dark'],
  ['v4-panel-spend-batch', 'spend-batch', 'light'],
  ['v4-panel-spend-batch', 'spend-batch', 'dark'],
  ['v4-panel-spend-unknown', 'spend-unknown', 'light'],
  ['v4-panel-spend-unknown', 'spend-unknown', 'dark'],
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
      await page.goto(`${BASE}/design-lab.html?screen=agent-panel-v4&frame=1&state=${state}&scheme=${theme}`, { waitUntil: 'networkidle' })
      await page.waitForFunction(() => window.__designLabReady === true, null, { timeout: 20000 })
      // token 翻转带 transition，不等就会读到 / 拍到插值中的那一帧（灰不灰、蓝不蓝）。
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
        const close = card.querySelector('[data-v4-control="slot-dismiss"]')
        const closeRect = close?.getBoundingClientRect()
        const body = card.querySelector('[data-v4-block="ask-question"]')?.closest('div[class*="p-"]')
          ?? [...card.children].find((child) => child.querySelector('[data-v4-row]') || child.querySelector('p'))
        const composerStyle = composer ? getComputedStyle(composer) : null
        const shellOf = (style) => style ? {
          background: style.backgroundColor,
          borderColor: style.borderTopColor,
          borderWidth: style.borderTopWidth,
          radius: style.borderTopLeftRadius,
          shadow: style.boxShadow,
        } : null
        return {
          cardShell: shellOf(cs),
          composerShell: shellOf(composerStyle),
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
          // 原生单选 / 勾选控件按哪套方案画，由它**继承到的 `color-scheme`** 决定（UA 画的，
          // 没有 computed background 可读）。它必须等于当前主题，也必须等于同屏 composer 的。
          nativeSchemes: [...card.querySelectorAll('input[type="radio"], input[type="checkbox"]')].map((node) => getComputedStyle(node).colorScheme),
          composerScheme: composer ? getComputedStyle(composer).colorScheme : null,
          uncheckedChecked: [...card.querySelectorAll('input[type="radio"], input[type="checkbox"]')].filter((node) => node.checked).length,
          composerWidth: composerRect ? Math.round(composerRect.width) : null,
          composerGap: composerRect ? Math.round(composerRect.top - rect.bottom) : null,
        }
      })
      measured.push({ locale: tag, theme, kind, ...shape })
      // 参数条那一行：**任意两颗控件不许相互压住**（EN 下「Kling 3.0」盖住「16:9」就是这个）。
      // 量的是真矩形——相邻两颗的右缘不许越过下一颗的左缘。
      const overlaps = await shot.locator('[data-node-composer-footer]').evaluateAll((rows) => {
        const hits = []
        for (const row of rows) {
          const boxes = [...row.querySelectorAll('button, [data-parameter-chip]')]
            .map((node) => ({ node, rect: node.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width > 0 && rect.height > 0)
            // 只比最外层的可点块：chip 的 span 里包着它自己的 button，父子不算相压。
            .filter(({ node }, _, all) => !all.some((other) => other.node !== node && other.node.contains(node)))
            .sort((a, b) => a.rect.left - b.rect.left)
          for (let i = 1; i < boxes.length; i += 1) {
            if (boxes[i - 1].rect.right > boxes[i].rect.left + 1) {
              hits.push(`${(boxes[i - 1].node.textContent || '').trim().slice(0, 14)} → ${(boxes[i].node.textContent || '').trim().slice(0, 14)}`)
            }
          }
        }
        return hits
      })
      if (overlaps.length) failures.push(`${tag}/${theme}/${kind}：参数条里控件相互压住：${overlaps.join(' | ')}`)
      // 页脚左下那一格（合计 / 价格未知那句）不许被省略号截断——EN 串长，截断只有眼睛看得出，
      // 所以量它：内容宽不许超过自己的盒子。
      const leadClipped = await shot.locator('[data-v4-block="slot-total"]').evaluateAll((nodes) =>
        nodes.filter((node) => node.scrollWidth - node.clientWidth > 1).length)
      if (leadClipped) failures.push(`${tag}/${theme}/${kind}：页脚左下那句被截断了`)
      if (kind === 'spend-unknown') {
        const enabled = await shot.locator('[data-v4-control="confirm"]').isEnabled()
        if (!enabled) failures.push(`${tag}/${theme}/${kind}：算不出价时主按钮被禁用了——用户硬性拍板：算不出价绝不拦生成`)
      }
      if (shape.missing) failures.push(`${tag}/${theme}/${kind}：面板里没渲染出介入槽`)
      if (shape.scheme !== theme) failures.push(`${tag}/${theme}/${kind}：主题没翻过去（量到 ${shape.scheme}）`)
      for (const native of shape.nativeSchemes ?? []) {
        if (native !== theme || native !== shape.composerScheme) {
          failures.push(`${tag}/${theme}/${kind}：原生圆点按「${native}」方案画，主题是 ${theme}、composer 是 ${shape.composerScheme}——暗色下会画成实心白盘，像全选中了`)
        }
      }
      if (shape.uncheckedChecked) failures.push(`${tag}/${theme}/${kind}：卡一挂上来就有 ${shape.uncheckedChecked} 个选项是选中态——「推荐」只是记号，不预选`)
      // **卡是 composer 的兄弟**（用户 2026-09-22 看真机后的验收标准）：底色、描边色、描边粗细、
      // 圆角、阴影的 computed 值必须与同屏 composer **逐字相等**，明暗都是。
      // 读之前已经等过主题 transition（上面那 400ms），否则读到的是插值中的那一帧。
      if (!shape.composerShell) failures.push(`${tag}/${theme}/${kind}：同屏找不到 composer，兄弟对账做不了`)
      else for (const key of ['background', 'borderColor', 'borderWidth', 'radius', 'shadow']) {
        if (shape.cardShell[key] !== shape.composerShell[key]) {
          failures.push(`${tag}/${theme}/${kind}：卡与 composer 的 ${key} 不相等（卡「${shape.cardShell[key]}」/ composer「${shape.composerShell[key]}」）`)
        }
      }
    }
    await context.close()
  }

  // 同槽两张卡的外壳必须**同族**。这几条不是审美偏好，是「一眼看出是不是一家人」的机器判据。
  for (const kind of ['question', 'spend', 'approval']) {
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
  `shots: ${outDir} (6 kinds × light/dark × zh/en = 24)`,
  `measured: ${JSON.stringify(measured, null, 2)}`,
  'covers: the ask card rendered in its real place (conversation above, composer below, panel shell around) next to the paid confirm card in the same slot, with shell metrics (width, border, radius, shadow, head band, padding, primary button family, close button, composer gap) measured on both so they can be reconciled side by side.',
  failures.length ? `failures: ${failures.join(' | ')}` : 'failures: none',
].join('\n')
fs.writeFileSync(path.join(outDir, 'report.md'), `${report}\n`)
console.log(report)
if (failures.length) process.exit(1)
