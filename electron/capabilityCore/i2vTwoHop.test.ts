import { describe, expect, it } from 'vitest'
import { composeShotPrompt, runFirstHop, shouldRenderLastFrame, shouldUseTwoHop, type I2vTwoHopDeps } from './i2vTwoHop'

// W2 §3 · I2V 两跳（参考图 → 首帧 I2I → I2V）。纯编排单测：注入 renderFirstFrame / verifyFirstFrame 桩，
// 不打 vendor、不碰 electron。核心不变量：
//  · 判据 derive（video + 有参考 + 模型真读得到首帧键）——三缺一即一跳；
//  · 首帧失败/无产出 → 降级一跳 + 人话 reason，**绝不让整个生成失败**；
//  · 首帧判分不过检/判分自身出错 → **照常推进**（W1 韧性铁律：判分是增益不是关卡）。

const okFrame: I2vTwoHopDeps = { renderFirstFrame: async () => ({ url: 'nomi-local://asset/p/ff.png', nodeId: 'kf-1' }) }

describe('shouldUseTwoHop（该不该走两跳 · 纯判据）', () => {
  const base = { intent: 'video', references: ['nomi-local://a.png'], videoBodyKeys: ['first_frame_url', 'prompt'] }

  it('video + 有参考 + 模型读 first_frame_url → 走两跳', () => {
    expect(shouldUseTwoHop(base)).toBe(true)
  })

  it('模型 video body 不读任何首帧键 → 不走两跳（硬塞也会被护栏拦，不如老实一跳）', () => {
    expect(shouldUseTwoHop({ ...base, videoBodyKeys: ['prompt', 'duration', 'reference_image_urls'] })).toBe(false)
  })

  it('无锚参考 → 不走两跳（T2V 兜底，蓝图幕 2）', () => {
    expect(shouldUseTwoHop({ ...base, references: [] })).toBe(false)
  })

  it('image intent → 不走两跳（图片镜没有「首帧」概念）', () => {
    expect(shouldUseTwoHop({ ...base, intent: 'image' })).toBe(false)
  })

  it('首帧键别名（start_image / image_url）也认（derive 不 hardcode 单一键名）', () => {
    expect(shouldUseTwoHop({ ...base, videoBodyKeys: ['start_image'] })).toBe(true)
    expect(shouldUseTwoHop({ ...base, videoBodyKeys: ['image_url'] })).toBe(true)
  })
})

describe('runFirstHop（第 1 跳 + 首帧判分）', () => {
  it('首帧出图 → applied + 带 url/nodeId 给第 2 跳', async () => {
    const out = await runFirstHop({ prompt: '小周抬头看钟', references: ['nomi-local://a.png'] }, okFrame)
    expect(out.applied).toBe(true)
    expect(out.firstFrameUrl).toBe('nomi-local://asset/p/ff.png')
    expect(out.firstFrameNodeId).toBe('kf-1')
    expect(out.reason).toBeNull()
  })

  it('有 ffDesc 时第 1 跳用它（静态首帧描述），没有才退回镜头 prompt', async () => {
    const seen: string[] = []
    const deps: I2vTwoHopDeps = { renderFirstFrame: async ({ prompt }) => { seen.push(prompt); return { url: 'u' } } }
    await runFirstHop({ prompt: '镜头运动描述', firstFrameDesc: '静态首帧：小周站在冰柜前', references: ['a'] }, deps)
    await runFirstHop({ prompt: '镜头运动描述', references: ['a'] }, deps)
    expect(seen).toEqual(['静态首帧：小周站在冰柜前', '镜头运动描述'])
  })

  it('首帧生成抛错 → 降级一跳 + 人话 reason（绝不让整个生成失败）', async () => {
    const deps: I2vTwoHopDeps = { renderFirstFrame: async () => { throw new Error('vendor 500') } }
    const out = await runFirstHop({ prompt: 'p', references: ['a'] }, deps)
    expect(out.applied).toBe(false)
    expect(out.firstFrameUrl).toBeNull()
    expect(out.reason).toContain('降级')
  })

  it('首帧无产出（null/空 url）→ 降级一跳', async () => {
    const out = await runFirstHop({ prompt: 'p', references: ['a'] }, { renderFirstFrame: async () => null })
    expect(out.applied).toBe(false)
    expect(out.reason).toContain('降级')
  })

  it('无参考 → 直接降级（两跳无锚可定）', async () => {
    const out = await runFirstHop({ prompt: 'p', references: [] }, okFrame)
    expect(out.applied).toBe(false)
  })

  it('首帧判分不过检 → **仍 applied 推进 I2V**，只如实标注（判分不阻断）', async () => {
    const out = await runFirstHop({ prompt: 'p', references: ['a'] }, {
      ...okFrame,
      verifyFirstFrame: async () => ({ passed: false, flagged: 1 }),
    })
    expect(out.applied).toBe(true)
    expect(out.firstFrameVerify).toEqual({ passed: false, flagged: 1 })
    expect(out.reason).toContain('未达标')
  })

  it('判分自身抛错 → 当没判过（verify=null），照常推进', async () => {
    const out = await runFirstHop({ prompt: 'p', references: ['a'] }, {
      ...okFrame,
      verifyFirstFrame: async () => { throw new Error('judge 500') },
    })
    expect(out.applied).toBe(true)
    expect(out.firstFrameVerify).toBeNull()
    expect(out.reason).toBeNull()
  })
})

