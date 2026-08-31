// R13 真机走查：3D 导演台新增 11 种道具（3d-director-desk 收编批次 1）。
// 断言：① 道具菜单 16 项全渲染（截图）② 逐个添加 11 新道具全部成功（场景树行数）③ 看全场截图人眼验几何/比例。
// 用法：pnpm build 后 node scripts/scene3d-new-props-walkthrough.mjs
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, '.scene3d-new-props-walk')
mkdirSync(outDir, { recursive: true })

const NEW_PROPS = ['SUV', '公交车', '自行车', '电动踏板车', '沙发', '餐桌', '冰箱', '洗衣机', '分类垃圾桶', 'ATM 机', '背包']

let failed = false
const fail = (m) => { failed = true; console.error('  ❌ ' + m) }

// isolate:false：本脚本今天就跑在真实 profile 上（真 key / 真项目库），隔离会让它「跑得起来但结果全错」。
const { app, win } = await launchNomiApp({ name: 'scene3d-new-props', isolate: false })
try {
  const shot = async (n) => { await win.screenshot({ path: path.join(outDir, n) }); console.log('  📸 ' + n) }
  const bw = await app.browserWindow(win)
  await bw.evaluate((w) => w.setBounds({ x: 0, y: 0, width: 1680, height: 1020 })).catch(() => {})
  await win.evaluate(() => {
    window.localStorage.setItem('__nomiE2E', '1')
    window.localStorage.setItem('nomi.onboarding.scene3dCoach.v1', '1')
  })
  await win.waitForTimeout(1500)
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
  await win.waitForTimeout(600)

  // ① 菜单截图：添加 → 道具
  await win.locator('[data-coach="add-button"]').first().click()
  await win.waitForTimeout(400)
  await win.getByText('道具', { exact: true }).first().click()
  await win.waitForTimeout(400)
  const menu = win.locator('[aria-label="添加道具"]')
  const menuItems = await menu.locator('button').count().catch(() => 0)
  console.log(`  道具菜单项数: ${menuItems}`)
  if (menuItems !== 16) fail(`道具菜单应有 16 项，实际 ${menuItems}`)
  await shot('01-prop-menu.png')

  // ② 逐个添加 11 个新道具
  for (const label of NEW_PROPS) {
    const addBtn = win.locator('[data-coach="add-button"]').first()
    // 菜单若已关，重开
    if (!(await menu.isVisible().catch(() => false))) {
      await addBtn.click()
      await win.waitForTimeout(300)
      await win.getByText('道具', { exact: true }).first().click()
      await win.waitForTimeout(300)
    }
    const item = menu.getByText(label, { exact: true }).first()
    if (!(await item.isVisible().catch(() => false))) {
      fail(`菜单里找不到「${label}」`)
      continue
    }
    await item.click()
    await win.waitForTimeout(450)
    console.log(`  ✚ ${label}`)
  }

  // ③ 看全场 + 截图
  const fitBtn = win.locator('button[title*="看全场"], button[title*="全场"]').first()
  if (await fitBtn.isVisible().catch(() => false)) await fitBtn.click()
  else fail('看全场按钮没点到')
  await win.waitForTimeout(1200)
  await shot('02-all-new-props.png')

  // 场景树应有 11 个道具行（新道具名）
  let treeCount = 0
  for (const label of NEW_PROPS) {
    const row = win.getByText(label, { exact: true })
    const n = await row.count()
    if (n >= 1) treeCount += 1
    else fail(`场景树里没有「${label}」`)
  }
  console.log(`  场景树命中 ${treeCount}/11`)
} finally {
  await app.close().catch(() => {})
}
console.log(failed ? '\n✗ 走查失败' : '\n✓ 走查通过')
process.exit(failed ? 1 : 0)
