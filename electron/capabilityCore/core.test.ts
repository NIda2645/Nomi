import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addProjectNodes,
  connectProjectNodes,
  createNamedProject,
  deleteProjectNodes,
  generateOnProject,
  listAllProjects,
  readProjectCanvas,
  referencesFromEdges,
  setProjectNodePrompt,
} from './core'
import { createDiskGateway, type PlanConfirmInfo, type ProjectGateway } from './gateway'

describe('referencesFromEdges（连参考边=喂参考图，headless 兜底）', () => {
  const snap = {
    nodes: [
      { id: 'a', kind: 'image', result: { url: 'nomi-local://a.png' } },
      { id: 'b', kind: 'image' },
      { id: 'c', kind: 'image', url: 'nomi-local://c.png' },
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'b', mode: 'reference', order: 1 },
      { id: 'e2', source: 'c', target: 'b', mode: 'character_ref', order: 0 },
    ],
    groups: [],
    selectedNodeIds: [],
  } as never
  it('收集指向目标节点的参考类入边的源资产，按 order 排', () => {
    expect(referencesFromEdges(snap, 'b')).toEqual(['nomi-local://c.png', 'nomi-local://a.png'])
  })
  it('无入边目标返回空', () => {
    expect(referencesFromEdges(snap, 'a')).toEqual([])
  })
  it('非参考类边（first_frame 等）不计入此兜底', () => {
    const s = { ...(snap as object), edges: [{ id: 'e', source: 'a', target: 'b', mode: 'first_frame', order: 0 }] } as never
    expect(referencesFromEdges(s, 'b')).toEqual([])
  })
})

const tempRoots: string[] = []
let mockedDocumentsRoot = ''
let mockedUserDataRoot = ''

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'documents') return mockedDocumentsRoot
      return mockedUserDataRoot
    },
    getAppPath: () => process.cwd(),
  },
}))

function makeTempDir(name = 'nomi-capcore-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name))
  tempRoots.push(dir)
  return dir
}

beforeEach(() => {
  mockedDocumentsRoot = makeTempDir('nomi-capcore-documents-')
  mockedUserDataRoot = makeTempDir('nomi-capcore-user-data-')
  delete process.env.NOMI_PROJECTS_DIR
})

