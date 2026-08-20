import { describe, expect, it } from 'vitest'

import {
  ANCHOR_META_KEYS,
  anchorStaticFeatures,
  isAnchorFrozen,
  isVisualAnchorNode,
  unfrozenAnchorsForShot,
  unfrozenVisualAnchors,
} from './anchorBible'

describe('anchorBible 纯判据（冻结门 + 身份轴基准的单一真相源）', () => {
  it('键名常量钉死（防漂移：GUI 写这些、headless 读这些，只能有一份）', () => {
    expect(ANCHOR_META_KEYS).toEqual({
      referenceSheet: 'referenceSheet',
      staticFeatures: 'staticFeatures',
      dynamicFeatures: 'dynamicFeatures',
      frozen: 'frozen',
    })
  })

  it('视觉锚判据：referenceSheet===true 且 kind∈character/scene/prop 才算', () => {
    expect(isVisualAnchorNode({ kind: 'character', meta: { referenceSheet: true } })).toBe(true)
    expect(isVisualAnchorNode({ kind: 'scene', meta: { referenceSheet: true } })).toBe(true)
    expect(isVisualAnchorNode({ kind: 'prop', meta: { referenceSheet: true } })).toBe(true)
    // 镜头节点（无 referenceSheet）不是锚。
    expect(isVisualAnchorNode({ kind: 'video', meta: {} })).toBe(false)
    // style 文本锚不走冻结（就算被误标 referenceSheet，kind 也不在集合里）。
    expect(isVisualAnchorNode({ kind: 'text', meta: { referenceSheet: true } })).toBe(false)
    // 缺 meta / 缺 referenceSheet → 不是锚。
    expect(isVisualAnchorNode({ kind: 'character' })).toBe(false)
    expect(isVisualAnchorNode(undefined)).toBe(false)
  })

  it('冻结判据：frozen 是带正时间戳的对象才算已冻结', () => {
    expect(isAnchorFrozen({ meta: { frozen: { at: 1_700_000_000_000, by: 'user' } } })).toBe(true)
    // 未冻结的各种形态都判 false（键缺失/畸形/0/负/非对象）。
    expect(isAnchorFrozen({ meta: {} })).toBe(false)
    expect(isAnchorFrozen({ meta: { frozen: true } })).toBe(false)
    expect(isAnchorFrozen({ meta: { frozen: { at: 0, by: 'user' } } })).toBe(false)
    expect(isAnchorFrozen({ meta: { frozen: { by: 'user' } } })).toBe(false)
    expect(isAnchorFrozen({ meta: { frozen: [] } })).toBe(false)
    expect(isAnchorFrozen(undefined)).toBe(false)
  })

  it('身份轴基准：优先 staticFeatures，退化到 prompt', () => {
    expect(anchorStaticFeatures({ prompt: '整串定妆卡文本', meta: { staticFeatures: '短发圆脸左眉痣' } })).toBe('短发圆脸左眉痣')
    // 无 staticFeatures → 退化到 prompt。
    expect(anchorStaticFeatures({ prompt: '整串定妆卡文本' })).toBe('整串定妆卡文本')
    // staticFeatures 空白 → 退化到 prompt。
    expect(anchorStaticFeatures({ prompt: 'p', meta: { staticFeatures: '   ' } })).toBe('p')
    expect(anchorStaticFeatures(undefined)).toBe('')
  })

  it('unfrozenVisualAnchors：只挑出「需冻结但未冻结」的视觉锚', () => {
    const nodes = [
      { id: 'a1', kind: 'character', meta: { referenceSheet: true } }, // 未冻结锚 → 挑出
      { id: 'a2', kind: 'scene', meta: { referenceSheet: true, frozen: { at: 1, by: 'user' } } }, // 已冻结 → 不挑
      { id: 's1', kind: 'video', meta: {} }, // 镜头 → 不挑
      { id: 'a3', kind: 'prop', meta: { referenceSheet: true } }, // 未冻结道具锚 → 挑出
    ]
    expect(unfrozenVisualAnchors(nodes).map((n) => n.id)).toEqual(['a1', 'a3'])
    // 全冻结 → 空。
    expect(unfrozenVisualAnchors([{ id: 'a2', kind: 'character', meta: { referenceSheet: true, frozen: { at: 1, by: 'user' } } }])).toEqual([])
  })
})

// ── 冻结门第三层：单镜生成时的提醒（2026-08-20 补 MCP 单镜循环绕过冻结门的洞）────────────
describe('unfrozenAnchorsForShot（只提醒不拦，但必须提醒得准）', () => {
  // 定妆卡的真实形状：kind 就是 'character'（不是 image + 某个 meta 标记），meta.referenceSheet=true。
  const card = (id: string, title: string, frozen?: boolean) => ({
    id, title, kind: 'character',
    meta: {
      referenceSheet: true,
      ...(frozen ? { frozen: { at: 1_700_000_000_000, by: 'user' } } : {}),
    },
  })

  it('引用了没冻结的定妆卡 → 报出来（这正是 MCP 一镜一镜循环时绕过去的那道门）', () => {
    const hits = unfrozenAnchorsForShot([card('c1', '小周定妆'), card('c2', '便利店', true)])
    expect(hits.map((n) => n.id)).toEqual(['c1'])
  })

  it('全冻结了 → 零提醒（不制造噪音，误报多了没人再看这句）', () => {
    expect(unfrozenAnchorsForShot([card('c1', '小周定妆', true), card('c2', '便利店', true)])).toEqual([])
  })

  it('引用的不是视觉锚（普通图节点）→ 不提醒（拿一张随手图当参考是合法用法）', () => {
    expect(unfrozenAnchorsForShot([{ id: 'x', title: '随手图', kind: 'image', meta: {} }])).toEqual([])
  })

  it('没有任何引用 → 零提醒（T2V 兜底不该被念叨）', () => {
    expect(unfrozenAnchorsForShot([])).toEqual([])
  })
})
