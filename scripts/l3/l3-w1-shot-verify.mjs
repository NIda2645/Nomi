// L3-W1 真额度小验收驱动（harness plan §三 第 1 行：审片环 · ~10 图 + ≤2 视频）。
// 跑「打包产物二进制」的 in-Electron MCP stdio server + 用户真实 settings（真 key 真 vendor），
// 但 NOMI_PROJECTS_DIR / NOMI_CAPABILITY_DIR 隔离——真花额度、零干扰用户库、不与运行中 GUI 串线。
//
// 两种跑法：
//   node scripts/l3/l3-w1-shot-verify.mjs --probe        零花费：initialize + list_models（验 key 解密与模型可用）
//   NOMI_L3_REAL=1 node scripts/l3/l3-w1-shot-verify.mjs 真验收：锚图 + 好镜 + 坏镜（验真 VLM 检出）+ 1 视频
// NOMI_L3_REAL 不是逃生口，是「这一跑要花真钱」的显式闸（同 08-18 大修计划 --real 开关先例）。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BIN = path.join(repoRoot, 'release/mac-arm64/Nomi.app/Contents/MacOS/Nomi')
const probeOnly = process.argv.includes('--probe')
if (!probeOnly && process.env.NOMI_L3_REAL !== '1') {
  console.log('拒绝：真验收会花真额度。加 NOMI_L3_REAL=1 显式确认，或用 --probe 跑零花费探针。')
  process.exit(2)
}
if (!fs.existsSync(BIN)) { console.log(`打包产物不存在：${BIN}（先 pnpm run dist:mac:dir）`); process.exit(2) }

// 签名守卫（结构性防「顺序错误」）：启动任何进程前，确保包已用本机稳定证书签名。
// ad-hoc 指纹每次打包都变，用它碰钥匙串 = 每包每进程都弹密码框（2026-08-19 用户被连弹三轮的根因，
// 其中一轮是 dist 自带冒烟测试对 3 个 origin 各起一进程 ×3 弹）。证书身份恒定 → 一次「始终允许」永久生效。
{
  const { execSync } = await import('node:child_process')
  const APP = path.join(repoRoot, 'release/mac-arm64/Nomi.app')
  const IDENTITY = 'Nomi Local Codesign'
  const hasIdentity = (() => { try { return execSync('security find-identity -v -p codesigning', { encoding: 'utf8' }).includes(IDENTITY) } catch { return false } })()
  const signedByUs = (() => { try { return execSync(`codesign -dvv "${APP}" 2>&1`, { encoding: 'utf8' }).includes(IDENTITY) } catch { return false } })()
  if (!signedByUs) {
    if (!hasIdentity) { console.log(`✗ 本机没有「${IDENTITY}」证书——先建证书再跑，否则钥匙串会反复弹框。`); process.exit(2) }
    console.log(`· 包尚未用稳定证书签名，现在补签（${IDENTITY}）…`)
    execSync(`codesign --force --deep --sign "${IDENTITY}" "${APP}"`, { stdio: 'inherit' })
  }
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-l3-w1-'))
const projectsDir = path.join(base, 'projects')
const capDir = path.join(base, 'capability')
fs.mkdirSync(projectsDir, { recursive: true })
fs.mkdirSync(capDir, { recursive: true })

const child = spawn(BIN, [], {
  env: { ...process.env, NOMI_MCP_STDIO: '1', NOMI_PROJECTS_DIR: projectsDir, NOMI_CAPABILITY_DIR: capDir },
  stdio: ['pipe', 'pipe', 'inherit'],
})
const pending = new Map()
let seq = 0
let spendConfirms = 0
child.on('exit', (code, signal) => {
  console.log(`[l3] 子进程退出 code=${code} signal=${signal}`)
  for (const [, e] of pending) { clearTimeout(e.timer); e.resolve({ error: { message: 'child exited' } }) }
  pending.clear()
})
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  const t = line.trim(); if (!t.startsWith('{')) return
  let msg; try { msg = JSON.parse(t) } catch { return }
  if (msg.method === 'elicitation/create' && msg.id != null) {
    spendConfirms += 1
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { action: 'accept', content: { confirm: true } } }) + '\n')
    return
  }
  if (msg.id != null && pending.has(msg.id)) { const { resolve, timer } = pending.get(msg.id); clearTimeout(timer); pending.delete(msg.id); resolve(msg) }
})
function rpc(method, params, timeoutMs = 30_000) {
  const id = (seq += 1)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)) }, timeoutMs)
    pending.set(id, { resolve, timer })
    if (child.exitCode !== null || !child.stdin.writable) { clearTimeout(timer); pending.delete(id); reject(new Error('子进程已退出/stdin 不可写')); return }
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}
async function callTool(name, args, timeoutMs = 60_000) {
  const res = (await rpc('tools/call', { name, arguments: args }, timeoutMs)).result
  const text = (res?.content || []).find((b) => b?.type === 'text')?.text || ''
  let json = null
  try { json = JSON.parse(text) } catch {
    const s = text.indexOf('{'); const e = text.lastIndexOf('}')
    if (s >= 0 && e > s) { try { json = JSON.parse(text.slice(s, e + 1)) } catch { json = null } }
  }
  return { raw: res, isError: Boolean(res?.isError), text, json, outcome: res?.structuredContent?.nomiOutcome || {} }
}
const die = (m) => { console.log(`✗ ${m}`); cleanup(1) }
function cleanup(code) { try { child.stdin.end(); child.kill('SIGTERM') } catch { /* */ } setTimeout(() => process.exit(code), 400) }