// ── 尾帧那一跳（W2 「首尾帧锚定」的另一半，2026-08-20 补齐）──────────────────────────────
describe('shouldRenderLastFrame（三个条件缺一不可，缺了就别多烧这张图）', () => {
  const TAIL_KEYS = ['prompt', 'first_frame_url', 'last_frame_url']
  it('三条都满足 → 出尾帧', () => {
    expect(shouldRenderLastFrame({ twoHopApplied: true, lastFrameDesc: '她把钥匙放在柜台上，手离开画面', videoBodyKeys: TAIL_KEYS })).toBe(true)
  })
  it('模型没尾帧槽 → 不出（硬塞也会被护栏拦，纯白烧）', () => {
    expect(shouldRenderLastFrame({ twoHopApplied: true, lastFrameDesc: '她把钥匙放下', videoBodyKeys: ['prompt', 'first_frame_url'] })).toBe(false)
  })
  it('分镜没给 lfDesc → 不出（不凭空编一个终态塞给模型）', () => {
    expect(shouldRenderLastFrame({ twoHopApplied: true, videoBodyKeys: TAIL_KEYS })).toBe(false)
    expect(shouldRenderLastFrame({ twoHopApplied: true, lastFrameDesc: '   ', videoBodyKeys: TAIL_KEYS })).toBe(false)
  })
  it('两跳都没走成 → 不出（没有首帧谈不上尾帧）', () => {
    expect(shouldRenderLastFrame({ twoHopApplied: false, lastFrameDesc: '她把钥匙放下', videoBodyKeys: TAIL_KEYS })).toBe(false)
  })
  it('键名 derive 不 hardcode 某家：image_tail / end_image 同样认', () => {
    for (const key of ['image_tail', 'end_image', 'tail_image', 'lastFrame']) {
      expect(shouldRenderLastFrame({ twoHopApplied: true, lastFrameDesc: 'x', videoBodyKeys: ['prompt', key] })).toBe(true)
    }
  })
})

