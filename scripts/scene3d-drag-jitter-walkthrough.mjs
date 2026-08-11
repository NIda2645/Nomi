// R13 真机走查：3D 导演台拖动模型/相机「位置来回跳动」复现（2026-08-03 群2反馈）。
// 阶段A（默认）：城市街道模板 → 点 inspector 选中假人 → 截图看 gizmo 位置。
// 阶段B（传 --drag x1 y1 x2 y2）：从 (x1,y1) 按下慢速拖到 (x2,y2)，途中每步截图，人眼判断是否来回跳。
// 用法：pnpm build 后 node scripts/scene3d-drag-jitter-walkthrough.mjs [--drag 840 520 1100 520] [--row 相机]
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, '.scene3d-drag-jitter-walk')
mkdirSync(outDir, { recursive: true })

const args = process.argv.slice(2)
const dragIdx = args.indexOf('--drag')
const dragCoords = dragIdx >= 0 ? args.slice(dragIdx + 1, dragIdx + 5).map(Number) : null
const rowIdx = args.indexOf('--row')
const rowText = rowIdx >= 0 ? args[rowIdx + 1] : '角色'
const throttleIdx = args.indexOf('--throttle')
const throttleRate = throttleIdx >= 0 ? Number(args[throttleIdx + 1]) : 0

