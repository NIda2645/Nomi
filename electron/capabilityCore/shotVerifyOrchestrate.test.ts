import { describe, expect, it } from 'vitest'

import {
  verifyAndMaybeRetry,
  buildRetryDirective,
  type ShotVerifyDeps,
  type ShotVerifyShot,
} from './shotVerifyOrchestrate'
import { deviationsFromVerdict } from './shotVerifyCore'

// L1 机制层（harness §一）：审片环分支矩阵——judge 桩注入可控判分，断言
// 判分低→定向重试、K≤2 封顶、仍败带红标、首镜不评 continuity、视觉不可用整体跳过。
// 全 DI，不碰 electron、不打 vendor。

const baseShot: ShotVerifyShot = {
  shotNodeId: 'shot-1',
  shotTitle: '#1 外·夜',
  shotPrompt: '暴雨夜便利店外观，招牌闪烁',
  anchorDescriptions: ['短发圆脸、深蓝工装'],
  frameSourceUrl: 'nomi-local://gen-0.png',
  isVideo: false,
}

/** judge 桩：按调用次数依次返回给定判决 JSON（用光后重复最后一个）。记录 regenerate 调用。 */
function makeDeps(opts: {
  verdicts: string[]
  visionAvailable?: boolean
  regenerate?: ShotVerifyDeps['regenerate']
  extractFrame?: ShotVerifyDeps['extractFrame']
}): { deps: ShotVerifyDeps; judgeCalls: string[]; regenCalls: Array<{ nodeId: string; directive: string }> } {
  const judgeCalls: string[] = []
  const regenCalls: Array<{ nodeId: string; directive: string }> = []
  let judgeIdx = 0
  const deps: ShotVerifyDeps = {
    visionAvailable: () => opts.visionAvailable ?? true,
    extractFrame: opts.extractFrame ?? (async (u) => u),
    judge: async (prompt) => {
      judgeCalls.push(prompt)
      const v = opts.verdicts[Math.min(judgeIdx, opts.verdicts.length - 1)]
      judgeIdx += 1
      return v
    },
    regenerate: opts.regenerate ?? (async (nodeId, directive) => {
      regenCalls.push({ nodeId, directive })
      return { frameSourceUrl: `nomi-local://gen-${regenCalls.length}.png`, isVideo: false }
    }),
  }
  return { deps, judgeCalls, regenCalls }
}

const PASS = '{"scores":{"identity":5,"composition":5,"continuity":5},"reason":"好"}'
const BAD_IDENTITY = '{"scores":{"identity":1,"composition":5,"continuity":5},"reason":"张冠李戴"}'

