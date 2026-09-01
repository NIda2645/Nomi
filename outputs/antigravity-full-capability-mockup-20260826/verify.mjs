import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
const root = process.cwd()
const out = path.join(root, 'outputs/antigravity-full-capability-mockup-20260826')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1120, height: 1000 } })
const errors = []
const checks = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.route(/^https?:/, (route) => route.abort())
function check(value, name) { if (!value) throw new Error(name); checks.push(name) }
async function snap(name) {
  const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth - document.documentElement.clientWidth, dialog: document.querySelector('.dialog').scrollWidth - document.querySelector('.dialog').clientWidth }))
  check(overflow.document <= 1 && overflow.dialog <= 1, name + ': no horizontal overflow')
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true })
}
try {
  await page.goto(pathToFileURL(path.join(root, 'docs/design/mockups/2026-08-26-antigravity-cli.html')).href)
  check(await page.locator('#status-label').textContent() === '待登录', 'default installed/login-required record')
  check(await page.locator('[data-capability-status]').allTextContents().then((values) => values.every((value) => value === '未验证')), 'all default capabilities unverified')
  check(await page.locator('[data-capability]').count() === 4, 'four independent capabilities only')
  check(await page.locator('input').count() === 0, 'no Key or network input')
  check(await page.locator('#primary').count() === 1, 'one main action')
  check(await page.locator('#primary').textContent() === '复制登录命令', 'login main action copies command')
  const summaryBox = await page.locator('#connection-details summary').boundingBox()
  const bodyBox = await page.locator('.body').boundingBox()
  check(summaryBox.y + summaryBox.height <= bodyBox.y + bodyBox.height, 'desktop default exposes connection-details entry')
  await snap('01-current-login-light')
  await page.locator('[data-state="partial"]').click()
  check(await page.locator('[data-capability-status="text"]').textContent() === '已验证 · 示例', 'text-only simulated success')
  check(await page.locator('[data-capability-status="image"]').textContent() === '未验证', 'text success does not validate image')
  await snap('02-text-only-verified-light')
  await page.locator('[data-state="image"]').click()
  check(await page.locator('[data-capability-status="edit"]').textContent() === '未验证', 'image success does not validate edit')
  await snap('03-text-image-verified-light')
  await page.locator('[data-capability="edit"]').click()
  check((await page.locator('#primary').textContent()).includes('编辑图片'), 'selected capability controls primary action')
  await page.locator('#primary').click()
  check(await page.locator('#primary').textContent() === '取消试跑（模拟）', 'running action becomes cancel')
  await page.locator('#primary').click()
  check(await page.locator('[data-capability-status="edit"]').textContent() === '未验证', 'cancel never creates success')
  await page.locator('[data-state="limited"]').click()
  await page.locator('#theme').click()
  check(await page.locator('[data-capability-status="text"]').textContent() === '已验证 · 示例', 'image limit preserves separate text record')
  await snap('04-image-limited-dark')
  await page.locator('#home-button').click()
  check(await page.locator('#home').isVisible(), 'existing home route opens')
  await page.locator('#agy-open').click()
  check(await page.locator('#detail').isVisible(), 'existing local entry opens connection detail')
  await page.setViewportSize({ width: 390, height: 1080 })
  await page.locator('[data-state="login"]').click()
  await snap('05-mobile-current-login-dark')
  await page.locator('#connection-details summary').click()
  await page.locator('#connection-details').scrollIntoViewIfNeeded()
  check((await page.locator('#connection-details').textContent()).includes('待核对官方 CLI 能力'), 'video and audio remain unverified details only')
  await snap('06-mobile-details-dark')
  await page.locator('[data-state="missing"]').click()
  check(await page.locator('#primary').textContent() === '查看安装方法', 'missing CLI directs to official installation')
  check(errors.length === 0, 'no page errors')
  await writeFile(path.join(out, 'verification.json'), JSON.stringify({ designOnly: true, realCliVerified: false, productionUiVerified: false, checks, errors }, null, 2))
  console.log(JSON.stringify({ checks: checks.length, errors, output: out }, null, 2))
} finally { await browser.close() }
/* global document */
import process from 'node:process'
import console from 'node:console'
