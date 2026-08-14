// R13 走查：假人绑轨迹后时间轴直驱播放「脚贴地不陷地」（盖章=state 采样+halfHeight 抬升根治验证）。
// 旅程（真用户路径，全 DOM 锚点）：3D 编辑器 → 右栏「轨迹」tab → 「新建」轨迹（原点 y=0 脚底）
// → 「追加点」拉长路径 → 「选择节点创建绑定」绑假人 → 时间轴「播放」→ 截图。
// 判定（人眼）：02/03 里假人沿轨迹走时**脚站在地面网格上**；修复前会陷进地里半身（视觉中心被钉在脚底高度）。
// 用法：pnpm run build && node scripts/scene3d-stamp-groundcontact-walkthrough.mjs
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, rmSync } from 'node:fs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, '.scene3d-stamp-lab')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

let failures = 0
const ok = (m) => console.log('  ✓ ' + m)
const fail = (m) => { console.error('  ✗ ' + m); failures += 1 }

const { app, win } = await launchNomiApp({
  name: 'scene3d-stamp-groundcontact',
  settleMs: 0,
})
try {
  const shot = async (n) => { await win.screenshot({ path: path.join(outDir, n) }); console.log('  📸 ' + n) }
  const bw = await app.browserWindow(win)
  await bw.evaluate((w) => w.setBounds({ x: 0, y: 0, width: 1680, height: 1020 })).catch(() => {})
  await win.waitForLoadState('domcontentloaded')
  await win.evaluate(() => {
    window.localStorage.setItem('__nomiE2E', '1')
    for (const k of ['nomi:splash:v1', 'nomi:journey-tour:v1']) window.localStorage.setItem(k, 'seen')
    window.localStorage.setItem('nomi.onboarding.scene3dCoach.v1', '1')
  })
  await win.waitForTimeout(1500)

  // ---- 进 3D 编辑器 ----
  await win.getByText('新建空白项目', { exact: false }).first().click()
  await win.waitForTimeout(2500)
  await win.getByRole('button', { name: '生成', exact: false }).first().click()
  await win.waitForTimeout(1500)
  await win.locator('[aria-label="添加3D 场景节点"]').first().click()
    .catch(() => win.getByRole('button', { name: /添加.*3D.*场景.*节点/ }).first().click())
  await win.waitForTimeout(1000)
  await win.locator('[aria-label="打开 3D 编辑器"]').first().click()
  await win.waitForTimeout(3000)
  await win.getByRole('button', { name: '跳过', exact: true }).first().click({ timeout: 1500 }).catch(() => {})
  await win.getByRole('button', { name: '开始使用', exact: true }).first().click({ timeout: 1500 }).catch(() => {})
  await win.waitForTimeout(600)

  // ---- 轨迹 tab → 新建 → 追加点 ----
  await win.getByRole('button', { name: '轨迹', exact: true }).first().click().catch(() => fail('右栏「轨迹」tab 点不到'))
  await win.waitForTimeout(500)
  await win.getByRole('button', { name: '新建', exact: true }).first().click().catch(() => fail('「新建」轨迹点不到'))
  await win.waitForTimeout(800)
  // 新建后面板未自动选中（既有竞态 papercut：state 回传晚一拍把 active 清了）——
  // 按用户路径点时间轴「轨迹1」行选中（行文本=「轨迹1未绑定」，容器裁切致 Playwright
  // actionability 不稳，走 DOM click）
  const rowClicked = await win.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('button')).filter((b) => /^轨迹\d/.test(b.textContent?.trim() ?? ''))
    if (rows.length === 0) return null
    rows[0].click()
    return rows[0].textContent?.trim()
  })
  if (rowClicked) ok(`时间轴轨迹行已选中（${rowClicked}）`)
  else fail('时间轴找不到「轨迹N」行')
  await win.waitForTimeout(700)
  await win.getByRole('button', { name: '追加点', exact: false }).first().waitFor({ timeout: 4000 })
    .catch(() => fail('选中轨迹后「追加点」没出现（轨迹属性面板未激活）'))
  for (let i = 0; i < 2; i += 1) {
    await win.getByRole('button', { name: '追加点', exact: false }).first().click().catch(() => fail('「追加点」点不到'))
    await win.waitForTimeout(300)
  }
  ok('轨迹已建（原点起沿 +X，4 个脚底 y=0 控制点）')
  await shot('00-trajectory-created.png')

  // ---- 绑假人 ----
  await win.getByText('选择节点创建绑定', { exact: false }).first().click()
    .catch(() => fail('「选择节点创建绑定」下拉点不到'))
  await win.waitForTimeout(500)
  await win.getByRole('option', { name: /假人/ }).first().click()
    .catch(() => fail('绑定下拉里点不到「假人」option'))
  await win.waitForTimeout(800)
  ok('假人已绑到轨迹')
  await shot('01-bound-playhead0.png')

  // ---- 播放（直驱盖章路径）----
  await win.getByRole('button', { name: '播放', exact: true }).first().click().catch(() => fail('时间轴「播放」点不到'))
  await win.waitForTimeout(900) // 播到中段
  await shot('02-playing-mid.png')
  await win.waitForTimeout(1200)
  await shot('03-playing-late.png')
  ok('已播放并截图（02/03 人眼判定：假人沿轨迹走时脚应贴地面网格，不陷地不浮空）')

  console.log('\n人眼终审素材:', outDir)
  console.log(failures === 0
    ? '\n✅ 走查跑完（自动锚点全命中；脚贴地与否以截图人眼为准）'
    : `\n⚠️ 走查跑完，${failures} 项自动锚点未命中（以截图人眼为准）`)
  process.exitCode = failures === 0 ? 0 : 1
} catch (error) {
  console.error('✗ 走查中断：', error)
  process.exitCode = 1
} finally {
  await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => {})
  process.exit(process.exitCode ?? 0)
}
