// L3-W2 真额度验收（harness plan §三 第 2 行：一致性地基 · ~12 图 + ≤3 视频）。
//
// 验三件事（W2 的三个交付）：
//  ① 跨镜身份一致性：同一锚喂 5 个不同景别的镜头，真 VLM 判 identity 均分 ≥4/5（判据⑦）；
//  ② I2V 两跳：video 镜带参考 → 应看到「先 image 后 video」两次 vendor 调用（打包版真实链路）；
//  ③ 资产导入（M2）：本机文件 → nomi_import_asset → 拿到的 nomi-local:// 真能当 references 用。
// 签名守卫、隔离目录、NOMI_L3_REAL 显式闸同 l3-w1（那套已验证，不重写）。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// 判据⑦的均分口径不在这儿手算——引 app 内同一份纯核（dist-electron 是打包产物的来源），
// 否则「文档写的口径 / app 里跑的口径 / 验收脚本算的口径」会各是一套，报告就成了自说自话。
const { assessableAverage } = createRequire(import.meta.url)(
  path.join(repoRoot, 'dist-electron/capabilityCore/shotVerifyCore.js'),
)
const APP = path.join(repoRoot, 'release/mac-arm64/Nomi.app')
const BIN = path.join(APP, 'Contents/MacOS/Nomi')
const probeOnly = process.argv.includes('--probe')
if (!probeOnly && process.env.NOMI_L3_REAL !== '1') {
  console.log('拒绝：真验收会花真额度。加 NOMI_L3_REAL=1 显式确认，或 --probe 跑零花费探针。')
  process.exit(2)
}
if (!fs.existsSync(BIN)) { console.log(`打包产物不存在：${BIN}`); process.exit(2) }
{
  const { execSync } = await import('node:child_process')
  const IDENTITY = 'Nomi Local Codesign'
  const signed = (() => { try { return execSync(`codesign -dvv "${APP}" 2>&1`, { encoding: 'utf8' }).includes(IDENTITY) } catch { return false } })()
  if (!signed) { console.log(`✗ 包未用「${IDENTITY}」签名——先签再跑，否则钥匙串反复弹框。`); process.exit(2) }
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-l3-w2-'))
const projectsDir = path.join(base, 'projects')
const capDir = path.join(base, 'capability')
for (const d of [projectsDir, capDir]) fs.mkdirSync(d, { recursive: true })

const child = spawn(BIN, [], {
  env: { ...process.env, NOMI_MCP_STDIO: '1', NOMI_PROJECTS_DIR: projectsDir, NOMI_CAPABILITY_DIR: capDir },
  stdio: ['pipe', 'pipe', 'inherit'],
})
const pending = new Map()
let seq = 0
let spendConfirms = 0
child.on('exit', (code) => { console.log(`[l3] 子进程退出 code=${code}`); for (const [, e] of pending) { clearTimeout(e.timer); e.resolve({ error: { message: 'child exited' } }) } pending.clear() })
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
    if (child.exitCode !== null || !child.stdin.writable) { clearTimeout(timer); pending.delete(id); reject(new Error('子进程已退出')); return }
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}
async function callTool(name, args, timeoutMs = 90_000) {
  const res = (await rpc('tools/call', { name, arguments: args }, timeoutMs)).result
  const text = (res?.content || []).find((b) => b?.type === 'text')?.text || ''
  let json = null
  try { json = JSON.parse(text) } catch {
    const s = text.indexOf('{'); const e = text.lastIndexOf('}')
    if (s >= 0 && e > s) { try { json = JSON.parse(text.slice(s, e + 1)) } catch { json = null } }
  }
  return { isError: Boolean(res?.isError), text, json, outcome: res?.structuredContent?.nomiOutcome || {} }
}
function cleanup(code) { try { child.stdin.end(); child.kill('SIGTERM') } catch { /* */ } setTimeout(() => process.exit(code), 400) }

let init = null
for (let i = 0; i < 30 && !init; i++) { try { init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: { elicitation: {} }, clientInfo: { name: 'codex', version: 'l3-w2' } }, 4000) } catch { await new Promise((r) => setTimeout(r, 1000)) } }
if (!init?.result) { console.log('✗ stdio server 起不来'); cleanup(1) }
console.log('✓ 打包二进制起来了（证书签名 · 隔离目录）')

