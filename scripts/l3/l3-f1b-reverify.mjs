// L3-F1b 复验：证明 L3-F1 抓出的缺陷 A/B 真的修好了（不是靠读代码推断）。
//
// 上一轮我栽在「靠文件名判断链路跑没跑」——目录里出现 frame-first-*.png 就认定两跳跑了，
// 其实那是判分器抽的帧。**这一轮改成数产出凭证**：两跳跑了就必然多出一次**图片生成**，
// 于是项目里会多出 image-*.jpg。数它，不数名字像的东西。
//
// 验四件事：
//  A1 两跳在 Seedance 上真触发 → 每个带锚的 video 镜多出一张生成图（image-*.jpg 计数）；
//  A2 ffDesc 真送达 → 带锚镜的场景不再漂移（人眼核，脚本只负责把产物摆出来）；
//  B  「逐渐显出」类镜头不再被误判 → 复刻 F1 里被误报的那一镜，看构图分与红标；
//  C  连贯轴真出分 → 第 2 镜起 continuity 不再是「—」。
//
// 只跑 3 镜（1 锚 + 2 视频），花费远小于 F1：图 ≤6、视频 ≤3。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
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

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-l3-f1b-'))
const projectsDir = path.join(base, 'projects')
const capDir = path.join(base, 'capability')
for (const d of [projectsDir, capDir]) fs.mkdirSync(d, { recursive: true })

const child = spawn(BIN, [], {
  env: { ...process.env, NOMI_MCP_STDIO: '1', NOMI_PROJECTS_DIR: projectsDir, NOMI_CAPABILITY_DIR: capDir },
  stdio: ['pipe', 'pipe', 'inherit'],
})
const pending = new Map()
let seq = 0
let elicitations = 0
child.on('exit', (code) => { console.log(`[l3b] 子进程退出 code=${code}`); for (const [, e] of pending) { clearTimeout(e.timer); e.resolve({ error: { message: 'child exited' } }) } pending.clear() })
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  const t = line.trim(); if (!t.startsWith('{')) return
  let msg; try { msg = JSON.parse(t) } catch { return }
  if (msg.method === 'elicitation/create' && msg.id != null) {
    elicitations += 1
    const props = msg.params?.requestedSchema?.properties || {}
    const content = {}
    for (const [key, spec] of Object.entries(props)) {
      if (spec?.type === 'boolean') content[key] = true
      else if (Array.isArray(spec?.enum) && spec.enum.length) content[key] = spec.enum[0]
      else content[key] = ''
    }
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { action: 'accept', content } }) + '\n')
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

/** 数「生成出来的图片」——两跳的产出凭证。判分抽的帧叫 frame-*，不在此列。 */
const countGeneratedImages = () => {
  let n = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/^image-.*\.(jpg|jpeg|png|webp)$/i.test(e.name)) n += 1
    }
  }
  walk(projectsDir)
  return n
}

let init = null
for (let i = 0; i < 30 && !init; i++) { try { init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: { elicitation: {} }, clientInfo: { name: 'codex', version: 'l3-f1b' } }, 4000) } catch { await new Promise((r) => setTimeout(r, 1000)) } }
if (!init?.result) { console.log('✗ stdio server 起不来'); cleanup(1) }
console.log('✓ 打包二进制起来了（含 A/B 修复）')

console.log('  （首调 list_models 慢，最多等 15 分钟）')
const models = await callTool('nomi_list_models', {}, 900_000)
const ok = (models.outcome?.models || models.json?.models || []).filter((m) => m.keyStatus === 'ok')
const canRef = (m) => Boolean(m.references && m.references.image)
const img = ok.find((m) => m.kind === 'image' && canRef(m) && /seedream/i.test(m.modelKey)) || ok.find((m) => m.kind === 'image' && canRef(m))
const vid = ok.find((m) => m.kind === 'video' && canRef(m) && /seedance/i.test(m.modelKey)) || ok.find((m) => m.kind === 'video' && canRef(m))
console.log(`✓ 选图=${img?.modelKey}；选视频=${vid?.modelKey}（复验的就是 Seedance 这条路）`)
if (probeOnly) { console.log('PROBE PASS'); cleanup(0); await new Promise(() => {}) }
if (!img || !vid) { console.log('✗ 缺模型'); cleanup(1) }

