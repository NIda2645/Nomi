// UE 素体 spike 走查（评估用，不落 main）：__nomiUeSpike=<poseId> 时假人换 UE GLB + 他们的姿势。
// 每个姿势独立一程：开项目→3D 编辑器→加假人→截图。产出 4 张真图供人眼评估「直接用他们的模型+姿势」。
// 用法：pnpm build 后 node scripts/ue-mannequin-spike-walkthrough.mjs
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, '.ue-spike-walk')
mkdirSync(outDir, { recursive: true })
const POSES = ['stand', 'sit', 'fight', 'wave']

const isolatedSettings = path.join(os.tmpdir(), 'nomi-uespike-settings')
const isolatedProjects = path.join(os.tmpdir(), 'nomi-uespike-projects')
rmSync(isolatedSettings, { recursive: true, force: true })
rmSync(isolatedProjects, { recursive: true, force: true })

for (const pose of POSES) {
  const { app, win } = await launchNomiApp({
    name: 'ue-mannequin',
    settingsDir: isolatedSettings,
    projectsDir: isolatedProjects,
  })
  try {
    win.on('console', (m) => { if (m.text().includes('[ueSpike')) console.log('  ', m.text()) })
    const bw = await app.browserWindow(win)
    await bw.evaluate((w) => w.setBounds({ x: 0, y: 0, width: 1680, height: 1020 })).catch(() => {})
    await win.evaluate((p) => {
      window.localStorage.setItem('__nomiE2E', '1')
      window.localStorage.setItem('nomi.onboarding.scene3dCoach.v1', '1')
      window.localStorage.setItem('__nomiUeSpike', p)
    }, pose)
    await win.waitForTimeout(1500)
    const skip = win.getByText('跳过', { exact: true }).first()
    if (await skip.isVisible().catch(() => false)) await skip.click()
    const recent = win.getByText('继续创作', { exact: true }).first()
    if (await recent.isVisible().catch(() => false)) {
      await recent.click()
      await win.waitForTimeout(2500)
      await win.getByRole('button', { name: '生成', exact: false }).first().click().catch(() => {})
      await win.waitForTimeout(1200)
      await win.locator('[aria-label="打开 3D 编辑器"]').first().click()
      await win.waitForTimeout(3000)
    } else {
      await win.getByText('新建空白项目', { exact: false }).first().click()
      await win.waitForTimeout(2500)
      await win.getByRole('button', { name: '生成', exact: false }).first().click()
      await win.waitForTimeout(1500)
      await win.getByRole('button', { name: /添加.*3D.*场景.*节点/ }).first().click()
      await win.waitForTimeout(1000)
      await win.locator('[aria-label="打开 3D 编辑器"]').first().click()
      await win.waitForTimeout(3000)
      await win.getByRole('button', { name: '跳过', exact: true }).first().click({ timeout: 1500 }).catch(() => {})
      await win.getByRole('button', { name: '开始使用', exact: true }).first().click({ timeout: 1500 }).catch(() => {})
      // 加一个假人（只第一程加，后续程复用持久化项目）
      await win.locator('[data-coach="add-button"]').first().click()
      await win.waitForTimeout(400)
      await win.getByText('假人', { exact: true }).first().click()
      await win.waitForTimeout(300)
      await win.getByText('单个假人', { exact: true }).first().click().catch(async () => {
        await win.locator('[aria-label="添加假人"] button').first().click().catch(() => {})
      })
      await win.waitForTimeout(1200)
    }
    // 看全场取景（别双击聚焦：相机会怼进模型内部）
    const fitBtn = win.locator('button[title*="看全场"], button[title*="全场"]').first()
    if (await fitBtn.isVisible().catch(() => false)) await fitBtn.click({ timeout: 2500 }).catch(() => {})
    await win.waitForTimeout(800)
    // demand 渲染模式可能停在旧帧——小幅拖拽逼重绘
    await win.mouse.move(760, 420)
    await win.mouse.down()
    for (let i = 1; i <= 6; i += 1) await win.mouse.move(760 + i * 8, 420 + i * 4)
    await win.mouse.up()
    await win.waitForTimeout(400)
    // 场景树行 hover 出「聚焦」按钮（双击是重命名！）——产品真聚焦，取景 3.2-18m клamp
    const treeRow = win.getByText('假人', { exact: true }).first()
    await treeRow.hover().catch(() => {})
    await win.waitForTimeout(300)
    await win.locator('button[title="聚焦"]').first().click({ timeout: 2500 }).catch(() => {})
    await win.waitForTimeout(900)
    // 微拖拽逼重绘（demand 帧循环）
    await win.mouse.move(806, 500)
    await win.mouse.down()
    for (let i = 1; i <= 3; i += 1) await win.mouse.move(806 + i * 5, 500 + i * 2)
    await win.mouse.up()
    await win.waitForTimeout(700)
    await win.screenshot({ path: path.join(outDir, `pose-${pose}.png`) })
    console.log(`📸 pose-${pose}.png`)
  } finally {
    await app.close().catch(() => {})
  }
}
console.log('done')
