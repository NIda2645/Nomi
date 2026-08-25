import { describe, expect, it } from 'vitest'
import { estimatePlanCost } from './planCostEstimate'
import type { ModelOption } from '../../../config/models'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

const node = (id: string): GenerationCanvasNode =>
  ({ id, kind: 'image', title: id, position: { x: 0, y: 0 }, prompt: '', categoryId: 'shots', meta: {} }) as unknown as GenerationCanvasNode
const priced = (cost: number): ModelOption => ({ value: 'm', label: 'M', pricing: { cost, enabled: true, specCosts: [] } })
const unpriced = (): ModelOption => ({ value: 'm', label: 'M' }) // 无 pricing

describe('estimatePlanCost — F11 本波价格（未知 ≠ 0）', () => {
  it('全部有价 → known，累加 credits', () => {
    const est = estimatePlanCost([node('a'), node('b')], (n) => (n.id === 'a' ? priced(3) : priced(5)))
    expect(est).toEqual({ known: true, credits: 8 })
  })

  it('任一节点解不出 pricing → 整批 known:false（价格未知），绝不当 0 少报', () => {
    const est = estimatePlanCost([node('a'), node('b')], (n) => (n.id === 'a' ? priced(3) : unpriced()))
    expect(est.known).toBe(false)
    if (!est.known) expect(est.unresolved).toBe(1)
  })

  it('cost 为 0 是「已知免费」，不是未知（区分 0 与未知）', () => {
    const est = estimatePlanCost([node('a')], () => priced(0))
    expect(est).toEqual({ known: true, credits: 0 })
  })

  it('缺失节点（undefined）计入未知，不悄悄漏', () => {
    const est = estimatePlanCost([node('a'), undefined], () => priced(2))
    expect(est.known).toBe(false)
  })

  it('模型选项没匹配到（resolveOption 返回 undefined）→ 未知', () => {
    const est = estimatePlanCost([node('a')], () => undefined)
    expect(est.known).toBe(false)
  })
})
