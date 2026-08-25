import { describe, expect, it } from 'vitest'

// 反漂移守恒：electron 侧 anchorBible 是「锚 meta 键名 + 冻结/身份判据」的单一真相源（headless/production
// 冻结门读它），src 侧 anchorBibleKeys 是它的**纯镜像**（渲染层 dependencyWaves/batchPlanPreview 读镜像，
// electron production 反向 import 不了 src）。本测试在 vitest 下（可 import 两侧）把镜像逐项钉死 === electron——
// 任何一方改了键名/判据另一方没跟 → 立刻红。这正是防「GUI 写 staticFeatures、headless 读 static_features」
// 键名漂移的守恒测（同 nodeKindDomain.equivalence 的「重复 + 等价测试守恒」模式）。
import {
  ANCHOR_META_KEYS,
  anchorStaticFeatures,
  isAnchorFrozen,
  isVisualAnchorNode,
} from './anchorBible'

// src 镜像。
import {
  ANCHOR_META_KEYS as SRC_ANCHOR_META_KEYS,
  anchorStaticFeatures as srcAnchorStaticFeatures,
  isAnchorFrozen as srcIsAnchorFrozen,
  isVisualAnchorNode as srcIsVisualAnchorNode,
} from '../../src/workbench/generationCanvas/model/anchorBibleKeys'

describe('anchorBible 等价性（electron 单一真相源 === src 镜像）', () => {
  it('键名常量逐项一致（防漂移的核）', () => {
    expect(SRC_ANCHOR_META_KEYS).toEqual(ANCHOR_META_KEYS)
    // 键集不多不少（漏/多一个键也算漂移）。
    expect(Object.keys(SRC_ANCHOR_META_KEYS).sort()).toEqual(Object.keys(ANCHOR_META_KEYS).sort())
  })

  it('冻结判据逐 case 一致', () => {
    const cases = [
      { meta: { frozen: { at: 1_700_000_000_000, by: 'user' } } },
      { meta: {} },
      { meta: { frozen: true } },
      { meta: { frozen: { at: 0, by: 'user' } } },
      { meta: { frozen: { by: 'user' } } },
      { meta: { frozen: [] } },
      undefined,
    ]
    for (const c of cases) {
      expect(srcIsAnchorFrozen(c)).toBe(isAnchorFrozen(c))
    }
  })

  it('视觉锚判据逐 case 一致', () => {
    const cases = [
      { kind: 'character', meta: { referenceSheet: true } },
      { kind: 'scene', meta: { referenceSheet: true } },
      { kind: 'prop', meta: { referenceSheet: true } },
      { kind: 'video', meta: {} },
      { kind: 'text', meta: { referenceSheet: true } },
      { kind: 'character' },
      undefined,
    ]
    for (const c of cases) {
      expect(srcIsVisualAnchorNode(c)).toBe(isVisualAnchorNode(c))
    }
  })

  it('身份轴基准逐 case 一致', () => {
    const cases = [
      { prompt: '整串定妆卡文本', meta: { staticFeatures: '短发圆脸左眉痣' } },
      { prompt: '整串定妆卡文本' },
      { prompt: 'p', meta: { staticFeatures: '   ' } },
      undefined,
    ]
    for (const c of cases) {
      expect(srcAnchorStaticFeatures(c)).toBe(anchorStaticFeatures(c))
    }
  })
})
