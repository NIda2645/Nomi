// 反问卡「通用性」补验（2026-09-21 用户原话：「这个是通用的吧，只有那一种反问就离谱了」）。
//
// 设计实验室里那六格换的是**题目**，不是皮肤：无选项纯自由作答 / 2 个 / 4 个长短不一 /
// 只有标签 / 熔断来源 / 缺参数来源。这条走查把它们在 **zh 和 en 两轨**各拍一张，
// 并对每一格做同一套机器判据——**截断、溢出、错位**这三样，眼睛看得出、断言也必须数得出。
//
// 为什么非要两轨：英文串长 1.5–2 倍，而这六格里有一条是刻意写长的说明。
// 只拍中文那一轨，等于把最容易出事的那一种情况排除在证据之外。
//
// 用法: node tests/ux/design-lab-question-card-generality.walk.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './design-lab/labStates.mjs'
import { assertLabPortOwnership, labPortFor } from './design-lab/labServer.mjs'

const ROLE = 'walk-agent-panel-v4'
const PORT = labPortFor(ROLE)
const BASE = `http://127.0.0.1:${PORT}`
const outDir = process.env.QUESTION_CARD_WALK_OUT || path.join(REPO_ROOT, 'tests/ux/shots/design-lab-question-card')
fs.mkdirSync(outDir, { recursive: true })

/** 六种问法 = 用户点名要补齐的那六格（⑤熔断此前已有，一并再拍一次）。 */
const STATES = [
  'v4-intervention-question',
  'v4-intervention-question-free',
  'v4-intervention-question-two-options',
  'v4-intervention-question-four-mixed',
  'v4-intervention-question-labels-only',
  'v4-intervention-question-retry',
  'v4-intervention-question-missing-param',
]

const failures = []
const measured = []

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url)
        if (response.ok || response.status === 404) return resolve()
      } catch { /* not up yet */ }
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
// 应答了不等于是我起的那一个（这台机器常年 20+ worktree）——不证明就可能截回别人分支的 UI。
assertLabPortOwnership(ROLE)

const browser = await chromium.launch({ headless: true })
try {
  for (const locale of ['zh-CN', 'en']) {
    const context = await browser.newContext({ viewport: { width: 520, height: 720 }, deviceScaleFactor: 2 })
    await context.addInitScript(([key, value]) => { window.localStorage.setItem(key, value) }, ['nomi:locale:v1', locale])
    const page = await context.newPage()
    const tag = locale === 'zh-CN' ? 'zh' : 'en'
    for (const state of STATES) {
      await page.goto(`${BASE}/design-lab.html?screen=agent-panel-v4&frame=1&state=${state}`, { waitUntil: 'networkidle' })
      await page.waitForFunction(() => window.__designLabReady === true, null, { timeout: 20000 })
      const shot = page.locator(`[data-design-lab-shot="${state}"]`)
      await shot.waitFor({ state: 'visible', timeout: 10000 })
      await page.waitForTimeout(250)
      await shot.screenshot({ path: path.join(outDir, `${tag}-${state}.png`) })

      /**
       * 三样机器判据，都在**卡自己的盒子**里量：
       *   ① 溢出：任何叶子越出卡片左右缘；
       *   ② 截断：任何元素的内容比它的盒子宽（`scrollWidth > clientWidth`）——
       *      这一条专抓「一行字被切掉后半句」，它不会产生越界矩形，光量 ① 抓不到；
       *   ③ 错位：选项 chip 的行没有挂在卡里（出现在卡的上方或下方之外）。
       * 另外记一条正向基线：这一格到底渲出了几个选项、有没有那一行自由输入——
       * 没有基线的「没发现问题」和「根本没渲染」长得一模一样。
       */
      const shape = await shot.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const overflowing = []
        const clipped = []
        for (const node of element.querySelectorAll('*')) {
          const nodeRect = node.getBoundingClientRect()
          if (nodeRect.width < 1 && nodeRect.height < 1) continue
          if (!node.childElementCount && (nodeRect.right > rect.right + 1 || nodeRect.left < rect.left - 1)) {
            overflowing.push(`${node.tagName.toLowerCase()}:${(node.textContent || '').trim().slice(0, 28)}`)
          }
          if (node.scrollWidth - node.clientWidth > 1 && getComputedStyle(node).overflowX !== 'visible') {
            clipped.push(`${node.tagName.toLowerCase()}:${(node.textContent || '').trim().slice(0, 28)}`)
          }
        }
        const chips = element.querySelectorAll('[data-v4-control="question-option"]')
        const answerRow = element.querySelectorAll('[data-v4-control="question-answer"]').length
        const misplaced = [...chips].filter((chip) => {
          const chipRect = chip.getBoundingClientRect()
          return chipRect.top < rect.top - 1 || chipRect.bottom > rect.bottom + 1
        }).length
        return { width: Math.round(rect.width), height: Math.round(rect.height), options: chips.length, answerRow, overflowing, clipped, misplaced }
      })
      measured.push({ locale: tag, state, ...shape })
      if (shape.height < 40) failures.push(`${tag}/${state}：卡几乎没有高度（${shape.height}px），这一格什么都没证`)
      if (shape.overflowing.length) failures.push(`${tag}/${state}：${shape.overflowing.length} 处越出卡外 → ${shape.overflowing.join(' / ')}`)
      if (shape.clipped.length) failures.push(`${tag}/${state}：${shape.clipped.length} 处被自己的盒子切掉 → ${shape.clipped.join(' / ')}`)
      if (shape.misplaced) failures.push(`${tag}/${state}：${shape.misplaced} 个选项跑到卡外面去了`)
      // 每一张反问卡都必须带卡内那一行自由输入（2026-09-21 拍板，不分有没有选项）。
      if (shape.answerRow !== 1) failures.push(`${tag}/${state}：卡内自由作答那一行有 ${shape.answerRow} 个，说好永远恰好一行`)
    }
    await context.close()
  }

  // 正向基线：这六格确实覆盖了「没有选项 / 2 个 / 4 个」三种数量，不是六张一模一样的卡。
  const zh = measured.filter((row) => row.locale === 'zh')
  const counts = new Set(zh.map((row) => row.options))
  for (const expected of [0, 2, 4]) {
    if (!counts.has(expected)) failures.push(`六格里没有一格是 ${expected} 个选项——通用性没被覆盖到，只是换了文案`)
  }
} catch (error) {
  failures.push(`走查中断：${error?.message || error}`)
} finally {
  await browser.close().catch(() => undefined)
  vite.kill('SIGTERM')
}

const report = [
  '# design lab · question card generality walk',
  '',
  `result: ${failures.length ? 'failed' : 'passed'}`,
  `shots: ${outDir} (${STATES.length} states × zh/en)`,
  `measured: ${JSON.stringify(measured, null, 2)}`,
  'covers: six different questions (none/2/4 options, labels-only, retry-exhausted producer, missing-param producer) render on one card in zh and en with nothing overflowing, nothing clipped by its own box, options inside the card and exactly one in-card free answer row each.',
  failures.length ? `failures: ${failures.join(' | ')}` : 'failures: none',
].join('\n')
fs.writeFileSync(path.join(outDir, 'report.md'), `${report}\n`)
console.log(report)
if (failures.length) process.exit(1)