const proj = await callTool('nomi_create_project', { name: 'L3-F1b 复验（可删）' })
const projectId = proj.json?.id || proj.json?.projectId
const ANCHOR = '年轻女性便利店夜班收银员小周的正面平光定妆肖像：短发、圆脸、左眉一颗痣、单眼皮、瘦削；深蓝色工装制服；中性浅灰背景，柔光，写实摄影'
const a = await callTool('nomi_add_nodes', { projectId, nodes: [{ kind: 'character', title: '小周·定妆', prompt: ANCHOR }] })
const anchorId = (a.json?.ids || [])[0]
await callTool('nomi_generate', { projectId, nodeId: anchorId, vendor: img.vendorKey || img.vendor, modelKey: img.modelKey, intent: 'image', prompt: ANCHOR, aspect_ratio: '9:16' }, 300_000)
const afterAnchor = countGeneratedImages()
console.log(`\n锚出图完成。生成图计数 = ${afterAnchor}（应为 1：只有定妆卡）`)

// 两镜：都带锚（走两跳）。第 2 镜复刻 F1 里被误报的「逐渐显出」设计。
const SHOTS = [
  {
    title: '#1 她抬头', ff: '深夜便利店内，短发圆脸的女性收银员低头理货，腰部以上中景，冷白顶光，深蓝工装，背景货架与冰柜',
    lf: '同一女性已抬起头，手停在货架上', prompt: '中景，短发圆脸的女性缓缓抬头，手上的动作停住，身体朝向画面右前方',
  },
  {
    title: '#2 逐渐显出（B 的复刻）', ff: '空荡的便利店走道远景，冷白灯管，货架延伸向深处，画面中央无人',
    lf: '同一条走道，走道尽头站着一个穿深蓝工装的背影', prompt: '远景，镜头缓缓推进扫过空走道，走道尽头逐渐显出一个静止的背影',
  },
]
const shotRes = await callTool('nomi_add_nodes', {
  projectId, nodes: SHOTS.map((s) => ({ kind: 'video', title: s.title, prompt: s.prompt, vendor: vid.vendorKey || vid.vendor, modelKey: vid.modelKey })),
})
const shotIds = shotRes.json?.ids || []
await callTool('nomi_connect_nodes', { projectId, connections: shotIds.map((id) => ({ source: anchorId, target: id, mode: 'character_ref' })) })

const results = []
let before = afterAnchor
for (let i = 0; i < SHOTS.length; i += 1) {
  const s = SHOTS[i]
  const g = await callTool('nomi_generate', {
    projectId, nodeId: shotIds[i], vendor: vid.vendorKey || vid.vendor, modelKey: vid.modelKey,
    intent: 'video', prompt: s.prompt, firstFrameDesc: s.ff, lastFrameDesc: s.lf, aspect_ratio: '9:16', duration: 5,
  }, 600_000)
  const now = countGeneratedImages()
  const newImages = now - before
  before = now
  const v = g.outcome?.verify || null
  results.push({ title: s.title, status: g.json?.status, newImages, verify: v })
  console.log(
    `  ${s.title}：${g.json?.status}｜**新增生成图 ${newImages} 张**（两跳凭证：应 ≥1）`
    + ` identity=${v?.scores?.identity ?? '—'} composition=${v?.scores?.composition ?? '—'} continuity=${v?.scores?.continuity ?? '—'}`
    + `${v?.retries ? ` [重滚${v.retries}次]` : ''}${v?.flagged?.length ? ` [红标:${v.flagged.map((f) => `${f.dimensionName}=${f.score}`).join(',')}]` : ''}`,
  )
}

const outDir = path.join(repoRoot, 'docs/audit/2026-08-20-l3-f1b-reverify')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
const collected = []
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(png|jpg|jpeg|webp|mp4)$/i.test(e.name)) collected.push(p) } }
walk(projectsDir)
collected.forEach((p, i) => fs.copyFileSync(p, path.join(outDir, `${String(i + 1).padStart(2, '0')}-${path.basename(p)}`)))
fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify({ projectId, elicitations, results, artifacts: collected.length }, null, 2))

console.log(`\n══ 复验结论 ══`)
const twoHopFired = results.every((r) => r.newImages >= 1)
console.log(`A1 两跳在 Seedance 上真触发：${twoHopFired ? '✅ 每镜都多出了生成图' : '❌ 没有多出生成图 —— 两跳仍未触发'}`)
const continuityScored = results.slice(1).every((r) => typeof r.verify?.scores?.continuity === 'number')
console.log(`C  连贯轴真出分：${continuityScored ? '✅' : '❌ 第 2 镜仍是「—」'}`)
const bShot = results[1]
console.log(`B  「逐渐显出」镜：构图 ${bShot?.verify?.scores?.composition ?? '—'}，红标 ${bShot?.verify?.flagged?.length || 0} 处`
  + `（F1 那轮同款设计被判 1 档 + 红标 + 白烧一次重滚）`)
console.log(`产物 ${collected.length} 件 → ${path.relative(repoRoot, outDir)}/ —— 接下来由我逐张亲眼看（A2 场景是否还漂移）。`)
cleanup(0)