describe('verifyAndMaybeRetry（审片环：判分→定向重试→红标）', () => {
  it('首发即过 → passed、零重试、无红标', async () => {
    const { deps, regenCalls } = makeDeps({ verdicts: [PASS] })
    const out = await verifyAndMaybeRetry({ shot: baseShot }, deps)
    expect(out.evaluated).toBe(true)
    expect(out.passed).toBe(true)
    expect(out.retries).toBe(0)
    expect(out.flagged).toEqual([])
    expect(out.suggestion).toBeNull()
    expect(regenCalls).toHaveLength(0) // 过了就不该重生
  })

  it('判分低 → 触发定向重试；重试后达标 → passed、retries=1、无红标', async () => {
    const { deps, regenCalls } = makeDeps({ verdicts: [BAD_IDENTITY, PASS] })
    const out = await verifyAndMaybeRetry({ shot: baseShot }, deps)
    expect(regenCalls).toHaveLength(1) // 坏判分 → 重生一次
    expect(out.retries).toBe(1)
    expect(out.passed).toBe(true)
    expect(out.flagged).toEqual([])
  })

  it('始终不过 → 重试**恰好** K=2 次封顶、仍败带红标 + 建议', async () => {
    const { deps, regenCalls } = makeDeps({ verdicts: [BAD_IDENTITY] }) // 每次都坏
    const out = await verifyAndMaybeRetry({ shot: baseShot, maxRetries: 2 }, deps)
    expect(regenCalls).toHaveLength(2) // K≤2 封顶：不会第三次重生
    expect(out.retries).toBe(2)
    expect(out.passed).toBe(false)
    expect(out.flagged.map((f) => f.dimension)).toEqual(['identity'])
    expect(out.flagged[0].score).toBe(1)
    expect(out.suggestion).toContain('身份')
  })

  it('maxRetries 传 5 也被硬封顶到 2（配 grant maxAttemptsPerNode=3）', async () => {
    const { deps, regenCalls } = makeDeps({ verdicts: [BAD_IDENTITY] })
    const out = await verifyAndMaybeRetry({ shot: baseShot, maxRetries: 5 }, deps)
    expect(regenCalls).toHaveLength(2)
    expect(out.retries).toBe(2)
  })

  it('视觉不可用 → 整体跳过判分（evaluated:false、不重试、不红标）', async () => {
    const { deps, judgeCalls, regenCalls } = makeDeps({ verdicts: [BAD_IDENTITY], visionAvailable: false })
    const out = await verifyAndMaybeRetry({ shot: baseShot }, deps)
    expect(out.evaluated).toBe(false)
    expect(out.passed).toBe(false) // skipped ≠ passed：没判过不自称通过
    expect(judgeCalls).toHaveLength(0)
    expect(regenCalls).toHaveLength(0)
  })

  it('首次判分失败（取帧/解析）→ 跳过判分，不误报为过也不红标', async () => {
    const { deps, regenCalls } = makeDeps({
      verdicts: ['完全不是 JSON'], // parse 抛 → judgeOnce 返 null
    })
    const out = await verifyAndMaybeRetry({ shot: baseShot }, deps)
    expect(out.evaluated).toBe(false)
    expect(regenCalls).toHaveLength(0)
  })

  it('视频镜：extractFrame 被调，抽出的帧喂 judge', async () => {
    let extracted = ''
    const { deps } = makeDeps({
      verdicts: [PASS],
      extractFrame: async (videoUrl) => { extracted = `${videoUrl}#frame`; return extracted },
    })
    const out = await verifyAndMaybeRetry({ shot: { ...baseShot, frameSourceUrl: 'nomi-local://clip.mp4', isVideo: true } }, deps)
    expect(extracted).toBe('nomi-local://clip.mp4#frame')
    expect(out.passed).toBe(true)
  })

  it('重试自身失败（regenerate 抛错）→ 用当前判决收尾、红标基于最后成功判分，不阻断', async () => {
    const { deps } = makeDeps({
      verdicts: [BAD_IDENTITY],
      regenerate: async () => { throw new Error('vendor 429') },
    })
    const out = await verifyAndMaybeRetry({ shot: baseShot }, deps)
    expect(out.evaluated).toBe(true)
    expect(out.retries).toBe(0) // 一次都没成功重生
    expect(out.passed).toBe(false)
    expect(out.flagged.map((f) => f.dimension)).toEqual(['identity'])
  })

  it('首镜（无前镜）判决即便 continuity 低也不进红标（activeDimensions 过滤）', async () => {
    const { deps } = makeDeps({
      verdicts: ['{"scores":{"identity":5,"composition":5,"continuity":1},"reason":"乱给的连贯低分"}'],
    })
    const out = await verifyAndMaybeRetry({ shot: baseShot }, deps) // baseShot 无 previousShotPrompt
    expect(out.passed).toBe(true) // continuity 首镜不评
    expect(out.scores.continuity).toBeUndefined() // 该评轴不含 continuity
    expect(out.flagged).toEqual([])
  })
})

