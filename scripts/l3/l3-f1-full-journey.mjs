// L3-F1 真额度**全旅程**验收（harness plan §三 最后一行）——整套 harness 就是为这一跑造的。
//
// 用户给的三条要求（2026-08-19 原话）：
//  ① 给额度但别花太多：几十张图没问题，视频六七个或八九个片段；
//  ② **必须由真实的用户去体验**——我作为真实用户，把任务发给桌面端软件，真实地把东西做出来；
//  ③ 最终做出来的质量和整个流程，必须确实符合预期。
//
// 所以这条脚本不是「测函数」，是**我扮演用户，用 MCP 客户端的身份，把一条短剧从故事做到成片**：
// 立圣经 → 出定妆卡 → 冻结 → 拆镜 → 逐镜生成（真 I2V 两跳 + 真 VLM 审片 + 定向重滚）→ 拿交付报告。
// 全程走**打包后的二进制**（用户装机拿到的就是它），真供应商、真额度。
//
// 花费上界（硬编码，超了自己停）：图 ≤34、视频 ≤8。每步实报。
// 签名守卫 / 隔离目录 / NOMI_L3_REAL 显式闸同 l3-w1/w2（那套已验证，不重写）。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
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

const MAX_IMAGES = 34
const MAX_VIDEOS = 8
let imageSpend = 0
let videoSpend = 0

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-l3-f1-'))
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
let elicitations = 0
const elicitLog = []
child.on('exit', (code) => { console.log(`[l3] 子进程退出 code=${code}`); for (const [, e] of pending) { clearTimeout(e.timer); e.resolve({ error: { message: 'child exited' } }) } pending.clear() })
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  const t = line.trim(); if (!t.startsWith('{')) return
  let msg; try { msg = JSON.parse(t) } catch { return }
  if (msg.method === 'elicitation/create' && msg.id != null) {
    elicitations += 1
    const message = String(msg.params?.message || '')
    elicitLog.push(message.slice(0, 200))
    // 我作为用户看到问句就答「行」。付费类计数单列（判据①打扰预算要分清「问钱」和「问方向」）。
    if (/额度|花费|生成|确认/.test(message)) spendConfirms += 1
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

let init = null
for (let i = 0; i < 30 && !init; i++) { try { init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: { elicitation: {} }, clientInfo: { name: 'codex', version: 'l3-f1' } }, 4000) } catch { await new Promise((r) => setTimeout(r, 1000)) } }
if (!init?.result) { console.log('✗ stdio server 起不来'); cleanup(1) }
console.log('✓ 打包二进制起来了（证书签名 · 隔离目录）')

console.log('  （首调 list_models 要逐个解密 76 个模型，慢，最多等 15 分钟）')
const models = await callTool('nomi_list_models', {}, 900_000)
const ok = (models.outcome?.models || models.json?.models || []).filter((m) => m.keyStatus === 'ok')
const canRef = (m) => Boolean(m.references && m.references.image)
const img = ok.find((m) => m.kind === 'image' && canRef(m) && /seedream/i.test(m.modelKey)) || ok.find((m) => m.kind === 'image' && canRef(m))
const vid = ok.find((m) => m.kind === 'video' && canRef(m) && /seedance/i.test(m.modelKey)) || ok.find((m) => m.kind === 'video' && canRef(m))
console.log(`✓ 选图=${img ? img.modelKey : '无'}；选视频=${vid ? vid.modelKey : '无'}`)
if (probeOnly) { console.log('PROBE PASS'); cleanup(0); await new Promise(() => {}) }
if (!img || !vid) { console.log('✗ 缺可用的带参考图片/视频模型'); cleanup(1) }

const audit = []
const identityScores = []
const t0 = Date.now()

// ══ 幕 0：立项 ══════════════════════════════════════════════════
const proj = await callTool('nomi_create_project', { name: 'L3-F1 短剧全旅程验收（可删）' })
const projectId = proj.json?.id || proj.json?.projectId
if (!projectId) { console.log('✗ 建项目失败'); cleanup(1) }
console.log(`\n幕0 立项：${projectId}`)

// ══ 幕 1-2：立圣经 + 出定妆卡 + 冻结 ═══════════════════════════
// 短剧《最后一班》：便利店夜班收银员发现每晚 2:17 都有同一个身影经过，第三夜她跟了出去。
const BIBLE = {
  静态: '短发、圆脸、左眉一颗痣、单眼皮、瘦削',
  动态: '深蓝色便利店工装制服，胸前工牌',
  禁改: '发型/痣的位置/脸型全片不许变',
}
const ANCHOR_PROMPT =
  '年轻女性便利店夜班收银员小周的正面平光定妆肖像：'
  + `${BIBLE.静态}；${BIBLE.动态}；中性浅灰背景，柔光，无妆感，写实摄影`
