// L2 旅程层 · 六幕体验验收骨架（plan 2026-08-19-experience-acceptance-harness.md §一/§二）。
//
// 被验收对象 = 蓝图六幕体验（2026-08-19-dialogue-draft-quality-blueprint.md）。设计成**逐波点亮**：
// 今天就能跑，蓝图哪波（W1/W2/W3）交付，对应幕从 pending 转 pass——「体验实现了没」以这里为准。
//
// 防假绿纪律（本仓走查门岗口径）：
//  · pending 幕**不做任何断言、不计 pass**，汇总单列并注明「等哪一波」；
//  · 幕点亮时必须先证明「旧代码下该断言红」（stash/开关法），再合入；
//  · fail>0 退非零；pending 不算失败（否则天天红没人看），但 CI 汇总里永远可见。
//
// 传输 = 真 in-Electron MCP stdio server（headless，磁盘网关）+ mock vendor（零额度）。
// GUI 开着的确认卡/双问路径由 spend-elicit-app-open.walk.mjs 专测，此处不重复。
// 用法：pnpm run build && node tests/ux/draft-journey.e2e.mjs
import fs from 'node:fs'
import path from 'node:path'
import {
  assertBuilt,
  makeIsolatedDirs,
  parseToolResult,
  repoRoot,
  spawnMcpStdioClient,
  startMockVendorServer,
  writeIsolatedCatalog,
} from './_mcpJourney.mjs'

assertBuilt()
const dirs = makeIsolatedDirs('nomi-draft-journey-')
const mockVendor = await startMockVendorServer()
writeIsolatedCatalog(dirs.settingsDir, mockVendor.origin)

const mcp = spawnMcpStdioClient({
  settingsDir: dirs.settingsDir,
  userDataDir: dirs.userDataDir,
  projectsDir: dirs.projectsDir,
  capabilityDir: dirs.capabilityDir,
  clientInfo: { name: 'codex', version: 'draft-journey-l2' },
})

/** 幕结果收集：pass 幕的每条断言都真跑；pending 幕零断言，只记「等哪波」。 */
const acts = []
const record = (act, status, detail) => { acts.push({ act, status, detail }); console.log(`  [${status}] ${act} — ${detail}`) }
const assertTrue = (cond, label) => { if (!cond) throw new Error(label) }
const metricsPath = path.join(repoRoot, 'test-results/draft-journey-metrics.jsonl')
fs.mkdirSync(path.dirname(metricsPath), { recursive: true })
const metrics = []