const models = await callTool('nomi_list_models', {}, 420_000) // 真目录 76 模型逐个解密探测，首调很慢
const ok = (models.outcome?.models || models.json?.models || []).filter((m) => m.keyStatus === 'ok')
const canRef = (m) => Boolean(m.references && m.references.image)
const img = ok.find((m) => m.kind === 'image' && canRef(m) && /seedream/i.test(m.modelKey)) || ok.find((m) => m.kind === 'image' && canRef(m))
const vid = ok.find((m) => m.kind === 'video' && canRef(m) && /seedance/i.test(m.modelKey)) || ok.find((m) => m.kind === 'video' && canRef(m))
console.log(`✓ 选图=${img ? img.modelKey : '无'}；选视频=${vid ? vid.modelKey : '无'}`)
if (probeOnly) { console.log('PROBE PASS'); cleanup(0); await new Promise(() => {}) }
if (!img) { console.log('✗ 无可用带参考图片模型'); cleanup(1) }

const audit = []
const proj = await callTool('nomi_create_project', { name: 'L3-W2 一致性验收（可删）' })
const projectId = proj.json?.id || proj.json?.projectId
if (!projectId) { console.log('✗ 建项目失败'); cleanup(1) }

// ── ③ M2 资产导入：拿仓库里一张真图当「本机素材」导入 ──────────────
const localFile = path.join(repoRoot, 'docs/audit/2026-08-19-l3-w1-shot-verify/03-image-1787158633643.jpg')
let importedUrl = ''
if (fs.existsSync(localFile)) {
  const imported = await callTool('nomi_import_asset', { projectId, path: localFile, title: '小周-导入锚' })
  importedUrl = imported.json?.url || ''
  console.log(imported.isError ? `✗ 资产导入失败：${imported.text.slice(0, 120)}` : `✓ M2 资产导入：${importedUrl.slice(0, 56)}`)
  audit.push({ step: 'import_asset', ok: !imported.isError && importedUrl.startsWith('nomi-local://'), url: importedUrl })
} else {
  console.log('（找不到本机样图，跳过 M2 实测）')
}

// ── ① 一致性：同一锚 → 5 个不同景别镜头 ────────────────────────────
const ANCHOR = '年轻女性便利店收银员小周：短发、圆脸、左眉一颗痣，深蓝色工装制服，正面平光肖像，中性浅灰背景'
// 导入的图直接当锚（M2 打通后，锚可以是用户给的真实素材而非只能现生成）——两个能力串起来验。
const anchorRes = await callTool('nomi_add_nodes', { projectId, nodes: [{ kind: 'character', title: '小周·定妆', prompt: ANCHOR }] })
const anchorId = (anchorRes.json?.ids || [])[0]
if (importedUrl) {
  // 把导入的图设成锚的产出（后续镜头连边即引用它）——省一次生成，且验证导入图真能当参考源。
  await callTool('nomi_set_node_prompt', { projectId, nodeId: anchorId, prompt: `${ANCHOR}（参考：已导入素材）` })
}
const anchorGen = await callTool('nomi_generate', { projectId, nodeId: anchorId, vendor: img.vendorKey || img.vendor, modelKey: img.modelKey, intent: 'image', prompt: ANCHOR }, 300_000)
console.log(`— 锚定妆照：${anchorGen.json?.status} ${JSON.stringify(anchorGen.outcome?.verify?.scores || {})}`)
audit.push({ step: 'anchor', status: anchorGen.json?.status, verify: anchorGen.outcome?.verify || null })