const anchorRes = await callTool('nomi_add_nodes', {
  projectId,
  nodes: [{ kind: 'character', title: '小周·定妆', prompt: ANCHOR_PROMPT }],
})
const anchorId = (anchorRes.json?.ids || [])[0]
console.log(`幕1-2 圣经立好（静态「${BIBLE.静态}」不许变），出定妆卡…`)
const anchorGen = await callTool('nomi_generate', {
  projectId, nodeId: anchorId, vendor: img.vendorKey || img.vendor, modelKey: img.modelKey,
  intent: 'image', prompt: ANCHOR_PROMPT, aspect_ratio: '9:16',
}, 300_000)
imageSpend += 1
console.log(`  定妆卡：${anchorGen.json?.status}`)
audit.push({ act: '定妆卡', status: anchorGen.json?.status, verify: anchorGen.outcome?.verify || null })
if (anchorGen.json?.status !== 'succeeded') { console.log('✗ 定妆卡都没出来，后面没有锚可用'); cleanup(1) }

// 冻结门第三层的实地检验：此刻锚**还没冻结**，下一镜引用它应当收到提醒。
// （我作为用户，这时候正应该被提醒「先看看这张脸对不对」。）

// ══ 幕 3：拆镜 ══════════════════════════════════════════════════
// 三段式：钩子（前 3-5 秒抛不对劲）→ 升级 → 反转留问号。
const SHOTS = [
  {
    title: '#1 钩子·2:17',
    variationType: 'small',
    ffDesc: '深夜便利店内，收银台后的挂钟特写，指针停在 2:17，冷白灯管，画面右下角虚化的货架',
    lfDesc: '同一挂钟，指针仍是 2:17，但玻璃面上多了一道人形倒影',
    prompt: '固定机位，挂钟特写，秒针跳动，玻璃反光里缓缓浮现一个模糊人影',
  },
  {
    title: '#2 她抬头',
    variationType: 'medium',
    ffDesc: '短发圆脸的女性收银员低头理货，腰部以上中景，冷白顶光，深蓝工装',
    lfDesc: '同一女性已抬起头，视线朝向画面右前方的玻璃门，手停在货架上',
    prompt: '中景，短发圆脸的女性缓缓抬头，手上的动作停住，身体朝向画面右前方',
  },
  {
    title: '#3 门外的影',
    variationType: 'large',
    ffDesc: '从店内向外拍的玻璃门，门外街道漆黑，门上贴着营业时间贴纸',
    lfDesc: '同一扇玻璃门，门外街道空无一人，只剩一片被踩湿的脚印',
    prompt: '镜头从店内推向玻璃门，门外由暗转亮再复暗，地面浮现一串湿脚印',
  },
  {
    title: '#4 她推门',
    variationType: 'medium',
    ffDesc: '短发圆脸的女性背对镜头站在玻璃门内侧，手扶门把，深蓝工装，冷白店内光与门外暗夜对比',
    lfDesc: '同一女性已半跨出门外，身体一半在暖白店光里、一半没入街道黑暗',
    prompt: '中景，背对镜头的女性推门，身体前倾跨出门槛，门缝里灌进夜风吹动她的短发',
  },
  {
    title: '#5 反转·街上',
    variationType: 'large',
    ffDesc: '空荡的夜间街道远景，路灯昏黄，路面积水映着灯光，画面中央无人',
    lfDesc: '同一条街道，远处路灯下站着一个背影，穿着与她相同的深蓝工装',
    prompt: '远景，镜头缓缓横移扫过空街，远处路灯下逐渐显出一个静止的背影',
  },
  {
    title: '#6 结尾·同一张脸',
    variationType: 'small',
    ffDesc: '短发圆脸的女性面部近景，左眉一颗痣清晰，路灯暖黄侧光，背景虚化的夜街',
    lfDesc: '同一张脸，瞳孔微微收缩，嘴唇轻启，眼神从疑惑转为震惊',
    prompt: '近景，短发圆脸的女性瞳孔收缩，嘴唇轻启，微微后仰半步',
  },
]
const shotRes = await callTool('nomi_add_nodes', {
  projectId,
  nodes: SHOTS.map((s) => ({
    kind: 'video', title: s.title, prompt: s.prompt,
    vendor: vid.vendorKey || vid.vendor, modelKey: vid.modelKey,
  })),
})
const shotIds = shotRes.json?.ids || []
console.log(`幕3 拆镜：${shotIds.length} 镜落画布（钩子→升级→反转）`)
// 有人物的镜连锚（#1/#3/#5 是空镜/物件镜，不连——连了反而逼模型往里塞人）
const PEOPLE_SHOTS = [1, 3, 5] // 索引：#2 她抬头 / #4 她推门 / #6 结尾
await callTool('nomi_connect_nodes', {
  projectId,
  connections: PEOPLE_SHOTS.map((i) => ({ source: anchorId, target: shotIds[i], mode: 'character_ref' })),
})
console.log(`  ${PEOPLE_SHOTS.length} 个有人物的镜连上定妆卡（空镜不连——连了反逼模型塞人进去）`)

