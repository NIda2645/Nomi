import { describe, expect, it } from 'vitest'
import { runFirstHop, shouldUseTwoHop, type I2vTwoHopDeps } from './i2vTwoHop'

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
