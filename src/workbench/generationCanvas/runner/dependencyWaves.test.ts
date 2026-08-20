import { describe, expect, it } from 'vitest'
import { buildDependencyWaves, waveIndexByNode } from './dependencyWaves'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'

const node = (id: string, withResult = false): GenerationCanvasNode =>
  ({
    id,
    kind: 'image',
    title: id,
    ...(withResult ? { result: { id: `r-${id}`, url: `https://cdn/${id}.png` } } : {}),
  }) as unknown as GenerationCanvasNode

const edge = (source: string, target: string, mode = 'first_frame'): GenerationCanvasEdge =>
  ({ id: `${source}->${target}`, source, target, mode }) as unknown as GenerationCanvasEdge

describe('buildDependencyWaves', () => {
  it('独立节点全部第 1 波并行;依赖链按序分波(论文 Eq.7 调度语义)', () => {
    const nodes = [node('定妆'), node('场景'), node('镜头1'), node('镜头2'), node('空镜')]
    const edges = [edge('定妆', '镜头1', 'character_ref'), edge('场景', '镜头1'), edge('镜头1', '镜头2')]
    const plan = buildDependencyWaves(['定妆', '场景', '镜头1', '镜头2', '空镜'], { nodes, edges })
    expect(plan.waves).toEqual([['定妆', '场景', '空镜'], ['镜头1'], ['镜头2']])
    expect(plan.blocked).toEqual([])
    expect(waveIndexByNode(plan).get('镜头2')).toBe(3)
  })

  it('选择集外上游:有结果=满足;无结果=拦下且下游传染(杜绝静默裸跑)', () => {
    const nodes = [node('外部有果', true), node('外部无果'), node('A'), node('B')]
    const edges = [edge('外部有果', 'A'), edge('外部无果', 'B')]
    const plan = buildDependencyWaves(['A', 'B'], { nodes, edges })
    expect(plan.waves).toEqual([['A']])
    expect(plan.blocked).toHaveLength(1)
    expect(plan.blocked[0]).toMatchObject({ nodeId: 'B', reason: 'missing-upstream' })
    expect(plan.blocked[0].detail).toContain('外部无果')
  })

  it('文本→图片/视频 prompt 上下文边不参与参考依赖调度', () => {
    const txt = { ...node('文本'), kind: 'text' as const, contentJson: { type: 'doc' as const, content: [] } }
    const img = node('图片')
    const plan = buildDependencyWaves(['图片'], {
      nodes: [txt, img],
      edges: [edge('文本', '图片', 'reference')],
    })
    expect(plan.waves).toEqual([['图片']])
    expect(plan.blocked).toEqual([])
    expect(plan.edgesUsed).toEqual([])
  })

  it('环检测:循环引用的节点全部拦下,不死循环', () => {
    const nodes = [node('X'), node('Y'), node('独立')]
    const edges = [edge('X', 'Y'), edge('Y', 'X')]
    const plan = buildDependencyWaves(['X', 'Y', '独立'], { nodes, edges })
    expect(plan.waves).toEqual([['独立']])
    expect(plan.blocked.map((b) => b.reason)).toEqual(['cycle', 'cycle'])
  })

  it('依赖本批被拦节点的,跟着标 blocked 而不是死等', () => {
    const nodes = [node('外部无果'), node('A'), node('A的下游')]
    const edges = [edge('外部无果', 'A'), edge('A', 'A的下游')]
    const plan = buildDependencyWaves(['A', 'A的下游'], { nodes, edges })
    expect(plan.waves).toEqual([])
    expect(plan.blocked.map((b) => b.nodeId).sort()).toEqual(['A', 'A的下游'])
  })
})

// W2 冻结门（GUI 批量侧结构强制核）：视觉锚未冻结 → 引用它的镜头拦下（reason:'unfrozen-anchor'）。
const anchorNode = (id: string, kind: string, frozen: boolean, withResult = true): GenerationCanvasNode =>
  ({
    id,
    kind,
    title: id,
    meta: { referenceSheet: true, ...(frozen ? { frozen: { at: 1_700_000_000_000, by: 'user' } } : {}) },
    ...(withResult ? { result: { id: `r-${id}`, url: `https://cdn/${id}.png` } } : {}),
  }) as unknown as GenerationCanvasNode

describe('buildDependencyWaves · W2 冻结门', () => {
  it('锚已生成图但未冻结 → 引用它的镜头进 blocked(unfrozen-anchor)，而非静默放行', () => {
    // 锚在选择集外、已有 result（旧判据会「满足」放行）；W2 加冻结判据后仍拦下。
    const nodes = [anchorNode('林夏卡', 'character', false, true), node('镜头1')]
    const edges = [edge('林夏卡', '镜头1', 'character_ref')]
    const plan = buildDependencyWaves(['镜头1'], { nodes, edges })
    expect(plan.waves).toEqual([])
    expect(plan.blocked).toHaveLength(1)
    expect(plan.blocked[0]).toMatchObject({ nodeId: '镜头1', reason: 'unfrozen-anchor' })
    expect(plan.blocked[0].detail).toContain('林夏卡')
  })

  it('锚已冻结 → 镜头正常入波（放行）', () => {
    const nodes = [anchorNode('林夏卡', 'character', true, true), node('镜头1')]
    const edges = [edge('林夏卡', '镜头1', 'character_ref')]
    const plan = buildDependencyWaves(['镜头1'], { nodes, edges })
    expect(plan.waves).toEqual([['镜头1']])
    expect(plan.blocked).toEqual([])
  })

  it('锚在本批内但未冻结 → 锚可跑(单镜生成)、但引用它的镜头仍拦下(冻结门优先于波次先后)', () => {
    // 破死锁的另一面：锚自己能生成（在 wave 里），只是镜头等冻结。
    const nodes = [anchorNode('林夏卡', 'character', false, false), node('镜头1')]
    const edges = [edge('林夏卡', '镜头1', 'character_ref')]
    const plan = buildDependencyWaves(['林夏卡', '镜头1'], { nodes, edges })
    expect(plan.waves).toEqual([['林夏卡']]) // 锚可生成
    expect(plan.blocked).toEqual([{ nodeId: '镜头1', reason: 'unfrozen-anchor', detail: expect.stringContaining('林夏卡') }])
  })

  it('场景/道具卡同规则：未冻结即拦下引用它的镜头', () => {
    const nodes = [anchorNode('场景卡', 'scene', false), anchorNode('道具卡', 'prop', false), node('镜头1'), node('镜头2')]
    const edges = [edge('场景卡', '镜头1', 'style_ref'), edge('道具卡', '镜头2', 'reference')]
    const plan = buildDependencyWaves(['镜头1', '镜头2'], { nodes, edges })
    expect(plan.blocked.map((b) => [b.nodeId, b.reason]).sort()).toEqual([
      ['镜头1', 'unfrozen-anchor'],
      ['镜头2', 'unfrozen-anchor'],
    ])
  })

  it('非视觉锚上游（普通镜头有结果）不受冻结判据影响，照旧放行', () => {
    // 普通节点（无 referenceSheet）不是锚 → 冻结判据不适用，有结果即满足。
    const nodes = [node('前置镜', true), node('后置镜')]
    const edges = [edge('前置镜', '后置镜', 'first_frame')]
    const plan = buildDependencyWaves(['后置镜'], { nodes, edges })
    expect(plan.waves).toEqual([['后置镜']])
    expect(plan.blocked).toEqual([])
  })
})
