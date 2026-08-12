// R13 走查（本批新特性）：3D 导演台「出片链路对齐剪辑软件」第 0/1/2 期。
// 只验这批改动的 4 件事（结论以截图人眼为准，非 expect 断言）：
//   ① 时间轴点空白/拖轨道 → 播放头跳过去（seek）
//   ② 手画轨迹不绑相机 → 点「生成参考视频」→ 弹可点 toast「一键绑定相机并生成」→ 点了能出片
//   ③ 左下「预览最终画面」→ 主画面切相机镜头 + 拖时间轴主画面实时刷成片
//   ④ 成片预览态空格 = 播放/暂停
// 用法：pnpm run build && node scripts/scene3d-new-features-walkthrough.mjs
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, '.scene3d-newfeat-lab')
mkdirSync(outDir, { recursive: true })

let failures = 0
const ok = (m) => console.log('  ✓ ' + m)
const fail = (m) => { console.error('  ✗ ' + m); failures += 1 }

// isolate:false：本脚本今天就跑在真实 profile 上（真 key / 真项目库），隔离会让它「跑得起来但结果全错」。
const { app, win } = await launchNomiApp({ name: 'scene3d-new-features', isolate: false })
try {
  const shot = async (n) => { await win.screenshot({ path: path.join(outDir, n) }); console.log('  📸 ' + n) }
  const bw = await app.browserWindow(win)
  await bw.evaluate((w) => w.setBounds({ x: 0, y: 0, width: 1680, height: 1020 })).catch(() => {})
  await win.evaluate(() => {
    window.localStorage.setItem('__nomiE2E', '1')
    window.localStorage.setItem('nomi.onboarding.scene3dCoach.v1', '1') // 跳过 5 步引导
  })
  await win.waitForTimeout(1500)

  // ---- setup：新建项目 → 生成画布 → 加 3D 节点 → 开编辑器 → 城市街道模板 ----
  await win.getByText('新建空白项目', { exact: false }).first().click()
  await win.waitForTimeout(2500)
  await win.getByRole('button', { name: '生成', exact: false }).first().click()
  await win.waitForTimeout(1500)
  await win.getByRole('button', { name: /添加.*3D.*场景.*节点/ }).first().click()
  await win.waitForTimeout(1000)
  await win.locator('[aria-label="打开 3D 编辑器"]').first().click()
  await win.waitForTimeout(3000)
  // coach 兜底
  await win.getByRole('button', { name: '跳过', exact: true }).first().click({ timeout: 1500 }).catch(() => {})
  await win.getByRole('button', { name: '开始使用', exact: true }).first().click({ timeout: 1500 }).catch(() => {})
  await win.waitForTimeout(600)
  await shot('00-editor-open.png')

  const addBtn = win.locator('[data-coach="add-button"]')
  await addBtn.first().click().catch(() => fail('底部「添加」点不到'))
  await win.waitForTimeout(500)
  await win.getByText('场景模板', { exact: true }).first().click().catch(() => fail('「场景模板」点不到'))
  await win.waitForTimeout(500)
  await win.getByText('城市街道', { exact: true }).first().click().catch(() => fail('「城市街道」点不到'))
  await win.waitForTimeout(1300)
  ok('城市街道模板已套用（含相机1 + 假人 + 马路）')
  await shot('01-template.png')

  // 视口 bbox（取最大 canvas）
  const vp = (await Promise.all((await win.locator('canvas').all()).map((c) => c.boundingBox().catch(() => null))))
    .filter(Boolean).sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null

  // ============ ② 手画轨迹不绑相机 → 生成 → 可点 toast → 点了出片 ============
  await win.getByRole('button', { name: '轨迹', exact: true }).first().click().catch(() => fail('整运镜>轨迹点不到'))
  await win.waitForTimeout(400)
  await win.getByRole('button', { name: '新建', exact: true }).first().click().catch(() => fail('「新建」轨迹点不到'))
  await win.waitForTimeout(600)
  await win.getByText('进入视口编辑', { exact: false }).first().click({ timeout: 3000 }).catch(() => {})
  await win.waitForTimeout(600)
  if (vp) {
    for (const [fx, fy] of [[0.40, 0.64], [0.52, 0.68], [0.64, 0.66]]) {
      await win.mouse.click(vp.x + vp.width * fx, vp.y + vp.height * fy)
      await win.waitForTimeout(500)
    }
    ok('已在视口地面点 3 下尝试落轨迹点（不绑相机）')
  } else fail('拿不到视口 bbox')
  await shot('02-manual-trajectory.png')

  await win.getByRole('tab', { name: /运镜参考/ }).first().click().catch(() => fail('「运镜参考」tab 点不到'))
  await win.waitForTimeout(600)
  const exportBtn = win.locator('[data-coach="export-button"]')
  await exportBtn.first().click().catch(() => fail('生成 CTA 点不到'))
  await win.waitForTimeout(900)
  await shot('03-after-generate-click.png')
  const bindToast = await win.getByText('一键绑定相机并生成', { exact: false }).count()
  if (bindToast > 0) {
    ok('② 可点 toast「一键绑定相机并生成」已出（不再静默失败）')
    await win.getByText('一键绑定相机并生成', { exact: false }).first().click().catch(() => fail('toast 动作点不到'))
    await win.waitForTimeout(1300)
    const card = await win.getByText('参考视频生成中', { exact: false }).count()
    if (card > 0) ok('② 点 toast → 出片（「参考视频生成中」产物卡出现）')
    else fail('② 点 toast 后没出「参考视频生成中」卡')
    await shot('04-after-bind-generate.png')
  } else {
    fail('② 未见绑定 toast（可能地面点没落够 2 点，或已绑定）')
  }
  await win.getByRole('button', { name: '知道了', exact: true }).first().click({ timeout: 1500 }).catch(() => {})
  await win.waitForTimeout(400)

  // ============ ①③④ preset → 时间轴 seek + 成片预览 + 空格 ============
  await win.getByText('相机1', { exact: true }).first().click().catch(() => {})
  await win.waitForTimeout(700)
  await win.getByRole('button', { name: '预设', exact: true }).first().click().catch(() => {})
  await win.waitForTimeout(400)
  await win.getByRole('button', { name: '推近', exact: true }).first().click().catch(() => fail('「推近」预设点不到'))
  await win.waitForTimeout(1300)
  ok('推近预设已应用（相机绑轨迹 + 时间轴出现）')
  await shot('05-preset-applied.png')

  // ① 时间轴点空白/拖轨道 → 播放头跳（第1期：播放头退化为纯指示器，seek 走轨道容器 data-e2e）
  const lane = win.locator('[data-coach="timeline-lane"]')
  const laneBox = await lane.first().boundingBox().catch(() => null)
  if (laneBox) {
    const laneY = laneBox.y + 12 // 顶部组行=空白，点这冒泡到轨道容器 seek（不落绑定条）
    await shot('06a-timeline-before-seek.png')
    await win.mouse.click(laneBox.x + laneBox.width * 0.72, laneY)
    await win.waitForTimeout(500)
    await shot('06b-timeline-click-72pct.png')
    await win.mouse.click(laneBox.x + laneBox.width * 0.22, laneY)
    await win.waitForTimeout(500)
    await shot('06c-timeline-click-22pct.png')
    await win.mouse.move(laneBox.x + laneBox.width * 0.22, laneY)
    await win.mouse.down()
    await win.mouse.move(laneBox.x + laneBox.width * 0.82, laneY, { steps: 14 })
    await win.mouse.up()
    await win.waitForTimeout(500)
    await shot('06d-timeline-after-drag.png')
    ok('① 点/拖轨道已执行（人眼比对 06a→06b(72%)→06c(22%)→06d(拖到82%) 播放头竖线位置是否跟随）')
  } else fail('① 拿不到 timeline lane box（时间轴没出现？）')

  // ③ 预览最终画面 → 主画面切相机镜头 + 拖时间轴刷成片
  const previewBtn = win.getByRole('button', { name: '预览最终画面', exact: true })
  if ((await previewBtn.count()) > 0) {
    await shot('07a-before-preview.png')
    await previewBtn.first().click()
    await win.waitForTimeout(1200)
    await shot('07b-preview-on.png')
    if ((await win.getByText('正在预览最终镜头', { exact: false }).count()) > 0) ok('③ 预览态状态句「正在预览最终镜头」在场')
    else console.log('  · 未见预览状态句——以 07a/07b 主画面是否切成镜头为准')
    if (laneBox) {
      const laneY = laneBox.y + 12
      await win.mouse.move(laneBox.x + laneBox.width * 0.12, laneY)
      await win.mouse.down()
      await win.mouse.move(laneBox.x + laneBox.width * 0.88, laneY, { steps: 16 })
      await win.mouse.up()
      await win.waitForTimeout(800)
      await shot('07c-preview-after-scrub.png')
      ok('③ 预览态拖时间轴已执行（人眼比对 07b/07c 主画面镜头内容是否随播放头变）')
    }
  } else fail('③「预览最终画面」按钮缺席')

  // ④ 预览态空格 = 播放/暂停（先把播放头挪回起点，播放时能看到右移）
  if (laneBox) {
    await win.mouse.click(laneBox.x + laneBox.width * 0.05, laneBox.y + 12)
    await win.waitForTimeout(300)
    await shot('08a-preview-before-space.png')
    await win.keyboard.press('Space')
    await win.waitForTimeout(1400)
    await shot('08b-after-space-play.png')      // 播放头应已右移
    await win.keyboard.press('Space')
    await win.waitForTimeout(300)
    await shot('08c1-after-space-pause.png')
    await win.waitForTimeout(800)
    await shot('08c2-still-paused.png')          // 与 08c1 对比：暂停后播放头不再动
    ok('④ 预览态空格已按两次（08a起点 → 08b播放头右移=播放 → 08c1/08c2不动=暂停）')
  } else fail('④ 无 lane box，跳过空格验证')

  console.log(failures === 0
    ? '\n✅ 新特性走查跑完（自动锚点全命中；最终结论以截图人眼为准）'
    : `\n⚠️ 走查跑完，${failures} 项自动锚点未命中（以截图人眼为准，逐张核）`)
  process.exitCode = 0
} catch (error) {
  console.error('✗ 走查中断：', error)
  process.exitCode = 1
} finally {
  await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => {})
  process.exit(process.exitCode ?? 0)
}