afterEach(() => {
  delete process.env.NOMI_PROJECTS_DIR
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('capabilityCore/core (磁盘网关：直写 project.json)', () => {
  it('建项目 → 加节点 → 连线 → 改提示词 → 读画布，全程落盘且重读一致', async () => {
    const project = createNamedProject('能力核测试项目')
    expect(project.id).toBeTruthy()
    expect(listAllProjects().some((item) => item.id === project.id)).toBe(true)
    const gateway = createDiskGateway(project.id)

    const { ids } = await addProjectNodes(gateway, [
      { kind: 'text', prompt: '一句产品脚本' },
      { kind: 'image', title: '镜头 1' },
    ])
    expect(ids).toHaveLength(2)

    const connected = await connectProjectNodes(gateway, [{ source: ids[0], target: ids[1], mode: 'reference' }])
    expect(connected.edgeIds).toHaveLength(1)
    expect(connected.skipped).toHaveLength(0)

    const prompted = await setProjectNodePrompt(gateway, ids[1], '电影感写实，黄昏光线')
    expect(prompted.changed).toBe(true)

    // 重新读（从盘）—— 验证持久化往返一致。
    const canvas = await readProjectCanvas(createDiskGateway(project.id))
    expect(canvas.nodes).toHaveLength(2)
    expect(canvas.edges).toHaveLength(1)
    const shot = canvas.nodes.find((node) => node.id === ids[1])
    expect(shot?.prompt).toBe('电影感写实，黄昏光线')
  })

  it('方案门（Phase B）：≥2 节点弹门确认，批准落画布 / 拒绝不落回 cancelled / 单节点不弹', async () => {
    function mockGateway(planApproved: boolean) {
      const planCalls: PlanConfirmInfo[] = []
      let applyCount = 0
      const gateway: ProjectGateway = {
        readDoc: async () => ({ nodes: [], edges: [] }),
        apply: async () => { applyCount += 1 },
        confirmSpend: async () => null,
        confirmPlan: async (info) => { planCalls.push(info); return planApproved },
      }
      return { gateway, planCalls, getApplyCount: () => applyCount }
    }

    // 批准 → 落画布，方案门带对齐的 nodeCount/titles/projectId。
    const approved = mockGateway(true)
    const okRes = await addProjectNodes(approved.gateway, [{ kind: 'image', title: '镜 1' }, { kind: 'image', title: '镜 2' }], 'proj-1')
    expect(approved.planCalls).toHaveLength(1)
    expect(approved.planCalls[0]).toMatchObject({ nodeCount: 2, projectId: 'proj-1', titles: ['镜 1', '镜 2'] })
    expect(okRes.ids).toHaveLength(2)
    expect(okRes.cancelled).toBeUndefined()
    expect(approved.getApplyCount()).toBe(1)

    // 拒绝 → 不落画布（apply 零调用）、回 cancelled。
    const rejected = mockGateway(false)
    const noRes = await addProjectNodes(rejected.gateway, [{ kind: 'image' }, { kind: 'video' }], 'proj-1')
    expect(rejected.planCalls).toHaveLength(1)
    expect(noRes.cancelled).toBe(true)
    expect(noRes.ids).toEqual([])
    expect(rejected.getApplyCount()).toBe(0)

    // 单节点不算「方案」→ 不弹门，直落。
    const single = mockGateway(true)
    const oneRes = await addProjectNodes(single.gateway, [{ kind: 'image', title: '一张图' }], 'proj-1')
    expect(single.planCalls).toHaveLength(0)
    expect(oneRes.ids).toHaveLength(1)
  })

  it('删节点连带清边，落盘后边为空', async () => {
    const project = createNamedProject('删节点测试')
    const gateway = createDiskGateway(project.id)
    const { ids } = await addProjectNodes(gateway, [{ kind: 'image' }, { kind: 'video' }])
    await connectProjectNodes(gateway, [{ source: ids[0], target: ids[1] }])
    const removed = await deleteProjectNodes(gateway, [ids[0]])
    expect(removed.deleted).toEqual([ids[0]])
    const canvas = await readProjectCanvas(createDiskGateway(project.id))
    expect(canvas.nodes).toHaveLength(1)
    expect(canvas.edges).toHaveLength(0)
  })

  it('generate 构造正确请求体（注入 runTask 不打 vendor）并把结果落回节点', async () => {
    const project = createNamedProject('生成测试')
    const captured: Array<{ vendor: string; request: unknown }> = []
    const fakeRunTask = async (payload: { vendor: string; request: unknown }) => {
      captured.push(payload)
      return {
        id: 'task-xyz',
        status: 'succeeded',
        assets: [{ type: 'image', url: 'nomi-local://asset/p/img.png', providerUrl: 'https://cdn/img.png' }],
      }
    }

    const out = await generateOnProject(
      { projectId: project.id, intent: 'image', prompt: '一只赛博朋克猫', vendor: 'apimart', modelKey: 'seedream-4', references: ['https://cdn/ref.png'] },
      createDiskGateway(project.id),
      fakeRunTask,
    )

    expect(out.status).toBe('succeeded')
    expect(captured).toHaveLength(1)
    // 请求体：高层 TaskRequest，extras 带 modelKey/projectId/nodeId/referenceImages，kind 由 intent 推。
    const req = captured[0].request as { kind: string; prompt: string; extras: Record<string, unknown> }
    expect(captured[0].vendor).toBe('apimart')
    // ⚠️ 这条**曾经断言 text_to_image**——本用例明明传了 references，却把「参考图被丢掉」写成了规范，
    // 于是 bug 有测试保护、一直没人发现。真生成实测才暴露：喂「橘猫戴红围巾坐雪景窗台」的照片说
    // 「把围巾改成蓝色」，出来的是另一只白猫的插画（火山 Seedream 与 apimart 两条路都中招）。
    // 带参考图 = 改图，与 video 那支对称。
    expect(req.kind).toBe('image_edit')
    expect(req.prompt).toBe('一只赛博朋克猫')
    expect(req.extras.modelKey).toBe('seedream-4')
    expect(req.extras.projectId).toBe(project.id)
    expect(req.extras.nodeId).toBe(out.nodeId)
    expect(req.extras.referenceImages).toEqual(['https://cdn/ref.png'])

    // 结果落回节点：重读画布该节点 hasResult。
    const canvas = await readProjectCanvas(createDiskGateway(project.id))
    expect(canvas.nodes.find((node) => node.id === out.nodeId)?.hasResult).toBe(true)
  })

  it('generate：image + 没有参考图 → text_to_image（别反过来把纯文生也当改图）', async () => {
    const project = createNamedProject('纯文生图意图测试')
    let kind = ''
    await generateOnProject(
      { projectId: project.id, intent: 'image', prompt: '一只赛博朋克猫', vendor: 'apimart', modelKey: 'seedream-4' },
      createDiskGateway(project.id),
      async (payload) => {
        kind = (payload.request as { kind: string }).kind
        return { id: 't', status: 'succeeded', assets: [] }
      },
    )
    expect(kind).toBe('text_to_image')
  })

  it('generate：video + 有参考图 → image_to_video', async () => {
    const project = createNamedProject('视频意图测试')
    let kind = ''
    await generateOnProject(
      { projectId: project.id, intent: 'video', prompt: '镜头推进', vendor: 'apimart', modelKey: 'seedance', references: ['https://cdn/first.png'] },
      createDiskGateway(project.id),
      async (payload) => {
        kind = (payload.request as { kind: string }).kind
        return { id: 't', status: 'succeeded', assets: [] }
      },
    )
    expect(kind).toBe('image_to_video')
  })

  // 病根回归：轮询到点旧版只 break，result 保持 queued 且不带 error —— 调用方（MCP/agent/CLI）
  // 拿到一个**永远非终态**的结果，等同「一直转圈但没人告诉你出了什么事」。到点必须落终态。
  it('generate：轮询超时必须落 failed + 诚实原因，不能静默返回 queued', async () => {
    const project = createNamedProject('轮询超时测试')
    const previous = process.env.NOMI_POLL_TIMEOUT_MS
    process.env.NOMI_POLL_TIMEOUT_MS = '1'
    try {
      let polls = 0
      const out = await generateOnProject(
        { projectId: project.id, intent: 'image', prompt: '一只猫', vendor: 'apimart', modelKey: 'seedream-4' },
        createDiskGateway(project.id),
        async () => ({ id: 'task-stuck', status: 'queued', assets: [] }),
        async () => {
          polls += 1
          return { result: { id: 'task-stuck', status: 'queued', assets: [] } }
        },
      )
      expect(polls).toBeGreaterThan(0)
      expect(out.status).toBe('failed')
    } finally {
      if (previous === undefined) delete process.env.NOMI_POLL_TIMEOUT_MS
      else process.env.NOMI_POLL_TIMEOUT_MS = previous
    }
  })

  it('未知项目抛清晰错误', async () => {
    await expect(readProjectCanvas(createDiskGateway('ghost-id'))).rejects.toThrow(/项目不存在/)
  })

  // ── W1 审片环 hook（方案 T5）：默认不传 makeVerifyDeps = 行为逐字节不变；传了才判分。 ──

  it('审片环回归：不传 makeVerifyDeps → 返回对象逐字节同今天（无 verify 字段、键集不变）', async () => {
    const project = createNamedProject('审片回归-无deps')
    const out = await generateOnProject(
      { projectId: project.id, intent: 'image', prompt: '一只猫', vendor: 'apimart', modelKey: 'seedream-4' },
      createDiskGateway(project.id),
      async () => ({ id: 't', status: 'succeeded', assets: [{ type: 'image', url: 'nomi-local://a.png' }] }),
    )
    // 键集恰为 { nodeId, status, assets }（text 分支不触发；**不含 verify**）——默认路径与旧版一致。
    expect(Object.keys(out).sort()).toEqual(['assets', 'nodeId', 'status'])
    expect('verify' in out).toBe(false)
    expect(out.status).toBe('succeeded')
  })

  it('审片环回归：传了 makeVerifyDeps 但生成失败 → 不判分、无 verify（审片只在成功产物上跑）', async () => {
    const project = createNamedProject('审片回归-失败不判')
    let depsMade = false
    await expect(generateOnProject(
      {
        projectId: project.id, intent: 'image', prompt: '一只猫', vendor: 'apimart', modelKey: 'seedream-4',
        makeVerifyDeps: () => { depsMade = true; return stubVerifyDeps('{"scores":{"identity":1}}') },
      },
      createDiskGateway(project.id),
      async () => { throw new Error('vendor down') },
    )).rejects.toThrow(/vendor down/)
    expect(depsMade).toBe(false) // 生成失败 → 审片分支根本不进
  })

  it('审片环：传 stub makeVerifyDeps（judge 低分）→ 返回带 verify.flagged 红标 + retries', async () => {
    const project = createNamedProject('审片-低分红标')
    const out = await generateOnProject(
      {
        projectId: project.id, intent: 'image', prompt: '小周站在冰柜前', vendor: 'apimart', modelKey: 'seedream-4',
        // judge 恒返身份 1 档 → 触发重试；重试后仍 1 档（stub 不变）→ K=2 用尽 → 红标。
        makeVerifyDeps: () => stubVerifyDeps('{"scores":{"identity":1,"composition":5,"continuity":5},"reason":"张冠李戴"}'),
      },
      createDiskGateway(project.id),
      async () => ({ id: 't', status: 'succeeded', assets: [{ type: 'image', url: 'nomi-local://gen.png' }] }),
    )
    expect(out.verify).toBeDefined()
    expect(out.verify?.evaluated).toBe(true)
    expect(out.verify?.passed).toBe(false)
    expect(out.verify?.retries).toBe(2) // K≤2 封顶
    expect(out.verify?.flagged.map((f) => f.dimension)).toEqual(['identity'])
  })

  it('审片环：judge 首发即高分 → verify.passed、零重试、无红标', async () => {
    const project = createNamedProject('审片-一次过')
    const out = await generateOnProject(
      {
        projectId: project.id, intent: 'image', prompt: '小周', vendor: 'apimart', modelKey: 'seedream-4',
        makeVerifyDeps: () => stubVerifyDeps('{"scores":{"identity":5,"composition":5,"continuity":5},"reason":"好"}'),
      },
      createDiskGateway(project.id),
      async () => ({ id: 't', status: 'succeeded', assets: [{ type: 'image', url: 'nomi-local://gen.png' }] }),
    )
    expect(out.verify?.passed).toBe(true)
    expect(out.verify?.retries).toBe(0)
    expect(out.verify?.flagged).toEqual([])
  })
})

/** 审片 deps 桩：judge 恒返给定判决 JSON；regenerate 返新图 url；视觉恒可用；不真打 vendor。 */
function stubVerifyDeps(verdictJson: string): import('./shotVerifyOrchestrate').ShotVerifyDeps {
  let regen = 0
  return {
    visionAvailable: () => true,
    extractFrame: async (u) => u,
    judge: async () => verdictJson,
    regenerate: async () => { regen += 1; return { frameSourceUrl: `nomi-local://re-${regen}.png`, isVideo: false } },
  }
}
