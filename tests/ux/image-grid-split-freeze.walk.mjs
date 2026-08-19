// R13 走查 + 回归门：图片浮条「切图 ▾ → 九宫格(3×3)」不许再卡死（2026-08-20）。
//
// 用户报告：「点击图片的切图功能 九宫格 直接卡死」。根因取证与修法见
// docs/plan/2026-08-20-grid-split-freeze.md。修前（4096² 源图、空项目、M 系列 Mac）：
//   主线程最长空窗 782ms、9 次同步 PNG 编码占 701ms、60MB 走 JSON 深拷贝、UI 冻 1.6s。
// 慢机器上就是用户说的「直接卡死」。
//
// 这份走查把那三个数钉成断言，回归会直接报红：
//   ① 主线程最长单次阻塞 < 400ms（「卡死」的直接度量：心跳漏拍）
//   ② 全程零次同步 toDataURL（同步 PNG 编码=主线程被霸占的根因）
//   ③ store/DOM 里零 data: URL（base64 进 store = 「图多即卡」的病根，也是 JSON 深拷贝的燃料）
// 外加行为对账：9 张切片确实都进了堆叠、切图期间有「切图中」反馈。
//
// 零额度——只用本地 ffmpeg 造的 4K 细节图，不触发任何生成。
// 用法：node tests/ux/image-grid-split-freeze.walk.mjs
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import { clickOrFail, expect, expectVisible } from './_assert.mjs'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const SIDE = 4096
/** 主线程单次阻塞预算。人对 >400ms 的无响应开始有「卡了」的体感；修前是 782ms。 */
const BLOCK_BUDGET_MS = 400
const outDir = path.join(repoRoot, 'docs/design/mockups/2026-08-20-grid-split-freeze')
fs.mkdirSync(outDir, { recursive: true })

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-split-walk-'))
const settingsDir = path.join(root, 'settings')
const projectsDir = path.join(root, 'projects')
fs.mkdirSync(settingsDir, { recursive: true })
fs.mkdirSync(projectsDir, { recursive: true })

// 细节丰富的图：PNG 体积量级贴近真实出图，不是一压就没的纯色块。
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const still = path.join(root, 'big.png')
if (spawnSync(ffmpegPath, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `mandelbrot=s=${SIDE}x${SIDE}`, '-frames:v', '1', still]).status !== 0) {
  throw new Error('夹具编码失败')
}
console.log(`· 夹具 ${SIDE}×${SIDE} PNG = ${(fs.statSync(still).size / 1024 / 1024).toFixed(1)} MB`)