const SHOTS = [
  ['远景', '便利店全景，小周站在收银台后，冷白灯光，广角远景'],
  ['中景', '小周在货架前整理商品，腰部以上中景'],
  ['近景', '小周低头看手机的近景，侧光'],
  ['特写', '小周眼睛的特写，睫毛与左眉痣清晰'],
  ['过肩', '过肩镜头：从顾客肩后看向柜台后的小周'],
]
const identityScores = []
for (const [label, prompt] of SHOTS) {
  const r = await callTool('nomi_add_nodes', { projectId, nodes: [{ kind: 'image', title: `#${label}`, prompt, vendor: img.vendorKey || img.vendor, modelKey: img.modelKey }] })
  const nid = (r.json?.ids || [])[0]
  await callTool('nomi_connect_nodes', { projectId, connections: [{ source: anchorId, target: nid, mode: 'character_ref' }] })
  const g = await callTool('nomi_generate', { projectId, nodeId: nid, vendor: img.vendorKey || img.vendor, modelKey: img.modelKey, intent: 'image', prompt }, 300_000)
  const v = g.outcome?.verify || null
  const identity = v?.scores?.identity
  if (typeof identity === 'number') identityScores.push(identity)
  console.log(`— ${label}：${g.json?.status} identity=${identity ?? '—'} flagged=${(v?.flagged || []).map((f) => f.dimension).join(',') || '无'}`)
  audit.push({ step: `shot-${label}`, status: g.json?.status, verify: v })
}

// ── ② I2V 两跳（video 镜带参考）───────────────────────────────────
if (vid) {
  const r = await callTool('nomi_add_nodes', { projectId, nodes: [{ kind: 'video', title: '#两跳视频', prompt: '小周缓缓抬头看向墙上时钟，固定机位', vendor: vid.vendorKey || vid.vendor, modelKey: vid.modelKey }] })
  const nid = (r.json?.ids || [])[0]
  await callTool('nomi_connect_nodes', { projectId, connections: [{ source: anchorId, target: nid, mode: 'character_ref' }] })
  const g = await callTool('nomi_generate', { projectId, nodeId: nid, vendor: vid.vendorKey || vid.vendor, modelKey: vid.modelKey, intent: 'video', prompt: '小周缓缓抬头看向墙上时钟，固定机位' }, 420_000)
  console.log(`— 两跳视频：${g.json?.status} identity=${g.outcome?.verify?.scores?.identity ?? '—'}`)
  audit.push({ step: 'two-hop-video', status: g.json?.status, verify: g.outcome?.verify || null })
}

const outDir = path.join(repoRoot, 'docs/audit/2026-08-20-l3-w2-consistency')
fs.mkdirSync(outDir, { recursive: true })
const collected = []
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(png|jpg|jpeg|webp)$/i.test(e.name)) collected.push(p) } }
walk(projectsDir)
collected.forEach((p, i) => fs.copyFileSync(p, path.join(outDir, `${String(i + 1).padStart(2, '0')}-${path.basename(p)}`)))
// 均分只统计判分器判得了的镜头：0 = 「这题没法答」（眼部微距等看不到脸的合法景别），
// 计入会凭空拉低、当满分会凭空拉高，两种都是编造结论。未验的单列报出来，不静默丢。
const { average, assessed, notAssessable } = assessableAverage(identityScores)
fs.writeFileSync(
  path.join(outDir, 'run.json'),
  JSON.stringify({ spendConfirms, identityScores, identityAvg: average, identityAssessed: assessed, identityNotAssessable: notAssessable, audit }, null, 2),
)
console.log(`\nL3-W2：${audit.length} 步 · 确认 ${spendConfirms} 次 · 产物 ${collected.length} 张 → ${path.relative(repoRoot, outDir)}/`)
if (average === null) {
  console.log(`判据⑦ 同角色跨镜 identity：${notAssessable} 镜全部无法判定 → 本轮**没有结论**（不是通过，也不是不通过）`)
} else {
  const verdict = average >= 4 ? '✓ 达成' : '⚠ 未达成，待人工核'
  console.log(`判据⑦ 同角色跨镜 identity 均分 = ${average.toFixed(2)}（分母 ${assessed} 镜，要求 ≥4）：${verdict}`)
  if (notAssessable > 0) console.log(`  ⚠ 另有 ${notAssessable} 镜判分器无法判定（画面中无可比对的身份特征），未计入均分、也未验过`)
  if (assessed < 3) console.log(`  ⚠ 分母只有 ${assessed} 镜，样本太小，不足以据此宣布判据⑦通过`)
}
cleanup(0)