// ══ 幕 4-5：逐镜生成（真两跳 + 真审片 + 真重滚）══════════════════
let advisorySeen = false
for (let i = 0; i < SHOTS.length; i += 1) {
  if (videoSpend >= MAX_VIDEOS) { console.log(`  ⚠ 触到视频上界 ${MAX_VIDEOS}，主动停手（用户说了别花太多）`); break }
  const s = SHOTS[i]
  const usesAnchor = PEOPLE_SHOTS.includes(i)
  const g = await callTool('nomi_generate', {
    projectId, nodeId: shotIds[i], vendor: vid.vendorKey || vid.vendor, modelKey: vid.modelKey,
    intent: 'video', prompt: s.prompt, firstFrameDesc: s.ffDesc, lastFrameDesc: s.lfDesc,
    aspect_ratio: '9:16', duration: 5,
  }, 600_000)
  videoSpend += 1
  if (usesAnchor) imageSpend += 1 // 两跳的首帧图
  const verify = g.outcome?.verify || null
  const identity = verify?.scores?.identity
  if (usesAnchor && typeof identity === 'number') identityScores.push(identity)
  if (/还没冻结定妆/.test(g.text || '')) advisorySeen = true
  console.log(
    `  ${s.title}：${g.json?.status}`
    + ` identity=${identity ?? '—'} composition=${verify?.scores?.composition ?? '—'} continuity=${verify?.scores?.continuity ?? '—'}`
    // flagged 是 {dimensionName, score, reason} 对象数组（交付文本逐字段渲染），直接 join 会出 [object Object]。
    + `${verify?.retried ? ' [重滚过]' : ''}${verify?.flagged?.length ? ` [红标:${verify.flagged.map((f) => `${f.dimensionName || f.key}=${f.score}`).join(',')}]` : ''}`,
  )
  audit.push({ act: s.title, usesAnchor, status: g.json?.status, verify, deepLink: g.outcome?.openInNomi || null })
}

// ══ 幕 6：收产物 + 判据对账 ═════════════════════════════════════
const outDir = path.join(repoRoot, 'docs/audit/2026-08-20-l3-f1-full-journey')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
const collected = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(png|jpg|jpeg|webp|mp4)$/i.test(e.name)) collected.push(p)
  }
}
walk(projectsDir)
collected.forEach((p, i) => fs.copyFileSync(p, path.join(outDir, `${String(i + 1).padStart(2, '0')}-${path.basename(p)}`)))

const { average, assessed, notAssessable } = assessableAverage(identityScores)
const succeeded = audit.filter((a) => a.status === 'succeeded').length
const flaggedShots = audit.filter((a) => a.verify?.flagged?.length)
const minutes = Math.round((Date.now() - t0) / 60000)
const summary = {
  projectId, minutes,
  spend: { images: imageSpend, videos: videoSpend, capImages: MAX_IMAGES, capVideos: MAX_VIDEOS },
  elicitations, spendConfirms, elicitLog,
  identityScores, identityAvg: average, identityAssessed: assessed, identityNotAssessable: notAssessable,
  succeeded, total: audit.length, flagged: flaggedShots.map((a) => ({ act: a.act, axes: a.verify.flagged })),
  freezeAdvisorySeen: advisorySeen,
  artifacts: collected.length,
  audit,
}
fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify(summary, null, 2))

console.log(`\n══ L3-F1 全旅程 · ${minutes} 分钟 ══`)
console.log(`实花：图 ${imageSpend}/${MAX_IMAGES} · 视频 ${videoSpend}/${MAX_VIDEOS}｜产物 ${collected.length} 件 → ${path.relative(repoRoot, outDir)}/`)
console.log(`判据① 打扰预算：全程 ${elicitations} 次问询（其中付费确认 ${spendConfirms} 次）——要求 ≤4`)
console.log(`判据④ 交付完整：${succeeded}/${audit.length} 镜成功；红标 ${flaggedShots.length} 处`)
if (average === null) {
  console.log(`判据⑦ identity：${notAssessable} 镜全部无法判定 → 本轮**没有结论**`)
} else {
  console.log(`判据⑦ identity 均分 = ${average.toFixed(2)}（分母 ${assessed} 镜，要求 ≥4）：${average >= 4 ? '✓ 达成' : '⚠ 未达成，待人眼核'}`)
  if (notAssessable > 0) console.log(`  ⚠ 另有 ${notAssessable} 镜判分器无法判定，未计入均分、也未验过`)
}
console.log(`冻结门第三层：${advisorySeen ? '✓ 未冻结锚被如实提醒' : '✗ 没看到提醒（锚未冻结却没吭声 = 洞还在）'}`)
console.log('判据⑧ 人眼终闸：产物已落盘，接下来由我逐个 Read 亲眼看——脚本报绿不算数。')
cleanup(0)