// ── 起服 + 探针（零花费）────────────────────────────────────────────
let init = null
for (let i = 0; i < 30 && !init; i++) { try { init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: { elicitation: {} }, clientInfo: { name: 'codex', version: 'l3-w1' } }, 4000) } catch { await new Promise((r) => setTimeout(r, 1000)) } }
if (!init?.result) die('打包 stdio server 起不来')
console.log('✓ 打包二进制 stdio server 已起（真实 settings + 隔离 projects/capability）')

const models = await callTool('nomi_list_models', {}, 180_000) // 真目录 76 模型逐个 key 解密+探测，网络波动下会慢
const list = models.outcome?.models || models.json?.models || []
const ok = list.filter((m) => m.keyStatus === 'ok')
// 选型按 references 能力走（工具描述的教导，上一轮 L3 被诚实护栏拦下的教训）：
// 镜头节点连了 character_ref 参考边 → 图片模型必须带得动参考图（i2i），视频模型必须支持 image 参考（i2v）。
const canRefImage = (m) => Boolean(m.references && m.references.image)
const img = ok.find((m) => m.kind === 'image' && canRefImage(m)) || ok.find((m) => m.kind === 'image')
const vid = (ok.find((m) => m.kind === 'video' && canRefImage(m) && /seedance/i.test(m.modelKey))
  || ok.find((m) => m.kind === 'video' && canRefImage(m))
  || null) // 没有带参考能力的视频模型就如实跳过视频镜，不硬发
const textCands = ok.filter((m) => m.kind === 'text').slice(0, 6)
console.log(`· 判分候选（前 ${textCands.length} 个 text）：${textCands.map((m) => `${m.vendorKey || m.vendor}/${m.modelKey}`).join('，') || '无'}`)
console.log(`· 图模型参考能力：${img ? `${img.modelKey} refImage=${canRefImage(img)}` : '无'}；视频：${vid ? `${vid.modelKey} refImage=true` : '无带参考的'}`)
console.log(`✓ 模型目录：共 ${list.length}，keyStatus=ok ${ok.length} 个；选图=${img ? `${img.vendorKey || img.vendor}/${img.modelKey}` : '无'}；选视频=${vid ? `${vid.vendorKey || vid.vendor}/${vid.modelKey}` : '无'}`)
if (probeOnly) { console.log('PROBE PASS：key 解密与模型可用性正常，可跑真验收。'); cleanup(0); await new Promise(() => {}) }
if (!img) die('没有 keyStatus=ok 的图片模型，真验收无法进行')

// ── 真验收 ──────────────────────────────────────────────────────────
const audit = []
const proj = await callTool('nomi_create_project', { name: 'L3-W1 审片验收（可删）' })
const projectId = proj.json?.id || proj.json?.projectId
if (!projectId) die('建项目失败')

const ANCHOR_DESC = '年轻女性便利店收银员小周：短发、圆脸、左眉一颗痣，深蓝色工装制服，正面平光肖像，中性浅灰背景'
const anchorNodes = await callTool('nomi_add_nodes', { projectId, nodes: [{ kind: 'character', title: '小周 · 定妆', prompt: ANCHOR_DESC }] })
const anchorId = (anchorNodes.json?.ids || [])[0]
if (!anchorId) die('锚节点失败')

