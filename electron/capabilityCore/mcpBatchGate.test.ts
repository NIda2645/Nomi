import { describe, expect, it } from 'vitest'
import { buildBatchDisclosure, type BatchShotPlan } from './mcpBatchGate'

// W3 幕 4 · 批次确认闸的披露纯核。铁律：把「这一句话要花多少」摊开，且**不谎报金额**。
const shot = (over: Partial<BatchShotPlan> = {}): BatchShotPlan => ({
  index: 1, title: '开场', anchorNames: ['小周'], intent: 'image', model: 'seedream', ...over,
})

describe('buildBatchDisclosure', () => {
  it('图/视频分开计数（价位差一个量级，混报等于没报）', () => {
    const d = buildBatchDisclosure({
      shots: [shot(), shot({ index: 2, intent: 'video' }), shot({ index: 3, intent: 'video' })],
      retryBudgetPerShot: 0, verifyEnabled: false,
    })
    expect(d.imageCount).toBe(1)
    expect(d.videoCount).toBe(2)
    expect(d.message).toContain('1 张图')
    expect(d.message).toContain('2 条视频')
  })

  it('★重试预算必须计入上界：3 镜 × 每镜 2 次重试 → 明说最坏跑 9 次（不能瞒着自动重滚的花费）', () => {
    const d = buildBatchDisclosure({
      shots: [shot(), shot({ index: 2 }), shot({ index: 3 })],
      retryBudgetPerShot: 2, verifyEnabled: true,
    })
    expect(d.maxGenerations).toBe(9)
    expect(d.message).toContain('最坏跑 9 次')
    expect(d.message).toContain('最多重试 2 次')
  })

  it('不重试时说「恰好跑 N 次」，不吓唬用户', () => {
    const d = buildBatchDisclosure({ shots: [shot(), shot({ index: 2 })], retryBudgetPerShot: 0, verifyEnabled: false })
    expect(d.maxGenerations).toBe(2)
    expect(d.message).toContain('恰好跑 2 次')
  })

  it('逐镜清单带镜号与引用锚（镜号=用户指改地址；引用锚=一眼看出这镜跟谁一致）', () => {
    const d = buildBatchDisclosure({
      shots: [shot({ index: 7, title: '柜台对视', anchorNames: ['小周', '便利店'] })],
      retryBudgetPerShot: 1, verifyEnabled: true,
    })
    expect(d.lines[0]).toContain('#7')
    expect(d.lines[0]).toContain('柜台对视')
    expect(d.lines[0]).toContain('小周、便利店')
  })

  it('无参考的镜如实写「无参考（纯文生）」，不含糊', () => {
    const d = buildBatchDisclosure({ shots: [shot({ anchorNames: [] })], retryBudgetPerShot: 0, verifyEnabled: false })
    expect(d.lines[0]).toContain('无参考')
  })

  it('审片开启时说明「走文本模型判分不计生成额度」+ 无法判定不误判（对齐 W2c 修复）', () => {
    const d = buildBatchDisclosure({ shots: [shot()], retryBudgetPerShot: 1, verifyEnabled: true })
    expect(d.message).toContain('不计生成额度')
    expect(d.message).toContain('无法判定')
  })

  it('明说「批准后整批跑完、中途不再逐镜打断」——这正是它区别于逐镜确认的价值', () => {
    const d = buildBatchDisclosure({ shots: [shot()], retryBudgetPerShot: 0, verifyEnabled: false })
    expect(d.message).toContain('不再逐镜打断')
  })

  it('不谎报金额：披露里不出现货币符号/金额（跨 vendor 计费口径不一，凑数字=误导）', () => {
    const d = buildBatchDisclosure({ shots: [shot(), shot({ index: 2, intent: 'video' })], retryBudgetPerShot: 2, verifyEnabled: true })
    expect(d.message).not.toMatch(/[¥$€]|元/)
  })

  it('空批次不炸', () => {
    const d = buildBatchDisclosure({ shots: [], retryBudgetPerShot: 2, verifyEnabled: true })
    expect(d.maxGenerations).toBe(0)
    expect(d.message).toContain('0 项')
  })
})
