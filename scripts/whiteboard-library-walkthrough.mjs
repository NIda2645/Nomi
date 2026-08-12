// R13 真机走查：画板素材面板（「多出的图删不掉」群反馈）。
// 两段式：Phase1 纯 UI 建项目 + 加 2 图片节点 + 1 画板节点 → 落盘退出；
// 给 project.json 的图片节点种 result(data:图) 当「画布成图」；
// Phase2 重启开同一项目 → 打开画板 → 画板内导入 1 张图 → 截「画板」/「成图」tab。
// 用法：node scripts/whiteboard-library-walkthrough.mjs
import { launchNomiApp } from '../tests/ux/_launchApp.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import os from 'node:os'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, '.whiteboard-library-walk')
const settingsDir = path.join(os.tmpdir(), 'wb-walk-settings-fixed')
const projectsDir = path.join(os.tmpdir(), 'wb-walk-proj-fixed')
for (const d of [outDir, settingsDir, projectsDir]) mkdirSync(d, { recursive: true })

// base64 PNG data URL（内嵌媒体瘦身器只认 base64 形态；utf8 SVG 形态会 Invalid data URL 抛错）
const PNG_FILES = ['/tmp/wb-red.png', '/tmp/wb-blue.png']
const PNG = (i) => `data:image/png;base64,${readFileSync(PNG_FILES[i % PNG_FILES.length]).toString('base64')}`

const launch = () => launchNomiApp({
  name: 'whiteboard-library',
  settingsDir,
  projectsDir,
  env: { NOMI_RENDERER_URL: 'file://' + path.join(repoRoot, 'dist', 'index.html') },
  settleMs: 1800,
})
const shot = async (win, name) => { await win.screenshot({ path: path.join(outDir, name) }); console.log('  📸 ' + name) }
// 启动器已经等到 domcontentloaded + settle，这里只剩「把窗口摆成走查尺寸」。
const boot = async (app, win) => {
  const bw = await app.browserWindow(win)
  await bw.evaluate((w) => w.setBounds({ x: 0, y: 0, width: 1600, height: 1000 })).catch(() => {})
}

// ---------- Phase 1：建项目 + 加节点（纯 UI）----------
{
  const { app, win } = await launch()
  try {
    await boot(app, win)
    await win.getByText('新建空白项目', { exact: false }).first().click()
    await win.waitForTimeout(2500)
    const genTab = win.getByRole('tab', { name: '生成', exact: false }).first()
    if (await genTab.count()) { await genTab.click() } else { await win.getByText('生成', { exact: true }).first().click() }
    await win.waitForTimeout(1200)
    for (const kind of ['图片', '图片', '画板']) {
      await win.getByLabel(`添加${kind}节点`, { exact: true }).first().click()
      await win.waitForTimeout(700)
    }
    await win.waitForTimeout(2500) // 等 autosave 落盘
  } finally { await app.close() }
}

// ---------- 种 result：图片节点 → 画布成图 ----------
{
  const dirs = readdirSync(projectsDir).filter((d) => { try { return statSync(path.join(projectsDir, d)).isDirectory() } catch { return false } })
  let patched = 0
  for (const dir of dirs) {
    const file = path.join(projectsDir, dir, '.nomi', 'project.json')
    let json
    try { json = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
    const nodes = json?.payload?.generationCanvas?.nodes ?? []
        const spots = { image: [{ x: 260, y: 140 }, { x: 640, y: 140 }], whiteboard: [{ x: 1020, y: 140 }] }
    const used = { image: 0, whiteboard: 0 }
    for (const node of nodes) {
      const spot = spots[node?.kind]?.[used[node?.kind] ?? 0]
      if (spot) { node.position = spot; used[node.kind] += 1 }
      if (node?.kind === 'image' && !node.result) {
        node.result = { id: `seed-${patched}`, type: 'image', url: PNG(patched), createdAt: Date.now() }
        node.status = 'success'
        node.title = patched === 0 ? '红图（画布成图）' : '蓝图（画布成图）'
        patched += 1
      }
    }
    if (patched) {
      // 抬 revision + 落 draft:false → 不被「空白草稿 GC」回收；再直接补注册表登记（草稿创建不登记）。
      json.revision = Math.max(1, Number(json.revision) || 0)
      json.draft = false
      writeFileSync(file, JSON.stringify(json, null, 2))
      const rootPath = json.lastKnownRootPath || path.join(projectsDir, dir)
      writeFileSync(path.join(settingsDir, 'recent-workspaces.json'), JSON.stringify([
        { id: json.id, name: json.name, rootPath, lastOpenedAt: Date.now(), missing: false },
      ], null, 2))
      console.log(`  🧩 seeded ${patched} image results + registry → ${file}`)
      console.log('  🔎 rootPath =', rootPath, '| exists =', statSync(rootPath, { throwIfNoEntry: false }) != null)
    }
  }
  if (!patched) { console.error('  ❌ 没找到可种的图片节点'); process.exit(1) }
}

// ---------- Phase 2：开项目 → 画板 → 截图 ----------
{
  const { app, win } = await launch()
  const errors = []
  try {
    await boot(app, win)
    win.on('pageerror', (e) => errors.push(String(e)))
    win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await win.waitForTimeout(1500)
    console.log('  🔎 registry after boot =', readFileSync(path.join(settingsDir, 'recent-workspaces.json'), 'utf8').slice(0, 300))
    await shot(win, '00-library.png')
    // 项目库第一张卡进入
    await win.getByText('未命名项目', { exact: false }).first().click()
    await win.waitForTimeout(2500)
    const genTab = win.getByRole('tab', { name: '生成', exact: false }).first()
    if (await genTab.count()) { await genTab.click() } else { await win.getByText('生成', { exact: true }).first().click() }
    await win.waitForTimeout(1500)
    await shot(win, '01-canvas-with-results.png') // 验：两图片节点带红/蓝成图

    await win.getByLabel('打开画板', { exact: true }).first().click().catch(async () => {
      await win.getByText('点击打开画板', { exact: false }).first().click()
    })
    await win.waitForTimeout(1800)
    await shot(win, '02-board-modal-open.png') // 验：画板 tab 里已出现 2 张「画布成图」卡（无删除钮）

    const modalFile = win.locator('input[type="file"]').last()
    await modalFile.setInputFiles('/tmp/wb-green.png')
    await win.waitForTimeout(1500)
    await shot(win, '03-board-tab-assets-only.png') // 验：画板页签只剩板上资产(绿图,带眼睛/尺寸/删除排),计数 画板1/结果2

    await win.getByRole('button', { name: /结果/ }).first().click()
    await win.waitForTimeout(600)
    await shot(win, '04-results-tab-canvas-items.png') // 验：红/蓝卡在结果页签,带「来自画布」角标+拖拽提示

    await win.locator('button[aria-pressed]').filter({ hasText: '画板' }).first().click()
    await win.waitForTimeout(400)
    await win.getByLabel(/^删除/).first().click()
    await win.waitForTimeout(600)
    await shot(win, '05-board-after-delete.png') // 验：面板删除真删掉,画板计数归 0 + 空态文案

    console.log(errors.length ? ('  ⚠️ console/page errors:\n' + errors.slice(0, 8).join('\n')) : '  ✅ 无 console/page error')
  } catch (e) {
    console.error('  ❌ 走查失败：', e)
    try { const w = await app.firstWindow(); await shot(w, 'ERROR.png') } catch { /* noop */ }
    process.exitCode = 1
  } finally { await app.close() }
}
