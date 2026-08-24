// P4 S6 — 返工/版本切换的用户可见 UI 走查（真 Electron + 真渲染 + 真 store，零额度）。
//
// 证 S6 交付的**渲染层半程**（后端返工派发 + 单镜确认属 APIMart 真付费验收，那里花真钱；这里在渲染边界取证 UI）：
//   ① 版本条：多镜节点（meta.productionRunId）+ history≥2 + 选中 → 出「第 n/N 版」徽标；展开列版本；点旧版 →
//      rollbackHistory 切 result（**切回旧版→再切新版**，计划 §4 J2 要求的断言）；顺序不跳（rollbackHistory 不重排）。
//   ② 已停占位：resume 钮从 disabled 留位变 active（data-production-shot-action=resume-budget/-manual）。
//   ③ 失败占位：rework 钮 active（data-production-shot-action=rework）。
// 截图人眼判断（R13）：版本条展开态（光/暗）。断言用 _assert 体系 + expectAbsent 阳性对照（切前旧版不是当前）。
import fs from 'node:fs'
import path from 'node:path'

import { launchNomiApp } from './_launchApp.mjs'
import { repoRoot } from './_mcpJourney.mjs'
import { clickOrFail, proveProbe, expectAbsent } from './_assert.mjs'

const shotsDir = path.join(repoRoot, 'tests/ux/shots/p4-s6-rework-version')
fs.rmSync(shotsDir, { recursive: true, force: true })
fs.mkdirSync(shotsDir, { recursive: true })

const RUN_ID = 'run-s6-e2e'

let gui
let exitCode = 0
let passed = 0
const check = (condition, message) => {
  if (!condition) throw new Error(`S6 REWORK/VERSION FAIL: ${message}`)
  passed += 1
  console.log(`  ✓ ${message}`)
}

