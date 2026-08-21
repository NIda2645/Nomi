// R13/R16 真页面走查：设置里是否明确告诉用户「视频参考优先配置 KIE，文件上传免费」，
// 以及未配置 KIE 时的公共临时托管提醒是否可见。零额度，不触发真实模型生成。
import { launchNomiApp } from './_launchApp.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shotsDir = path.join(repoRoot, 'tests/ux/shots/asset-transport-settings')
fs.mkdirSync(shotsDir, { recursive: true })
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-asset-transport-settings-'))
const settingsDir = path.join(tempRoot, 'settings')
const projectsDir = path.join(tempRoot, 'projects')
fs.mkdirSync(settingsDir, { recursive: true })
fs.mkdirSync(projectsDir, { recursive: true })

const { app, win: initialWindow } = await launchNomiApp({
  name: 'asset-transport-settings',
  userDataDir: settingsDir,
  settingsDir,
  projectsDir,
  args: ['--no-proxy-server'],
  settleMs: 0,
})

let win = initialWindow
const getWin = () => {
  const live = app.windows().filter((candidate) => !candidate.isClosed())
  win = live[live.length - 1] || win
  return win
}
const dialog = () => getWin().locator('[role="dialog"][aria-modal="true"]').first()
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) throw new Error(`${label}${detail ? `: ${detail}` : ''}`)
}

try {
  await getWin().waitForLoadState('domcontentloaded')
  await getWin().waitForTimeout(1800)
  await getWin().evaluate(() => {
    localStorage.setItem('nomi-color-scheme', 'light')
    for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) localStorage.setItem(key, 'seen')
  })
  await getWin().reload()
  await getWin().waitForLoadState('domcontentloaded')
  await getWin().waitForTimeout(1500)
  for (let i = 0; i < 5; i += 1) {
    await getWin().keyboard.press('Escape').catch(() => {})
    await getWin().waitForTimeout(120)
  }

  await getWin().locator('button[aria-label*="设置"], button[aria-label*="Settings"]').first().click({ timeout: 8000 })
  await dialog().waitFor({ state: 'visible', timeout: 8000 })
  await dialog().locator('[data-settings-tab-id="ai"]').click({ timeout: 5000 })
  const upload = dialog().locator('[data-settings-upload-guidance]')
  await upload.waitFor({ state: 'visible', timeout: 8000 })
  const text = await upload.innerText()
  check('设置页出现 KIE 视频上传说明', /KIE/.test(text), text)
  check('明确说明上传免费', /免费|free/i.test(text), text)
  check('明确提示公共临时托管风险', /公共|public|隐私|privacy/i.test(text), text)
  check('配置入口按钮可见', await upload.getByRole('button', { name: /配置 KIE|Configure KIE/i }).count() === 1, text)
  check('公共托管提醒开关默认打开', await upload.locator('input[type="checkbox"]').count() === 1 && await upload.locator('input[type="checkbox"]').isChecked(), text)
  await dialog().screenshot({ path: path.join(shotsDir, '01-ai-upload-guidance-light.png') })

  await getWin().evaluate(() => document.documentElement.setAttribute('data-mantine-color-scheme', 'dark'))
  await getWin().waitForTimeout(300)
  await dialog().screenshot({ path: path.join(shotsDir, '02-ai-upload-guidance-dark.png') })

  await upload.getByRole('button', { name: /配置 KIE|Configure KIE/i }).click()
  const modelWorkspace = dialog().locator('[data-settings-model-workspace]')
  await modelWorkspace.waitFor({ state: 'visible', timeout: 8000 })
  check('配置 KIE 按钮进入模型配置页', await modelWorkspace.count() === 1)
  await dialog().screenshot({ path: path.join(shotsDir, '03-kie-model-settings.png') })
  console.log(`\n截图目录：${shotsDir}`)
} catch (error) {
  console.error('资产上传设置走查失败:', error)
  await getWin().screenshot({ path: path.join(shotsDir, '99-failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await app.close().catch(() => {})
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
