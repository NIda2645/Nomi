// 隔离探针：两跳第 1 跳（image_edit + 本地参考图）到底为什么失败。
//
// 背景：L3-F1b 第二轮，事件日志里终于出现了 `vendor.call.requested kind=image_edit
// model=doubao-seedream-4.5`——两跳发出去了。但**没有对应的 completed**，也没产出图，
// 错误被 runFirstHop 的 catch 吞掉，而降级理由只进了工具结果文本（驱动没打印）。
//
// 与其再烧一轮完整复验，不如把那一次调用单独拎出来打：建一个 image 节点、连上锚、直接
// nomi_generate。**这条路径和两跳第 1 跳完全同形**（同模型、同 image_edit 模式、同本地参考图），
// 但只花 1 张图的额度，而且错误会原样出现在工具结果里——没有 catch 吞它。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const APP = path.join(repoRoot, 'release/mac-arm64/Nomi.app')
const BIN = path.join(APP, 'Contents/MacOS/Nomi')
if (process.env.NOMI_L3_REAL !== '1') { console.log('加 NOMI_L3_REAL=1 显式确认（本探针花 2 张图的额度）'); process.exit(2) }

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-probe-ie-'))
const projectsDir = path.join(base, 'projects')
const capDir = path.join(base, 'capability')
for (const d of [projectsDir, capDir]) fs.mkdirSync(d, { recursive: true })

const child = spawn(BIN, [], {
  env: { ...process.env, NOMI_MCP_STDIO: '1', NOMI_PROJECTS_DIR: projectsDir, NOMI_CAPABILITY_DIR: capDir },
  stdio: ['pipe', 'pipe', 'inherit'],
})
const pending = new Map()
let seq = 0
child.on('exit', (c) => { for (const [, e] of pending) { clearTimeout(e.timer); e.resolve({ error: { message: 'exit' } }) } pending.clear() })
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  const t = line.trim(); if (!t.startsWith('{')) return
  let m; try { m = JSON.parse(t) } catch { return }
  if (m.method === 'elicitation/create' && m.id != null) {
    const props = m.params?.requestedSchema?.properties || {}
    const content = {}
    for (const [k, spec] of Object.entries(props)) content[k] = spec?.type === 'boolean' ? true : (Array.isArray(spec?.enum) && spec.enum.length ? spec.enum[0] : '')
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { action: 'accept', content } }) + '\n')
    return
  }
  if (m.id != null && pending.has(m.id)) { const { resolve, timer } = pending.get(m.id); clearTimeout(timer); pending.delete(m.id); resolve(m) }
})
const rpc = (method, params, ms = 30_000) => new Promise((res, rej) => {
  const id = (seq += 1)
  const timer = setTimeout(() => { pending.delete(id); rej(new Error(`超时 ${method}`)) }, ms)
  pending.set(id, { resolve: res, timer })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
})
async function call(name, args, ms = 300_000) {
  const r = (await rpc('tools/call', { name, arguments: args }, ms)).result
  const text = (r?.content || []).find((b) => b?.type === 'text')?.text || ''
  let json = null
  try { json = JSON.parse(text) } catch { const s = text.indexOf('{'), e = text.lastIndexOf('}'); if (s >= 0 && e > s) { try { json = JSON.parse(text.slice(s, e + 1)) } catch { /* */ } } }
  return { isError: Boolean(r?.isError), text, json }
}
const done = (c) => { try { child.stdin.end(); child.kill('SIGTERM') } catch { /* */ } setTimeout(() => process.exit(c), 400) }

let init = null
for (let i = 0; i < 30 && !init; i++) { try { init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: { elicitation: {} }, clientInfo: { name: 'probe', version: '1' } }, 4000) } catch { await new Promise((r) => setTimeout(r, 1000)) } }
if (!init?.result) { console.log('✗ 起不来'); done(1) }
console.log('✓ 起来了')

const p = await call('nomi_create_project', { name: 'image_edit 隔离探针（可删）' })
const projectId = p.json?.id || p.json?.projectId

// ① 先出一张锚（text_to_image，已知能成）
const a = await call('nomi_add_nodes', { projectId, nodes: [{ kind: 'character', title: '锚', prompt: '年轻女性收银员正面平光肖像，短发圆脸，深蓝工装，浅灰背景' }] })
const anchorId = (a.json?.ids || [])[0]
const g1 = await call('nomi_generate', { projectId, nodeId: anchorId, vendor: 'apimart', modelKey: 'doubao-seedream-4.5', intent: 'image', prompt: '年轻女性收银员正面平光肖像，短发圆脸，深蓝工装，浅灰背景', aspect_ratio: '9:16' })
console.log(`① 锚（text_to_image）：${g1.json?.status || (g1.isError ? 'ERROR' : '?')}`)
if (g1.isError) { console.log('   ', g1.text.slice(0, 400)); done(1) }

// ② 关键一步：image 节点 + 连锚 → 走 image_edit + 本地参考图（= 两跳第 1 跳同形）
const b = await call('nomi_add_nodes', { projectId, nodes: [{ kind: 'image', title: '首帧图（探针）', prompt: '深夜便利店内，短发圆脸的女性收银员低头理货，腰部以上中景，冷白顶光' }] })
const shotId = (b.json?.ids || [])[0]
await call('nomi_connect_nodes', { projectId, connections: [{ source: anchorId, target: shotId, mode: 'character_ref' }] })
const g2 = await call('nomi_generate', { projectId, nodeId: shotId, vendor: 'apimart', modelKey: 'doubao-seedream-4.5', intent: 'image', prompt: '深夜便利店内，短发圆脸的女性收银员低头理货，腰部以上中景，冷白顶光', aspect_ratio: '9:16' })
console.log(`\n② image_edit + 本地参考图：${g2.json?.status || (g2.isError ? 'ERROR' : '?')}`)
console.log('   完整回执：')
console.log(g2.text.split('\n').map((l) => '   ' + l).join('\n').slice(0, 1800))

const out = path.join(repoRoot, 'docs/audit/2026-08-20-l3-f1b-reverify/probe')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const found = []
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); if (e.isDirectory()) walk(q); else if (/\.(png|jpg|jpeg|webp)$/i.test(e.name)) found.push(q) } }
walk(projectsDir)
found.forEach((q, i) => fs.copyFileSync(q, path.join(out, `${i + 1}-${path.basename(q)}`)))
console.log(`\n产物 ${found.length} 张 → ${path.relative(repoRoot, out)}/`)
done(0)
