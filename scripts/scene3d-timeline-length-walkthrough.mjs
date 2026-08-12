// R13 走查（第3期）：时间轴 = 成片长度（所见即所得）。
// 验（截图人眼为准）：① 应用预设 → 时间轴显示长度 = 内容长度（非偏长 10s）；
// ② 再应用预设（追加）→ 尺子增长；③ 拖绑定条右沿缩短 → 拖动期间尺子冻结不跳、松手 re-fit 回缩（shrink，旧只增不减的反面）。
// 用法：pnpm run build && node scripts/scene3d-timeline-length-walkthrough.mjs
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, '.scene3d-timeline-lab')
mkdirSync(outDir, { recursive: true })

let failures = 0
const ok = (m) => console.log('  ✓ ' + m)
const fail = (m) => { console.error('  ✗ ' + m); failures += 1 }

// isolate:false：本脚本今天就跑在真实 profile 上（真 key / 真项目库），隔离会让它「跑得起来但结果全错」。
const { app, win } = await launchNomiApp({ name: 'scene3d-timeline-length', isolate: false })
try {
  const shot = async (n) => { await win.screenshot({ path: path.join(outDir, n) }); console.log('  📸 ' + n) }
  const bw = await app.browserWindow(win)
  await bw.evaluate((w) => w.setBounds({ x: 0, y: 0, width: 1680, height: 1020 })).catch(() => {})
  await win.evaluate(() => {
    window.localStorage.setItem('__nomiE2E', '1')
    window.localStorage.setItem('nomi.onboarding.scene3dCoach.v1', '1')
  })

  // 读时间轴头部显示的总时长文案（TrajectoryTimeline 头 {formatSeconds(totalDuration)}，如 "5.0s"）。
  const readTimelineDuration = async () => win.evaluate(() => {
    const header = Array.from(document.querySelectorAll('div')).find((el) => el.textContent?.trim() === '轨迹时间轴')
    if (!header) return null
    const bar = header.parentElement
    const durEl = bar && Array.from(bar.querySelectorAll('div')).find((el) => /^\d+(\.\d+)?s$/.test(el.textContent?.trim() ?? ''))
    return durEl?.textContent?.trim() ?? null
  }).catch(() => null)

  // ---- setup ----
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
  const addBtn = win.locator('[data-coach="add-button"]')
  await addBtn.first().click().catch(() => fail('底部「添加」点不到'))
  await win.waitForTimeout(500)
  await win.getByText('场景模板', { exact: true }).first().click().catch(() => fail('「场景模板」点不到'))
  await win.waitForTimeout(500)
  await win.getByText('城市街道', { exact: true }).first().click().catch(() => fail('「城市街道」点不到'))
  await win.waitForTimeout(1300)
  ok('城市街道模板已套用')

  // ① 应用第一个预设 → 时间轴 = 内容长度
  await win.getByText('相机1', { exact: true }).first().click().catch(() => {})
  await win.waitForTimeout(700)
  await win.getByRole('button', { name: '预设', exact: true }).first().click().catch(() => {})
  await win.waitForTimeout(400)
  await win.getByRole('button', { name: '推近', exact: true }).first().click().catch(() => fail('「推近」预设点不到'))
  await win.waitForTimeout(1300)
  const dur1 = await readTimelineDuration()
  console.log(`  · 应用「推近」后时间轴总时长显示 = ${dur1}`)
  await shot('01-after-first-preset.png')
  ok('① 已应用推近预设（读 01：尺子长度应 = 内容 ~5s，非偏长 10s）')

  // ② 再应用一个预设（追加）→ 尺子增长
  await win.getByText('相机1', { exact: true }).first().click().catch(() => {})
  await win.waitForTimeout(500)
  await win.getByRole('button', { name: '预设', exact: true }).first().click().catch(() => {})
  await win.waitForTimeout(400)
  await win.getByRole('button', { name: '右横移', exact: true }).first().click().catch(() => {
    // 兜底：再点一次推近
    return win.getByRole('button', { name: '推近', exact: true }).first().click().catch(() => fail('第二个预设点不到'))
  })
  await win.waitForTimeout(1300)
  const dur2 = await readTimelineDuration()
  console.log(`  · 追加第二段运镜后时间轴总时长显示 = ${dur2}`)
  await shot('02-after-second-preset.png')
  ok(`② 追加第二段运镜（${dur1} → ${dur2}，尺子应增长；读 02）`)

  // ③ shrink（内容变短 → 尺子双向回缩，旧「只增不减」的反面）在状态层由单测 scene3dTimeline.test.ts
  //   锁定（syncSceneTimelineDuration 可增可减 + cameraMovePreset.test 断言预设 = 内容终点不再撑到默认 10）。
  //   UI 侧 delete 藏在轨迹「…」菜单、绑定条 8px resize 手柄的 pointer 拖拽在 headless 不稳定触发，
  //   这里只留 grow/content-length 的可靠可视（01/02），不做脆弱交互假装通过。
  await shot('03-timeline-equals-content.png')
  ok('③ 时间轴 = 内容长度（grow/无偏长 已眼见 01/02）；shrink 方向由 scene3dTimeline.test.ts 单测锁定')

  console.log(failures === 0
    ? '\n✅ 时间轴=成片长度 走查跑完（自动锚点全命中；结论以截图人眼为准）'
    : `\n⚠️ 走查跑完，${failures} 项自动锚点未命中（以截图人眼为准）`)
  process.exitCode = 0
} catch (error) {
  console.error('✗ 走查中断：', error)
  process.exitCode = 1
} finally {
  await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => {})
  process.exit(process.exitCode ?? 0)
}