// L3 真额度验收抓出的韧性缺陷（2026-08-19）：判分模型端点连续 500/挂起时，判分把整个 tools/call
// 拖到 300s 客户端超时 → 生成结果丢给超时错误。修：判分总时长硬界——超界/抛错 → skipped(reason)，
// 生成结果照常返回；判分失败**绝不**触发 regenerate（重试只对「真拿到低分判决」的镜头）。
describe('verifyAndMaybeRetry 总时长硬界（判分失败绝不拖垮生成）', () => {
  it('judge 永不 resolve（挂起）→ 硬界内返回 skipped(reason)、不重试、不误报为过', async () => {
    const regenCalls: Array<{ nodeId: string; directive: string }> = []
    const deps: ShotVerifyDeps = {
      visionAvailable: () => true,
      extractFrame: async (u) => u,
      judge: () => new Promise<string>(() => {}), // 永不 resolve（模拟端点挂死）
      regenerate: async (nodeId, directive) => {
        regenCalls.push({ nodeId, directive })
        return { frameSourceUrl: 'nomi-local://x.png', isVideo: false }
      },
    }
    const t0 = Date.now()
    const out = await verifyAndMaybeRetry({ shot: baseShot, deadlineMs: 40 }, deps)
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(2000) // 绝不拖到 300s——硬界内立即返回
    expect(out.evaluated).toBe(false)
    expect(out.skipped).toBe(true)
    expect(typeof out.reason === 'string' && out.reason!.length > 0).toBe(true) // 人话原因
    expect(out.passed).toBe(false) // skipped ≠ passed：没判过不自称通过（生成照常交付）
    expect(regenCalls).toHaveLength(0) // 判分失败绝不触发 regenerate
  })

  it('judge 抛错 → skipped(reason) 且 regenerate 未被调（失败≠低分）', async () => {
    const regenCalls: Array<{ nodeId: string }> = []
    const deps: ShotVerifyDeps = {
      visionAvailable: () => true,
      extractFrame: async (u) => u,
      judge: async () => { throw new Error('[vendor-http] 500 ×3') }, // L3 真实现场
      regenerate: async (nodeId) => { regenCalls.push({ nodeId }); return { frameSourceUrl: 'x', isVideo: false } },
    }
    const out = await verifyAndMaybeRetry({ shot: baseShot }, deps)
    expect(out.evaluated).toBe(false)
    expect(out.skipped).toBe(true)
    expect(out.reason).toBeTruthy()
    expect(regenCalls).toHaveLength(0) // ★判分失败绝不重生
  })

  it('重试过程中 judge 挂起 → 硬界内用「首发那次成功判决」收尾、不无限等', async () => {
    // 首判低分（触发重试）→ 重生成功 → 重生后判分挂起 → 硬界应让整体在界内结束，不卡死。
    let judgeIdx = 0
    const deps: ShotVerifyDeps = {
      visionAvailable: () => true,
      extractFrame: async (u) => u,
      judge: async () => {
        judgeIdx += 1
        if (judgeIdx === 1) return BAD_IDENTITY // 首判低 → 触发重试
        return await new Promise<string>(() => {}) // 重生后判分挂死
      },
      regenerate: async () => ({ frameSourceUrl: 'nomi-local://gen-1.png', isVideo: false }),
    }
    const t0 = Date.now()
    const out = await verifyAndMaybeRetry({ shot: baseShot, deadlineMs: 40 }, deps)
    expect(Date.now() - t0).toBeLessThan(2000)
    // 硬界触发：整体判分超时 → skipped（生成照常返回），不是卡死也不是误报为过
    expect(out.evaluated).toBe(false)
    expect(out.skipped).toBe(true)
  })

  it('judge 在界内正常返回 → 不受硬界影响（正常通过路径不回退）', async () => {
    const { deps } = makeDeps({ verdicts: [PASS] })
    const out = await verifyAndMaybeRetry({ shot: baseShot, deadlineMs: 5000 }, deps)
    expect(out.evaluated).toBe(true)
    expect(out.skipped).toBeFalsy()
    expect(out.passed).toBe(true)
  })
})

describe('buildRetryDirective（定向重试指令：保背景、不含角色名）', () => {
  const ctxShot = { shotNodeId: 's', shotTitle: '#1', shotPrompt: 'p', anchorDescriptions: ['短发圆脸小周'] }
  it('身份轴低 → directive 含「保持…背景…不变」+「修正主体身份」，不含角色名/锚原文', () => {
    const devs = deviationsFromVerdict(ctxShot, { scores: { identity: 1, composition: 5, continuity: 5 }, reason: 'x' })
    const dir = buildRetryDirective(devs)
    expect(dir).toContain('保持')
    expect(dir).toContain('背景')
    expect(dir).toContain('主体身份')
    // 污染词铁律（W4）：directive 只约束「保什么/修哪轴」，不复述具体设定值/角色名。
    expect(dir).not.toContain('小周')
    expect(dir).not.toContain('短发圆脸')
  })
  it('构图轴低 → 修正机位与景别，且不再把「构图」列进保持项', () => {
    const devs = deviationsFromVerdict(ctxShot, { scores: { identity: 5, composition: 1, continuity: 5 }, reason: 'x' })
    const dir = buildRetryDirective(devs)
    expect(dir).toContain('机位')
    // composition 被判低，就不该出现在「保持…构图…不变」里（否则自相矛盾）。
    expect(dir).not.toMatch(/保持[^。]*构图[^。]*不变/)
  })
})
