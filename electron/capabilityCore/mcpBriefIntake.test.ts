import { describe, expect, it } from 'vitest'
import {
  INTAKE_DEFER,
  INTAKE_MAX_QUESTIONS,
  buildIntakeMessage,
  buildIntakeQuestions,
  buildIntakeSchema,
  resolveIntake,
  summarizeIntake,
} from './mcpBriefIntake'

// W3 幕 0 · 开场收敛。铁律来自 C 路调研的跨产品共识：
//  ① 题数硬上限 3（>3 就是审讯，正是用户骂过的「反复确认」观感）；
//  ② 跳过永远安全（留空/「按你判断」/非法值 → 一律走系统默认，绝不报错拦住用户）；
//  ③ 一屏问全（不逐条追问）。

describe('题数与形态', () => {
  it('恒 ≤3 题（硬上限，加题也截断）', () => {
    for (const kind of ['', 'brand.promo', '短剧', 'unknown-kind']) {
      expect(buildIntakeQuestions({ kind }).length).toBeLessThanOrEqual(INTAKE_MAX_QUESTIONS)
    }
  })

  it('题面随片型 derive（宣传片与剧情片基调候选不同），但维度恒是那三个', () => {
    const promo = buildIntakeQuestions({ kind: 'brand.promo' })
    const drama = buildIntakeQuestions({ kind: '短剧' })
    expect(promo.map((q) => q.key)).toEqual(['tone', 'aspect', 'look'])
    expect(drama.map((q) => q.key)).toEqual(['tone', 'aspect', 'look'])
    expect(promo[0].optionLabels).not.toEqual(drama[0].optionLabels) // 基调候选按片型变
  })

  it('schema：每题 enum 都含「按你判断」、且 required 为空（任何一题都能留空）', () => {
    const qs = buildIntakeQuestions()
    const schema = buildIntakeSchema(qs) as { properties: Record<string, { enum: string[]; enumNames: string[] }>; required?: string[] }
    expect(schema.required ?? []).toEqual([])
    for (const q of qs) {
      expect(schema.properties[q.key].enum).toContain(INTAKE_DEFER)
      expect(schema.properties[q.key].enumNames).toContain('按你判断')
      expect(schema.properties[q.key].enum.length).toBe(schema.properties[q.key].enumNames.length)
    }
  })

  it('文案一屏问全，且明说「只问这一次」（打消「又要被反复问」的焦虑）', () => {
    const msg = buildIntakeMessage(buildIntakeQuestions())
    expect(msg).toContain('只问这一次')
    expect(msg).toContain('按你判断')
    expect(msg.split('\n').length).toBeLessThanOrEqual(6) // 一屏
  })
})

describe('跳过永远安全（铁律②）', () => {
  const qs = buildIntakeQuestions({ kind: '短剧' })

  it('完全不答 → 全部回落默认，不报错', () => {
    const d = resolveIntake(qs, {})
    expect(d.answered).toBe(0)
    expect(Object.keys(d.values)).toEqual(qs.map((q) => q.key))
    for (const q of qs) expect(d.values[q.key]).toBe(q.fallback)
    expect(d.usedDefaults.length).toBe(qs.length)
  })

  it('选「按你判断」→ 等价于跳过（走默认，不计入已答）', () => {
    const d = resolveIntake(qs, { tone: INTAKE_DEFER, aspect: INTAKE_DEFER, look: INTAKE_DEFER })
    expect(d.answered).toBe(0)
    expect(d.values.aspect).toBe('9:16')
  })

  it('给了非法值 → 回落默认而不是抛错（收敛这步绝不因答得不规整拦住用户）', () => {
    const d = resolveIntake(qs, { tone: '随便什么', aspect: 42 as unknown as string })
    expect(d.values.tone).toBe(qs[0].fallback)
    expect(d.values.aspect).toBe(qs[1].fallback)
  })

  it('answers 为 null/undefined → 不炸，全默认', () => {
    expect(resolveIntake(qs, null).answered).toBe(0)
    expect(resolveIntake(qs, undefined).answered).toBe(0)
  })

  it('部分作答 → 已答的采纳、未答的走默认，两者都如实记账', () => {
    const d = resolveIntake(qs, { aspect: '16:9' })
    expect(d.values.aspect).toBe('16:9')
    expect(d.answered).toBe(1)
    expect(d.usedDefaults).toContain('整体基调')
    expect(d.usedDefaults).not.toContain('画幅')
  })
})

describe('summarizeIntake（回执：说人话 + 诚实标注走了默认）', () => {
  const qs = buildIntakeQuestions({ kind: '短剧' })

  it('用人话候选名而非机器值', () => {
    const s = summarizeIntake(qs, resolveIntake(qs, { tone: 'noir', aspect: '16:9', look: 'photoreal' }))
    expect(s).toContain('悬疑黑色')
    expect(s).toContain('横屏 16:9（长视频）')
    expect(s).not.toContain('noir') // 不把机器值糊到用户脸上
  })

  it('走了默认的项明着标（D4：缺口不藏）', () => {
    const s = summarizeIntake(qs, resolveIntake(qs, { tone: 'noir' }))
    expect(s).toContain('按默认')
    expect(s).toContain('画幅')
  })

  it('全部作答 → 不出现「按默认」尾巴', () => {
    const s = summarizeIntake(qs, resolveIntake(qs, { tone: 'noir', aspect: '9:16', look: 'stylized' }))
    expect(s).not.toContain('按默认')
  })
})