// isolate:false：本脚本今天就跑在真实 profile 上（真 key / 真项目库），隔离会让它「跑得起来但结果全错」。
const { app, win } = await launchNomiApp({ name: 'scene3d-drag-jitter', isolate: false })
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

  const addBtn = win.locator('[data-coach="add-button"]')
  await addBtn.first().click()
  await win.waitForTimeout(500)
  await win.getByText('场景模板', { exact: true }).first().click()
  await win.waitForTimeout(500)
  await win.getByText('城市街道', { exact: true }).first().click()
  await win.waitForTimeout(1300)

  if (throttleRate > 1) {
    const cdp = await win.context().newCDPSession(win)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttleRate })
    console.log(`  ⏱ CPU 节流 ×${throttleRate}（模拟慢机器）`)
  }

  // 选中目标（inspector 行点击，DOM 可靠）；--focus 双击聚焦把对象框到视口中心
  const row = win.getByText(new RegExp(rowText), { exact: false }).first()
  await row.click().catch(() => console.log('  ⚠️ inspector 行没点到:' + rowText))
  await win.waitForTimeout(800)
  if (args.includes('--focus')) {
    await row.dblclick().catch(() => {})
    await win.waitForTimeout(1500)
  }
  const canvases = await Promise.all((await win.locator('canvas').all()).map((c) => c.boundingBox().catch(() => null)))
  const vp = canvases.filter(Boolean).sort((a, b) => b.width * b.height - a.width * a.height)[0]
  if (vp) console.log(`  视口 bbox: x=${vp.x} y=${vp.y} w=${vp.width} h=${vp.height} 中心=(${Math.round(vp.x + vp.width / 2)},${Math.round(vp.y + vp.height / 2)})`)
  await shot('10-selected.png')

  // --act: 操控选中的假人按 W 前进，验证走位朝向（脸该朝移动方向）
  if (args.includes('--act')) {
    const pill = win.getByText('操控', { exact: true }).first()
    if (await pill.isVisible().catch(() => false)) {
      await pill.click()
      await win.waitForTimeout(1200)
      await shot('20-possessed.png')
      await win.keyboard.down('w')
      await win.waitForTimeout(500)
      await shot('21-walk-mid.png')
      await win.waitForTimeout(700)
      await win.keyboard.up('w')
      await win.waitForTimeout(600)
      await shot('22-walk-end.png')
    } else {
      console.log('  ⚠️ 没找到「操控」pill（假人选中态）')
      await shot('20-no-pill.png')
    }
  }

  // --preset 推近: 拖之前点一个运镜预设（复现「预设动画写 transform + 手拖」双写入者打架）
  const presetIdx = args.indexOf('--preset')
  if (presetIdx >= 0) {
    const presetName = args[presetIdx + 1]
    await win.getByRole('button', { name: presetName, exact: true }).first().click()
      .catch(() => console.log('  ⚠️ 预设按钮没点到:' + presetName))
    await win.waitForTimeout(700)
    await shot('15-preset-applied.png')
  }

  // --camdrag dx dy [dropY]: 从「操控」pill 正下方 dropY(默认36)px 的相机球按下，拖 (dx,dy)
  const camIdx = args.indexOf('--camdrag')
  let effectiveDrag = dragCoords
  if (camIdx >= 0) {
    const dx = Number(args[camIdx + 1])
    const dy = Number(args[camIdx + 2])
    const dropY = Number.isFinite(Number(args[camIdx + 3])) ? Number(args[camIdx + 3]) : 36
    const pill = await win.getByText('操控', { exact: true }).first().boundingBox().catch(() => null)
    if (!pill) console.log('  ⚠️ 没找到「操控」pill')
    else {
      const sx = pill.x + pill.width / 2
      const sy = pill.y + pill.height + dropY
      effectiveDrag = [sx, sy, sx + dx, sy + dy]
      console.log(`  操控 pill bbox: (${Math.round(pill.x)},${Math.round(pill.y)}) ${Math.round(pill.width)}x${Math.round(pill.height)} → 拖拽起点 (${Math.round(sx)},${Math.round(sy)})`)
    }
  }

  if (effectiveDrag && effectiveDrag.length === 4 && effectiveDrag.every((n) => Number.isFinite(n))) {
    const [x1, y1, x2, y2] = effectiveDrag
    const samplePosition = () =>
      win.evaluate(() => {
        for (const labelText of ['位置 XYZ', '相机位置 XYZ']) {
          const spans = [...document.querySelectorAll('span')].filter((s) => s.textContent === labelText)
          const lab = spans[0]?.closest('label')
          if (lab) return [...lab.querySelectorAll('input')].map((i) => Number(i.value))
        }
        return null
      })
    const sampleName = () =>
      win.evaluate(() => {
        const spans = [...document.querySelectorAll('span')].filter((s) => s.textContent === '名称')
        const lab = spans[0]?.closest('label')
        return lab ? lab.querySelector('input')?.value : null
      })
    console.log(`  拖拽 (${x1},${y1}) → (${x2},${y2})`)
    console.log('  起点对象:', await sampleName(), 'position:', JSON.stringify(await samplePosition()))
    await win.mouse.move(x1, y1)
    await win.waitForTimeout(200)
    await win.mouse.down()
    await win.waitForTimeout(150)
    const STEPS = 24
    const samples = []
    for (let i = 1; i <= STEPS; i += 1) {
      const x = x1 + ((x2 - x1) * i) / STEPS
      const y = y1 + ((y2 - y1) * i) / STEPS
      await win.mouse.move(x, y)
      await win.waitForTimeout(70)
      const pos = await samplePosition()
      if (pos) samples.push(pos)
      if (i % 4 === 0) await shot(`drag-${String(i).padStart(2, '0')}.png`)
    }
    await win.mouse.up()
    await win.waitForTimeout(600)
    console.log('  终点对象:', await sampleName(), 'position:', JSON.stringify(await samplePosition()))
    await shot('99-after-drag.png')
    // 客观判据：主移动轴的方向反转次数（|Δ|>0.03 的相邻位移变号）+ Y 漂移
    for (const axis of [0, 1, 2]) {
      const series = samples.map((s) => s[axis])
      let reversals = 0
      let lastDir = 0
      for (let i = 1; i < series.length; i += 1) {
        const d = series[i] - series[i - 1]
        if (Math.abs(d) <= 0.03) continue
        const dir = Math.sign(d)
        if (lastDir !== 0 && dir !== lastDir) reversals += 1
        lastDir = dir
      }
      const span = Math.max(...series) - Math.min(...series)
      console.log(`  轴${'XYZ'[axis]}: 样本=${JSON.stringify(series.map((v) => Number(v.toFixed(2))))}`)
      console.log(`  轴${'XYZ'[axis]}: 位移跨度=${span.toFixed(3)} 方向反转=${reversals} 次 ${reversals >= 2 ? '❌ 来回跳' : '✓'}`)
    }
  }
} finally {
  await app.close().catch(() => {})
}
console.log('done')