try {
  gui = await launchNomiApp({
    name: 'p4-s6-rework-version',
    args: ['--disable-gpu', '--disable-software-rasterizer', '--no-proxy-server'],
    settleMs: 0,
  })
  const win = gui.win

  await win.evaluate(() => {
    window.localStorage.setItem('__nomiE2E', '1')
    for (const k of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) window.localStorage.setItem(k, 'seen')
    window.localStorage.setItem('nomi-color-scheme', 'light')
  })
  await win.reload()
  await win.waitForLoadState('domcontentloaded')

  await clickOrFail(win.getByText('新建空白项目', { exact: false }).first(), '库页「新建空白项目」')
  await win.waitForFunction(() => window.location.hash.includes('projectId='), undefined, { timeout: 10_000 })
  await clickOrFail(win.locator('[aria-label="工作区切换"]').getByText('生成', { exact: true }), '工作区切换到「生成」')
  await win.waitForFunction(() => Boolean(window.__nomiCanvasStore), undefined, { timeout: 15_000 })
  await win.waitForFunction(() => Boolean(window.__nomiProductionLandingStore), undefined, { timeout: 15_000 })
  const projectId = await win.evaluate(() => new URLSearchParams(window.location.hash.split('?')[1]).get('projectId'))
  check(Boolean(projectId), `进入项目（id=${projectId}）`)

  // ── 造一个「返工后」的多镜视频节点：meta.productionRunId + 两版（history 新在前=v2 当前、v1 旧版）──
  // rollbackHistory 按 history 里 id 找 result 设为当前、history 顺序不动 → 版本列表稳定（计划 §2 岔路裁定）。
  const nodeId = await win.evaluate(({ runId }) => {
    const store = window.__nomiCanvasStore.getState()
    const v2 = { id: 'ver-2', type: 'video', url: 'nomi-local://asset/p/shot-2-v2.mp4', thumbnailUrl: '', createdAt: Date.now() }
    const v1 = { id: 'ver-1', type: 'video', url: 'nomi-local://asset/p/shot-2-v1.mp4', thumbnailUrl: '', createdAt: Date.now() - 1000 }
    const node = store.addNode({
      kind: 'video', title: '货架对视', position: { x: 240, y: 160 },
      meta: { productionRunId: runId, productionShotId: 'shot-2' },
    })
    // 直接落 result + history（模拟「返工落新版、旧版仍在 history」）。新在前：v2 当前、v1 旧。
    store.updateNode(node.id, { result: v2, history: [v2, v1], status: 'success' })
    return node.id
  }, { runId: RUN_ID })
  check(Boolean(nodeId), `造多镜视频节点（meta.productionRunId=${RUN_ID}，两版 history）`)

  // 选中该节点（版本条门：selected + history≥2）。
  await win.evaluate((id) => window.__nomiCanvasStore.getState().selectNode(id), nodeId)
  await win.waitForTimeout(400)

  // ── ① 版本条徽标出现 ──
  const stripPresent = await win.evaluate((id) => Boolean(document.querySelector(`[data-shot-version-strip="${id}"]`)), nodeId)
  check(stripPresent, '版本条徽标出现（多镜节点 + history≥2 + 选中）')

  // 当前是 v2（ver-2）。展开版本条。
  const currentBefore = await win.evaluate((id) => window.__nomiCanvasStore.getState().nodes.find((n) => n.id === id)?.result?.id, nodeId)
  check(currentBefore === 'ver-2', `切换前当前版=v2（ver-2，实得 ${currentBefore}）`)
  await clickOrFail(win.locator(`[data-shot-version-strip="${nodeId}"] button`).first(), '展开版本条')
  await win.waitForTimeout(300)

  // 展开面板里有两个版本条目；当前(ver-2)带 data-shot-version-current。
  const items = await win.evaluate(() => Array.from(document.querySelectorAll('[data-shot-version-item]')).map((el) => ({ id: el.getAttribute('data-shot-version-item'), current: el.getAttribute('data-shot-version-current') === 'true' })))
  check(items.length === 2, `版本面板列出两版（实得 ${items.length}）`)
  check(items.some((it) => it.id === 'ver-2' && it.current), '当前版(ver-2)标了 data-shot-version-current')
  // 阳性对照：先证「current 标记这个探针测得到东西」（ver-2 带它），再断言旧版 ver-1 此刻不带 current 标记。
  const currentProof = await proveProbe(win.locator('[data-shot-version-item="ver-2"][data-shot-version-current="true"]'), 'current 标记在当前版(ver-2)上可见')
  await expectAbsent(win.locator('[data-shot-version-item="ver-1"][data-shot-version-current="true"]'), { provenBy: currentProof, message: '切换前旧版 ver-1 不带 current 标记' })

  // 截图：版本条展开态（光）。
  await win.waitForTimeout(150)
  await win.screenshot({ path: path.join(shotsDir, '01-version-strip-light.png') })
  // 暗模式。
  await win.evaluate(() => { document.documentElement.setAttribute('data-mantine-color-scheme', 'dark'); document.documentElement.style.colorScheme = 'dark' })
  await win.waitForTimeout(300)
  await win.screenshot({ path: path.join(shotsDir, '02-version-strip-dark.png') })
  await win.evaluate(() => { document.documentElement.setAttribute('data-mantine-color-scheme', 'light'); document.documentElement.style.colorScheme = 'light' })
  await win.waitForTimeout(200)

  // ── 切回旧版（ver-1）──
  await clickOrFail(win.locator('[data-shot-version-item="ver-1"]'), '点旧版 ver-1 切回')
  await win.waitForTimeout(300)
  const afterRollback = await win.evaluate((id) => window.__nomiCanvasStore.getState().nodes.find((n) => n.id === id)?.result?.id, nodeId)
  check(afterRollback === 'ver-1', `切回旧版成功：当前版=v1（ver-1，实得 ${afterRollback}）`)
  // history 顺序不跳（rollbackHistory 不重排）：仍是 [ver-2, ver-1]。
  const historyOrder = await win.evaluate((id) => (window.__nomiCanvasStore.getState().nodes.find((n) => n.id === id)?.history || []).map((h) => h.id), nodeId)
  check(historyOrder.join(',') === 'ver-2,ver-1', `history 顺序不跳（仍 ver-2,ver-1；实得 ${historyOrder.join(',')}）`)

  // ── 再切回新版（ver-2）——「切回旧版→再切新版」不错乱（计划 §4 J2 硬断言）──
  await win.evaluate((id) => window.__nomiCanvasStore.getState().selectNode(id), nodeId)
  await win.waitForTimeout(200)
  await clickOrFail(win.locator(`[data-shot-version-strip="${nodeId}"] button`).first(), '再次展开版本条')
  await win.waitForTimeout(300)
  await clickOrFail(win.locator('[data-shot-version-item="ver-2"]'), '点新版 ver-2 切回')
  await win.waitForTimeout(300)
  const afterReswitch = await win.evaluate((id) => window.__nomiCanvasStore.getState().nodes.find((n) => n.id === id)?.result?.id, nodeId)
  check(afterReswitch === 'ver-2', `再切新版成功：当前版=v2（ver-2，实得 ${afterReswitch}）——切回旧版→再切新版不错乱`)

  // ── ② 已停占位 resume 钮 active + ③ 失败占位 rework 钮 active ──
  // pin 一份 Run：shot-a 已停(run needs_attention)、shot-b 失败(provider 拒，有真错因)。两节点分别绑它们。
  const { stoppedNode, failedNode } = await win.evaluate(({ runId, projectId }) => {
    const store = window.__nomiCanvasStore.getState()
    const stoppedNode = store.addNode({ kind: 'video', title: '已停镜', position: { x: 520, y: 160 }, meta: { productionRunId: runId, productionShotId: 'shot-a' } }).id
    const failedNode = store.addNode({ kind: 'video', title: '失败镜', position: { x: 520, y: 420 }, meta: { productionRunId: runId, productionShotId: 'shot-b' } }).id
    const NOW = '2026-08-25T00:00:00.000Z'
    const shot = (shotId, nodeId) => ({ shotId, role: 'shot', candidate: { candidateId: shotId, revision: 1, moduleId: 'm', providerId: 'apimart', modelId: 'video', mode: 't2v', prompt: '', parameters: {}, references: [] }, nodeId, updatedAt: NOW })
    const run = {
      schemaVersion: 1, runId, projectId, revision: 1, status: 'needs_attention', stageId: 'generate',
      playbook: { name: 'generation.single-shot', version: '1.0.0' }, origin: { host: 'semantic-mcp' },
      policy: { mode: 'balanced', trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: 13, maxAttemptsPerJob: 1, minimizeUploads: true },
      budget: { currency: 'CNY', authorized: 13, reserved: 0, actual: 0, unsettled: 0 },
      planVersion: 1, snapshotCursor: 0, stages: [], gates: [],
      jobs: [
        // shot-a：run needs_attention + 无真错因 → 已停（可续拍）。shot-b：provider 拒（真错因）→ 失败。
        { jobId: 'job-a', stageId: 'generate', status: 'needs_attention', attempt: 1, provider: 'apimart', model: 'video', idempotencyKey: 'k-a', nodeId: stoppedNode, metadata: { shotId: 'shot-a' }, createdAt: NOW, updatedAt: NOW },
        { jobId: 'job-b', stageId: 'generate', status: 'needs_attention', attempt: 1, provider: 'apimart', model: 'video', idempotencyKey: 'k-b', nodeId: failedNode, metadata: { shotId: 'shot-b' }, errorCode: 'provider_task_failed', errorMessage: '供应商拒绝了这次生成', createdAt: NOW, updatedAt: NOW },
      ],
      artifacts: [],
      generationPlan: { operationId: runId, state: 'submitted', candidate: shot('shot-a', stoppedNode).candidate, shots: [shot('shot-a', stoppedNode), shot('shot-b', failedNode)], updatedAt: NOW },
      createdAt: NOW, updatedAt: NOW,
    }
    window.__nomiProductionLandingStore.setState({ projectId, run, pinnedForE2E: true })
    return { stoppedNode, failedNode }
  }, { runId: RUN_ID, projectId })
  await win.waitForTimeout(400)

  // 已停占位的 resume 钮 = active 值（resume-budget 或 resume-manual），且非 disabled。
  const resumeAction = await win.evaluate((id) => {
    const host = document.querySelector(`[data-production-shot-node="${id}"][data-shot-placeholder-state="stopped"]`)
    const btn = host?.querySelector('[data-production-shot-action]')
    return btn ? { action: btn.getAttribute('data-production-shot-action'), disabled: btn.disabled } : null
  }, stoppedNode)
  check(resumeAction && /^resume-(budget|manual)$/.test(resumeAction.action || ''), `已停占位续拍钮=active（data-*=${resumeAction?.action}，非 pending-s6 留位）`)
  check(resumeAction && resumeAction.disabled === false, '续拍钮可点（非 disabled）')

  // 失败占位的 rework 钮 = 'rework'，非 disabled。
  const reworkAction = await win.evaluate((id) => {
    const host = document.querySelector(`[data-production-shot-node="${id}"][data-shot-placeholder-state="failed"]`)
    const btn = host?.querySelector('[data-production-shot-action]')
    return btn ? { action: btn.getAttribute('data-production-shot-action'), disabled: btn.disabled } : null
  }, failedNode)
  check(reworkAction && reworkAction.action === 'rework', `失败占位返工钮=active（data-*=${reworkAction?.action}，非 retry-pending-s6 留位）`)
  check(reworkAction && reworkAction.disabled === false, '返工钮可点（非 disabled）')
  // 阳性对照：先证「data-production-shot-action 这个探针测得到钮」（active 的 rework 钮带它），
  // 再断言留位态旧值（*-pending-s6）不再出现在任何占位钮上（证真接线了，不是新增并行钮）。
  const actionProof = await proveProbe(win.locator('[data-production-shot-action="rework"]'), 'data-production-shot-action 探针在 active 返工钮上可见')
  await expectAbsent(win.locator('[data-production-shot-action="resume-pending-s6"], [data-production-shot-action="retry-pending-s6"]'), { provenBy: actionProof, message: '留位态 data-*（*-pending-s6）已全部被 active 值替换' })

  // 截图在**解 pin 前**（此刻已停/失败占位钮还在屏上，供人眼判断续拍/返工钮长相）。
  await win.screenshot({ path: path.join(shotsDir, '03-resume-rework-buttons.png') })
  await win.evaluate(() => window.__nomiProductionLandingStore.setState({ pinnedForE2E: false, run: null }))
  for (const f of ['01-version-strip-light.png', '02-version-strip-dark.png', '03-resume-rework-buttons.png']) {
    const stat = fs.statSync(path.join(shotsDir, f))
    check(stat.size > 0, `截图 ${f} 落地且非空（${stat.size} 字节）`)
  }

  console.log(`\nS6 REWORK/VERSION PASS: ${passed} 断言；版本条切回旧版→再切新版不错乱 + 续拍/返工钮接活，provider=0。`)
  console.log('  截图 →', shotsDir)
} catch (error) {
  console.error(`✗ ${error?.stack || error}`)
  exitCode = 1
} finally {
  await gui?.app?.close().catch(() => undefined)
  setTimeout(() => process.exit(exitCode), 300)
}
