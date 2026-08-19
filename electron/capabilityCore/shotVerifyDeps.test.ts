import { describe, expect, it } from 'vitest'

import { makeShotVerifyDeps, type ShotVerifyDepsContext } from './shotVerifyDeps'

// L3 真额度验收抓出的韧性缺陷（2026-08-19）：judge 单点依赖「目录第一个 text 模型」太脆——
// 用户真实目录里它是经 code.newcli.com 中转的 claude-fable-5，该端点对这种 chat 调用连续 500。
// 修：judge 候选序列（目录里 enabled+key ok 的 text 模型，保持既有排序），首调失败 → 顺移下一候选
// （至多试 3 个），成功者进程内缓存为本次会话判分模型；全部失败 → 抛错（上层 orchestrate 收成 skipped）。

const ctx: ShotVerifyDepsContext = {
  projectId: 'p1',
  grantId: 'g1',
  nodeId: 'shot-1',
  vendor: 'v-gen',
  modelKey: 'm-gen',
  generationKind: 'image_edit',
  nodeKind: 'image',
  basePrompt: '暴雨夜便利店',
  params: {},
  references: [],
}

const JUDGE_JSON = '{"scores":{"identity":5,"composition":5,"continuity":5},"reason":"好"}'

describe('makeShotVerifyDeps · judge 候选回退（单点→候选序列）', () => {
  it('第一个候选传输失败 → 顺移第二个成功；成功者进程内缓存（第二次判分不再试第一个）', async () => {
    const candidates = [
      { vendor: 'bad-vendor', modelKey: 'claude-fable-5' }, // 首选：连续 500
      { vendor: 'good-vendor', modelKey: 'gpt-5.5' }, // 次选：成功
    ]
    const attemptedVendors: string[] = []
    const runTaskFn = async (payload: { vendor: string; request: unknown }) => {
      // 只有 judge 调用打到这里（generationKind 不是 image_to_prompt）。记录尝试的 vendor。
      const req = payload.request as { kind?: string }
      if (req.kind === 'image_to_prompt') {
        attemptedVendors.push(payload.vendor)
        if (payload.vendor === 'bad-vendor') throw new Error('[vendor-http] 500 ×3')
        return { assets: [], raw: { choices: [{ message: { content: JUDGE_JSON } }] } }
      }
      return { assets: [{ url: 'nomi-local://regen.png', type: 'image' }] }
    }
    const deps = makeShotVerifyDeps(ctx, { runTaskFn, listJudgeCandidates: () => candidates })

    expect(deps.visionAvailable()).toBe(true) // 有候选 → 视觉可用

    const out1 = await deps.judge('prompt-1', 'nomi-local://frame.png')
    expect(out1).toContain('identity') // 拿到判决文本
    expect(attemptedVendors).toEqual(['bad-vendor', 'good-vendor']) // 首选失败后顺移次选

    // 第二次判分：缓存生效 → 直接用 good-vendor，不再试 bad-vendor
    attemptedVendors.length = 0
    const out2 = await deps.judge('prompt-2', 'nomi-local://frame2.png')
    expect(out2).toContain('identity')
    expect(attemptedVendors).toEqual(['good-vendor']) // ★缓存生效：不再试已失败的首选
  })

  it('至多试 3 个候选：前 3 个都失败 → 抛错（不试第 4 个）；orchestrate 上层收成 skipped', async () => {
    const candidates = [
      { vendor: 'c1', modelKey: 'm1' },
      { vendor: 'c2', modelKey: 'm2' },
      { vendor: 'c3', modelKey: 'm3' },
      { vendor: 'c4', modelKey: 'm4' }, // 不该被试到
    ]
    const attempted: string[] = []
    const runTaskFn = async (payload: { vendor: string; request: unknown }) => {
      attempted.push(payload.vendor)
      throw new Error('[vendor-http] 500 ×3')
    }
    const deps = makeShotVerifyDeps(ctx, { runTaskFn, listJudgeCandidates: () => candidates })
    await expect(deps.judge('p', 'f')).rejects.toThrow()
    expect(attempted).toEqual(['c1', 'c2', 'c3']) // 至多 3 个，不碰第 4 个
  })

  it('无任何候选 → visionAvailable=false（整体跳过判分，仅生成不报错）', () => {
    const deps = makeShotVerifyDeps(ctx, { runTaskFn: async () => ({ assets: [] }), listJudgeCandidates: () => [] })
    expect(deps.visionAvailable()).toBe(false)
  })

  it('首选即成功 → 只试首选（不无谓顺移）', async () => {
    const candidates = [
      { vendor: 'first', modelKey: 'm1' },
      { vendor: 'second', modelKey: 'm2' },
    ]
    const attempted: string[] = []
    const runTaskFn = async (payload: { vendor: string; request: unknown }) => {
      attempted.push(payload.vendor)
      return { assets: [], raw: { choices: [{ message: { content: JUDGE_JSON } }] } }
    }
    const deps = makeShotVerifyDeps(ctx, { runTaskFn, listJudgeCandidates: () => candidates })
    await deps.judge('p', 'f')
    expect(attempted).toEqual(['first']) // 首选成功就停
  })
})