let { app, win } = await launchNomiApp({
  name: 'image-grid-split-freeze',
  userDataDir: settingsDir,
  settingsDir,
  projectsDir,
  args: ['--no-proxy-server'],
  settleMs: 0,
})
const getWin = () => {
  const live = app.windows().filter((w) => !w.isClosed())
  win = live.find((w) => { try { return /projectId=/.test(w.url()) } catch { return false } }) || live[live.length - 1] || win
  return win
}
const snap = async (name) => {
  await getWin().screenshot({ path: path.join(outDir, name) })
  console.log(`  · 截图 ${name}`)
}
const verdicts = []
const check = (name, ok, detail = '') => {
  verdicts.push([name, ok, detail])
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

win.on('pageerror', (e) => console.log(`  [pageerror] ${String(e).slice(0, 200)}`))
win.on('crash', () => console.log('  [renderer CRASH]'))

try {
  await win.waitForLoadState('domcontentloaded')
  await win.evaluate(() => {
    localStorage.setItem('nomi-color-scheme', 'light')
    for (const k of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) localStorage.setItem(k, 'seen')
  })
  await win.reload()
  await win.waitForLoadState('domcontentloaded')
  const bw = await app.browserWindow(getWin())
  await bw.evaluate((w) => { w.setBounds({ x: 0, y: 0, width: 1680, height: 1050 }); w.center() })

  await clickOrFail(getWin().locator('button, [role="button"]').filter({ hasText: '新建空白项目' }), '新建空白项目', { timeout: 30_000 })
  await clickOrFail(getWin().getByRole('button', { name: '生成', exact: false }), '顶栏「生成」')
  await expectVisible(getWin().locator('.generation-canvas-v2__stage').first(), '生成画布没出来', 30_000)

  // —— 投放大图 ——
  const b64 = fs.readFileSync(still).toString('base64')
  await getWin().evaluate((png) => {
    const stage = document.querySelector('.generation-canvas-v2__stage')
    const rect = stage.getBoundingClientRect()
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'big.png', { type: 'image/png' }))
    const opts = { bubbles: true, cancelable: true, clientX: rect.x + 500, clientY: rect.y + 320, dataTransfer: dt }
    stage.dispatchEvent(new DragEvent('dragover', opts))
    stage.dispatchEvent(new DragEvent('drop', opts))
  }, b64)
  const nodeImage = getWin().locator('[data-node-id] img').first()
  await expectVisible(nodeImage, '大图没落进画布（投放失败）', 60_000)
  await expect
    .poll(() => nodeImage.evaluate((img) => img.naturalWidth), { message: '节点图没解码到原始尺寸', timeout: 60_000 })
    .toBe(SIDE)
  await snap('00-seeded.png')

  // —— 探针：心跳漏拍 = 主线程被同步任务霸占的时长；另数同步 PNG 编码次数 ——
  await getWin().evaluate(() => {
    const hb = { max: 0, last: performance.now(), syncEncodes: 0 }
    window.__nomiHb = hb
    setInterval(() => {
      const now = performance.now()
      hb.max = Math.max(hb.max, now - hb.last)
      hb.last = now
    }, 25)
    const rawToDataUrl = HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      hb.syncEncodes += 1
      return rawToDataUrl.apply(this, args)
    }
  })

  // —— 真实路径：选中节点 → 切图 ▾ → 九宫格 → 确认 ——
  await clickOrFail(getWin().locator('[data-node-id]').first(), '图片节点')
  await clickOrFail(getWin().getByRole('button', { name: '切图', exact: true }), '浮条「切图 ▾」')
  await snap('01-split-menu.png')
  await clickOrFail(getWin().getByRole('menuitem', { name: /九宫格/ }), '菜单项「九宫格（3×3）」')
  const confirmSplit = getWin().getByRole('button', { name: '确认切图' })
  await expectVisible(confirmSplit.first(), '九宫格取景框没打开')
  await snap('02-grid-overlay.png')
  await getWin().evaluate(() => { window.__nomiHb.max = 0; window.__nomiHb.last = performance.now() })

  const t0 = Date.now()
  await clickOrFail(confirmSplit, '取景框「确认切图」')

  // ① 切图期间有反馈：读屏状态播报「切图中」（视觉那层是图的模糊呼吸，见 03 截图）
  const splittingStatus = getWin().getByRole('status', { name: /切图中/ })
  const sawFeedback = await splittingStatus.first().isVisible({ timeout: 3_000 }).catch(() => false)
  await snap('03-splitting.png')

  // ② 结果对账：9 张切片 + 原图 = 10 张进堆叠（堆叠计数是 aria-label，不靠像素）
  await expectVisible(getWin().getByLabel('10 张堆叠图片').first(), '九宫格没切出 9 张（堆叠计数不对）', 60_000)
  const elapsed = Date.now() - t0
  console.log(`  · 确认 → 9 张切片全部就位 ${(elapsed / 1000).toFixed(1)} s`)

  const hb = await getWin().evaluate(() => window.__nomiHb)
  check('切图期间有「切图中」反馈（不是点完没动静）', sawFeedback)
  check(`主线程最长阻塞 < ${BLOCK_BUDGET_MS}ms`, hb.max < BLOCK_BUDGET_MS, `实测 ${Math.round(hb.max)}ms（修前 782ms）`)
  check('零次同步 PNG 编码（toDataURL）', !hb.syncEncodes, `实测 ${hb.syncEncodes} 次（修前 9 次）`)

  // ③ base64 不许进 store：切片必须是落盘后的 nomi-local:// 门牌号
  const urls = await getWin().evaluate(() =>
    [...document.querySelectorAll('[data-node-id] img')].map((img) => (img.currentSrc || img.src || '').slice(0, 12)))
  check('切片零 base64（全是 nomi-local:// 门牌号）', urls.every((u) => !u.startsWith('data:')), JSON.stringify(urls))

  // —— 展开堆叠，人眼看 9 张切片确实可挑可用 ——
  await clickOrFail(getWin().getByLabel('展开堆叠图片'), '展开堆叠')
  await expectVisible(getWin().getByRole('list', { name: '可切换的堆叠图片' }).first(), '堆叠展不开')
  await snap('04-stack-open.png')

  const failed = verdicts.filter(([, ok]) => !ok)
  console.log(`\n  ${failed.length ? `❌ ${failed.length} 项未过` : '✅ 全部通过'}`)
  if (failed.length) process.exitCode = 1
} catch (error) {
  console.log(`\n❌ 走查中断：${String(error).slice(0, 400)}`)
  await snap('99-error.png')
  process.exitCode = 1
} finally {
  await app.close().catch(() => {})
  console.log(`\n截图目录：${outDir}`)
}