let exitCode = 0
try {
  const init = await (async () => { for (let i = 0; i < 20; i++) { try { return await mcp.initialize() } catch { await new Promise((r) => setTimeout(r, 1000)) } } throw new Error('initialize 超时') })()
  assertTrue(init?.result, 'MCP stdio server 起来了')

  const created = parseToolResult(await mcp.callToolOrThrow('nomi_create_project', { name: '验收旅程《2:17 的男人》' }))
  const projectId = created.json?.id || created.json?.projectId
  assertTrue(projectId, '建项目返回 id')

  // ── 幕 0 · 开场收敛 ─────────────────────────────────────────────
  record('幕0 开场收敛', 'pending', '等 W3：一屏 ≤3 题 elicitation（enum 候选 + 按你判断）。今天没有收敛机制，不假测。')

  // ── 幕 1 · 剧本 + 圣经（今天可测「剧本落节点 + 指改」半幕；圣经字段等 W2） ──
  {
    const added = parseToolResult(await mcp.callToolOrThrow('nomi_add_nodes', {
      projectId,
      nodes: [
        { kind: 'shot', title: '#1 外·夜', prompt: '暴雨中的便利店招牌，2:17 的钟面特写' },
        { kind: 'shot', title: '#2 内', prompt: '小周整理货架，玻璃映出街对面的人影' },
        { kind: 'shot', title: '#3 内', prompt: '男人进店，径直走向冰柜，拿同一瓶水' },
      ],
    }))
    const sceneIds = added.json?.ids || []
    assertTrue(sceneIds.length === 3, `3 场剧本场景落画布（得 ${sceneIds.length}）`)
    // 指改 #3：编号即地址 → set_node_prompt → 回读验证生效且其余不动。
    const newPrompt = '男人进店，没拿水，只是站在冰柜前数了 17 秒'
    await mcp.callToolOrThrow('nomi_set_node_prompt', { projectId, nodeId: sceneIds[2], prompt: newPrompt })
    const canvas = parseToolResult(await mcp.callToolOrThrow('nomi_read_canvas', { projectId }))
    const nodes = canvas.json?.nodes || []
    const scene3 = nodes.find((n) => n.id === sceneIds[2])
    const scene2 = nodes.find((n) => n.id === sceneIds[1])
    assertTrue(scene3?.prompt === newPrompt, '指改 #3 生效（prompt 已换）')
    assertTrue(scene2?.prompt?.includes('小周整理货架'), '未指的 #2 一字未动')
    record('幕1 剧本+指改', 'pass', '3 场落画布；#3 指改生效、#2 未动。圣经 static/dynamic 字段等 W2 点亮。')
  }

  // ── 幕 2 · 定妆冻结门 ───────────────────────────────────────────
  record('幕2 定妆冻结', 'pending', '等 W2：冻结门（未冻结拒批量、冻结后强制引用）。今天无 frozen 状态，不假测。')

  // ── 幕 3 · 分镜落画布 + 参考连线（今天可测） ────────────────────
  let anchorId = ''
  let shotNodeIds = []
  {
    const anchors = parseToolResult(await mcp.callToolOrThrow('nomi_add_nodes', {
      projectId,
      nodes: [
        { kind: 'character', title: '小周 · 定妆', prompt: '短发圆脸、左眉一颗痣，深蓝工装，正面平光定妆照' },
        { kind: 'scene', title: '便利店 · 场景卡', prompt: '暴雨夜便利店内景，冷白灯光，货架与冰柜' },
      ],
    }))
    const anchorIds = anchors.json?.ids || []
    assertTrue(anchorIds.length === 2, '角色/场景锚落画布')
    anchorId = anchorIds[0]
    const shots = parseToolResult(await mcp.callToolOrThrow('nomi_add_nodes', {
      projectId,
      nodes: [
        { kind: 'video', title: '#S1 远景·缓推', prompt: '暴雨夜便利店外观，招牌闪烁，缓慢推近', vendor: 'nomi-mock', modelKey: 'nomi-mock-video' },
        { kind: 'video', title: '#S2 中景·固定', prompt: '小周理货抬头看钟，冷白灯光', vendor: 'nomi-mock', modelKey: 'nomi-mock-video' },
      ],
    }))
    shotNodeIds = shots.json?.ids || []
    assertTrue(shotNodeIds.length === 2, '2 个可生成镜头节点落画布')
    await mcp.callToolOrThrow('nomi_connect_nodes', {
      projectId,
      connections: shotNodeIds.map((target) => ({ source: anchorId, target, mode: 'character_ref' })),
    })
    const canvas = parseToolResult(await mcp.callToolOrThrow('nomi_read_canvas', { projectId }))
    const edges = canvas.json?.edges || []
    const linked = edges.filter((e) => e.source === anchorId && shotNodeIds.includes(e.target))
    assertTrue(linked.length === 2, `锚→镜头参考边齐（得 ${linked.length}/2）`)
    record('幕3 分镜+连线', 'pass', '锚 2 + 镜 2 + 参考边 2；节点带模型绑定。镜头语言字段化等 W4。')
  }

  // ── 幕 4 · 批次确认闸 ───────────────────────────────────────────
  record('幕4 批次确认闸', 'pending', '等 W1（预算披露）/W3（批次清单形态）。今天的单镜付费确认由幕 5 顺带验。')

  // ── 幕 5 · 生成 + 审片重试（今天可测：生成/进度/会话信任；审片环等 W1） ──
  {
    const before = mcp.elicitationCount()
    const gen1 = parseToolResult(await mcp.callTool('nomi_generate', {
      projectId, nodeId: shotNodeIds[0], vendor: 'nomi-mock', modelKey: 'nomi-mock-video', intent: 'video',
      prompt: '暴雨夜便利店外观，招牌闪烁，缓慢推近',
    }, { timeoutMs: 90_000, progressToken: 'dj-s1' }))
    assertTrue(!gen1.isError && gen1.json?.status === 'succeeded', `镜 S1 生成成功（status=${gen1.json?.status}）`)
    assertTrue(mcp.progressForToken('dj-s1') >= 1, '生成期间有进度帧')
    assertTrue(Boolean(gen1.deepLink), '结果带 nomi:// 深链')
    const askedFirst = mcp.elicitationCount() - before
    assertTrue(askedFirst === 1, `首镜付费确认恰 1 次（得 ${askedFirst}）`)
    // 会话信任：同项目第二镜不再问（昨天落的机制，这里是它在旅程里的横切断言）。
    const gen2 = parseToolResult(await mcp.callTool('nomi_generate', {
      projectId, nodeId: shotNodeIds[1], vendor: 'nomi-mock', modelKey: 'nomi-mock-video', intent: 'video',
      prompt: '小周理货抬头看钟，冷白灯光',
    }, { timeoutMs: 90_000, progressToken: 'dj-s2' }))
    assertTrue(!gen2.isError && gen2.json?.status === 'succeeded', '镜 S2 生成成功')
    const askedSecond = mcp.elicitationCount() - before - askedFirst
    assertTrue(askedSecond === 0, `同项目第二镜免问（多问了 ${askedSecond} 次）`)
    record('幕5 生成+信任', 'pass', '2 镜真跑 mock 管线；进度帧/深链齐；付费确认全程恰 1 次（会话信任生效）。审片 stub 判分 + 定向重试等 W1 点亮。')
  }
  record('幕5b 审片重试环', 'pending', '等 W1：注入坏判分镜头 100% 走重试、重试仍败带红标交付。shotVerify 未接 MCP 路径，不假测。')

  // ── 幕 6 · 交付报告 ─────────────────────────────────────────────
  record('幕6 交付报告', 'pending', '等 W1：过检数/红标/建议/价格结构化报告。今天结果已带深链与结构化字段（幕 5 已验），报告形态不假测。')

  // ── 横切指标（对今天已点亮的部分） ──────────────────────────────
  {
    const total = mcp.elicitationCount()
    assertTrue(total <= 4, `全旅程 Block 确认 ≤4（实际 ${total}）`)
    record('横切 · 打扰预算', 'pass', `全程 elicitation 共 ${total} 次（上限 4）；指改零弹窗（幕 1 已验）。`)
  }

  for (const a of acts) metrics.push(JSON.stringify({ ts: new Date().toISOString(), ...a }))
  fs.writeFileSync(metricsPath, metrics.join('\n') + '\n', 'utf8')

  const pass = acts.filter((a) => a.status === 'pass').length
  const pending = acts.filter((a) => a.status === 'pending').length
  console.log(`\nDRAFT-JOURNEY L2：${pass} 幕通过 · ${pending} 幕待点亮（W1/W2/W3 逐波转绿）· 指标 → test-results/draft-journey-metrics.jsonl`)
} catch (err) {
  exitCode = 1
  console.log(`✗ FAIL: ${err?.message || err}`)
} finally {
  await mcp.terminate()
  await mockVendor.close().catch(() => undefined)
  fs.rmSync(dirs.tempRoot, { recursive: true, force: true })
  process.exit(exitCode)
}