const mk = async (kind, title, prompt, vendor, modelKey) => {
  const r = await callTool('nomi_add_nodes', { projectId, nodes: [{ kind, title, prompt, vendor, modelKey }] })
  const id = (r.json?.ids || [])[0]
  if (!id) die(`节点失败：${title}`)
  await callTool('nomi_connect_nodes', { projectId, connections: [{ source: anchorId, target: id, mode: 'character_ref' }] })
  return id
}
const imgFallbacks = ok.filter((m) => m.kind === 'image' && canRefImage(m)).slice(0, 3)
const gen = async (label, nodeId, intent, prompt, m, timeoutMs) => {
  console.log(`— 生成 ${label}（${m.vendorKey || m.vendor}/${m.modelKey}）…`)
  const r = await callTool('nomi_generate', { projectId, nodeId, vendor: m.vendorKey || m.vendor, modelKey: m.modelKey, intent, prompt }, timeoutMs)
  const v = r.outcome?.verify || r.json?.verify || null
  const entry = { label, model: `${m.vendorKey || m.vendor}/${m.modelKey}`, status: r.json?.status, isError: r.isError, verify: v, text: r.text.slice(0, 400) }
  audit.push(entry)
  console.log(`  status=${entry.status} isError=${entry.isError} verify=${v ? `skipped=${v.skipped} passed=${v.passed} retries=${v.retries} scores=${JSON.stringify(v.scores)} flagged=${(v.flagged || []).map((f) => f.dimension + ':' + f.score).join(',') || '无'}` : '（无判分）'}`)
  return entry
}
/** 图生成带候选回退：vendor 挂了（isError）换下一个带参考能力的图模型再试一次。 */
const genImgWithFallback = async (label, nodeId, prompt, timeoutMs) => {
  for (const m of imgFallbacks.length ? imgFallbacks : [img]) {
    const e = await gen(label, nodeId, 'image', prompt, m, timeoutMs)
    if (!e.isError) return e
    console.log(`  ↳ ${m.modelKey} 失败，换下一个带参考能力的图模型`)
  }
  return audit[audit.length - 1]
}

// ① 锚图（1 图）：先出定妆照——它自己没有锚引用，判分按无锚上下文跑或跳过身份轴。
await genImgWithFallback('锚·定妆照', anchorId, ANCHOR_DESC, 300_000)
// ② 好镜（1 图 + 可能重试）：与锚一致的画面 → 期待 passed。
const goodId = await mk('image', '#好镜', '小周站在便利店冰柜前微笑，短发圆脸左眉痣清晰可见，深蓝工装，冷白灯光', img.vendorKey || img.vendor, img.modelKey)
await genImgWithFallback('好镜', goodId, '小周站在便利店冰柜前微笑，短发圆脸左眉痣清晰可见，深蓝工装，冷白灯光', 300_000)
// ③ 坏镜（1 图 + 预期 ≤2 次定向重试）：prompt 与锚身份公然矛盾 → 期待真 VLM 检出 identity 低分。
const badId = await mk('image', '#坏镜·身份错', '满脸皱纹的白发老年男性船长在海上驾驶舱的特写，风暴之夜', img.vendorKey || img.vendor, img.modelKey)
const bad = await genImgWithFallback('坏镜(身份矛盾)', badId, '满脸皱纹的白发老年男性船长在海上驾驶舱的特写，风暴之夜', 300_000)
// ④ 视频（≤1 条 + 极端情况重试）：与锚一致，尽量一次过——验真实抽帧判分链。
if (vid) {
  const vId = await mk('video', '#视频镜', '小周在便利店里缓缓抬头看向墙上时钟，固定机位，冷白灯光', vid.vendorKey || vid.vendor, vid.modelKey)
  await gen('视频镜', vId, 'video', '小周在便利店里缓缓抬头看向墙上时钟，固定机位，冷白灯光', vid, 420_000)
} else { console.log('（无可用视频模型，视频镜跳过——如实记录）') }

// ── 产物收集（供人眼 Read）────────────────────────────────────────
const outDir = path.join(repoRoot, 'docs/audit/2026-08-19-l3-w1-shot-verify')
fs.mkdirSync(outDir, { recursive: true })
const collected = []
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(png|jpg|jpeg|webp)$/i.test(e.name)) collected.push(p) } }
walk(projectsDir)
collected.forEach((p, i) => fs.copyFileSync(p, path.join(outDir, `${String(i + 1).padStart(2, '0')}-${path.basename(p)}`)))
fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify({ ranAt: new Date().toISOString(), spendConfirms, audit }, null, 2))
console.log(`\nL3-W1 完成：${audit.length} 次生成 · elicitation 确认 ${spendConfirms} 次 · 产物 ${collected.length} 张已拷到 ${path.relative(repoRoot, outDir)}/`)
const badV = bad?.verify
const detected = badV && badV.skipped !== true && (badV.passed === false || (badV.flagged || []).length > 0)
console.log(detected ? '✓ 坏镜被真 VLM 检出（criterion ⑥ 达成）' : `⚠ 坏镜判分未达成检出（skipped=${badV?.skipped}）：${JSON.stringify(badV)}——待人工核`)
cleanup(0)