describe('runFirstHop 的尾帧半跳（纯增益：坏了也不许拖垮整镜）', () => {
  const okFrame = async ({ prompt }: { prompt: string }) => ({ url: `https://cdn/${encodeURIComponent(prompt)}.png` })

  it('给了 renderLastFrame + lfDesc → 尾帧图带出来，且用的是 lfDesc 不是镜头 prompt', async () => {
    const out = await runFirstHop(
      { prompt: '镜头缓推，她抬头', firstFrameDesc: '中景，她低头擦杯子', lastFrameDesc: '近景，她抬头看向钟', references: ['ref://a'] },
      { renderFirstFrame: okFrame, renderLastFrame: okFrame },
    )
    expect(out.applied).toBe(true)
    expect(out.firstFrameUrl).toContain(encodeURIComponent('中景，她低头擦杯子'))
    expect(out.lastFrameUrl).toContain(encodeURIComponent('近景，她抬头看向钟'))
  })

  it('★尾帧出图炸了 → 首帧照常、整镜照常推进，只是没有尾帧（不阻断）', async () => {
    const out = await runFirstHop(
      { prompt: 'p', firstFrameDesc: 'ff', lastFrameDesc: 'lf', references: ['ref://a'] },
      { renderFirstFrame: okFrame, renderLastFrame: async () => { throw new Error('尾帧模型 500') } },
    )
    expect(out.applied).toBe(true)
    expect(out.firstFrameUrl).toBeTruthy()
    expect(out.lastFrameUrl).toBeNull()
  })

  it('没传 renderLastFrame（模型没槽）→ 尾帧路径根本不存在，行为与加这条之前一致', async () => {
    const out = await runFirstHop(
      { prompt: 'p', firstFrameDesc: 'ff', lastFrameDesc: 'lf', references: ['ref://a'] },
      { renderFirstFrame: okFrame },
    )
    expect(out.applied).toBe(true)
    expect(out.lastFrameUrl).toBeNull()
  })

  it('降级一跳时尾帧也一并为空（不会出现「没首帧却有尾帧」的怪状态）', async () => {
    const out = await runFirstHop(
      { prompt: 'p', lastFrameDesc: 'lf', references: [] },
      { renderFirstFrame: okFrame, renderLastFrame: okFrame },
    )
    expect(out.applied).toBe(false)
    expect(out.firstFrameUrl).toBeNull()
    expect(out.lastFrameUrl).toBeNull()
  })
})

// ── 没走两跳时的提示词折叠（L3-F1 实测抓出的信息丢失，2026-08-20）────────────────────────
describe('composeShotPrompt（分镜写的场景描述不许静默蒸发）', () => {
  const FF = '深夜便利店内，收银台后的挂钟特写，冷白灯管，右下角虚化的货架'
  const MOTION = '固定机位，挂钟特写，秒针跳动，玻璃反光里浮现人影'
  const LF = '同一挂钟，玻璃面上多了一道人形倒影'

  it('★空镜（没锚→不走两跳）：ffDesc 折进提示词，场景信息不再丢', () => {
    const out = composeShotPrompt({ prompt: MOTION, firstFrameDesc: FF, twoHopApplied: false })
    expect(out).toContain('便利店')
    expect(out).toContain('冷白灯管')
    expect(out).toContain(MOTION)
    // 顺序：静态场景在前、运动在后（T2V 提示词标准结构）
    expect(out.indexOf(FF)).toBeLessThan(out.indexOf(MOTION))
  })

  it('尾帧描述折成「收尾停在」，给模型一个落点', () => {
    const out = composeShotPrompt({ prompt: MOTION, firstFrameDesc: FF, lastFrameDesc: LF, twoHopApplied: false })
    expect(out).toContain('收尾停在：同一挂钟')
    expect(out.indexOf(MOTION)).toBeLessThan(out.indexOf('收尾停在'))
  })

  it('★走成两跳时原样返回：静态信息已由真图承载，再用文字复述会和图打架', () => {
    expect(composeShotPrompt({ prompt: MOTION, firstFrameDesc: FF, lastFrameDesc: LF, twoHopApplied: true })).toBe(MOTION)
  })

  it('没给 ff/lf → 原样返回（行为与加这条之前逐字节一致）', () => {
    expect(composeShotPrompt({ prompt: MOTION, twoHopApplied: false })).toBe(MOTION)
    expect(composeShotPrompt({ prompt: MOTION, firstFrameDesc: '  ', lastFrameDesc: '', twoHopApplied: false })).toBe(MOTION)
  })

  it('只有 lfDesc（分镜只写了落点）也折得进去', () => {
    expect(composeShotPrompt({ prompt: MOTION, lastFrameDesc: LF, twoHopApplied: false })).toContain('收尾停在')
  })
})
