import { describe, expect, it } from 'vitest'
import { classifyReferenceKeyDetailed } from '../catalog/referenceReachability'
import { composeShotPrompt, runFirstHop, shouldRenderLastFrame, shouldUseTwoHop, type I2vTwoHopDeps } from './i2vTwoHop'

// W2 §3 · I2V 两跳（参考图 → 首帧 I2I → I2V）。纯编排单测：注入 renderFirstFrame / verifyFirstFrame 桩，
// 不打 vendor、不碰 electron。核心不变量：
//  · 判据 derive（video + 有参考 + 模型真读得到首帧键）——三缺一即一跳；
//  · 首帧失败/无产出 → 降级一跳 + 人话 reason，**绝不让整个生成失败**；
//  · 首帧判分不过检/判分自身出错 → **照常推进**（W1 韧性铁律：判分是增益不是关卡）。

const okFrame: I2vTwoHopDeps = { renderFirstFrame: async () => ({ url: 'nomi-local://asset/p/ff.png', nodeId: 'kf-1' }) }

describe('shouldUseTwoHop（该不该走两跳 · 纯判据）', () => {
  const REFS = ['nomi-local://anchor.png']

  it('video + 有锚 + 模型吃图片参考 → 走两跳', () => {
    expect(shouldUseTwoHop({ intent: 'video', references: REFS, videoAcceptsImageReference: true })).toBe(true)
  })

  it('图片镜不走（没有「首帧」这个概念）', () => {
    expect(shouldUseTwoHop({ intent: 'image', references: REFS, videoAcceptsImageReference: true })).toBe(false)
  })

  it('没有锚参考图 → 不走（无锚可定，两跳没有意义，退 T2V 兜底）', () => {
    expect(shouldUseTwoHop({ intent: 'video', references: [], videoAcceptsImageReference: true })).toBe(false)
  })

  it('模型不吃图片参考（纯 T2V）→ 不走（硬塞也会被护栏拦，不如老实一跳）', () => {
    expect(shouldUseTwoHop({ intent: 'video', references: REFS, videoAcceptsImageReference: false })).toBe(false)
  })
})

// ★ 这一条是 L3-F1 那个 bug 的哨兵：判据曾用手写正则猜键名，Seedance 的 image_urls（复数）
// 匹配不上 image_url$，两跳在主力模型上从来没触发过。夹具用**从打包目录里实测 dump 出来的真键名**，
// 不用手编的——编的键名当初就是这么骗过自己的。
describe('两跳判据必须认得真实模型的键名（用实测 dump 的键，不是编的）', () => {
  // dump 自 dist-electron/catalog/apimartVideos.js，doubao-seedance-2.0 的 image_to_video mapping
  const SEEDANCE_KEYS = ['audio_urls', 'duration', 'generate_audio', 'image_urls', 'image_with_roles', 'model', 'resolution', 'seed', 'size', 'video_urls']
  const KLING_KEYS = ['resolution', 'duration', 'first_frame_image']
  const T2V_ONLY_KEYS = ['model', 'prompt', 'size', 'resolution', 'duration', 'seed', 'generate_audio']

  // 复刻 core 的 derive（问目录的族表，不自己写正则）——这里只钉「结论」，实现在 referenceReachability。
  const acceptsImage = (keys: string[]) => keys.some((k) => classifyReferenceKeyDetailed(k)?.family === 'image')

  it('★Seedance：image_urls / image_with_roles 都该被认出来（旧正则一个都认不出）', () => {
    expect(acceptsImage(SEEDANCE_KEYS)).toBe(true)
    expect(shouldUseTwoHop({ intent: 'video', references: ['a'], videoAcceptsImageReference: acceptsImage(SEEDANCE_KEYS) })).toBe(true)
  })

  it('Kling 的 first_frame_image 照样认（修完不能把原来就通的搞坏）', () => {
    expect(acceptsImage(KLING_KEYS)).toBe(true)
  })

  it('★纯文生 body 不该被误判成能带参考（generate_audio 含 audio、不是载体）', () => {
    expect(acceptsImage(T2V_ONLY_KEYS)).toBe(false)
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
  it('★Seedance 的 image_with_roles 角色数组不算尾帧槽 → 不出尾帧图。这是**故意的**：我们的投影发的是 last_frame_url，本来也到不了它，宁可不生成也别烧一张送不到的图', () => {
    const SEEDANCE_KEYS = ['audio_urls', 'duration', 'generate_audio', 'image_urls', 'image_with_roles', 'model', 'resolution', 'seed', 'size', 'video_urls']
    expect(shouldRenderLastFrame({ twoHopApplied: true, lastFrameDesc: '她把钥匙放下', videoBodyKeys: SEEDANCE_KEYS })).toBe(false)
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
