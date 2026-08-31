import { describe, expect, it } from 'vitest'

// 反漂移守恒：electron 侧 nodeKindDomain 是 src 单一真相源的**纯镜像**（electron production 反向
// import 不了 src，故要一份本地表）。本测试在 vitest 下（可 import src）把镜像逐项钉死 === src registry，
// 任何一方改了值另一方没跟 → 立刻红。这是「重复 + 等价测试守恒」模式（同 thumbnailDerive.equivalence）。
import {
  NODE_KIND_DEFAULT_SIZE,
  NODE_KIND_DEFAULT_TITLE,
  NODE_RENDER_SAFETY,
  nodeKindDefaultCategory,
  nodeKindFootprint,
  nodeKindIsShotNumbered,
  nodeKindNextShotIndex,
} from './nodeKindDomain'

// src 单一真相源。
import { GENERATION_NODE_KINDS } from '../../src/workbench/generationCanvas/nodes/registry'
import { GENERATION_NODE_PLUGIN_BY_KIND } from '../../src/workbench/generationCanvas/nodes/registry'
import {
  DEFAULT_NODE_SIZE as SRC_DEFAULT_NODE_SIZE,
  NODE_RENDER_SAFETY as SRC_NODE_RENDER_SAFETY,
  getGenerationNodeFootprintSize as srcFootprint,
} from '../../src/workbench/generationCanvas/model/generationNodeKinds'
import { getDefaultCategoryForNodeKind as srcCategory } from '../../src/workbench/generationCanvas/model/generationCanvasTypes'
import { isShotNumberedNode as srcIsShotNumbered, nextShotIndex as srcNextShotIndex } from '../../src/workbench/generationCanvas/model/shotNumbering'

describe('nodeKindDomain 等价性（electron 镜像 === src registry 单一真相源）', () => {
  it('每个 registry kind 的默认尺寸完全一致', () => {
    for (const kind of GENERATION_NODE_KINDS) {
      expect(NODE_KIND_DEFAULT_SIZE[kind]).toEqual(SRC_DEFAULT_NODE_SIZE[kind])
    }
    // 且镜像不多不少覆盖所有 registry kind（漏一个 kind 也算漂移）。
    expect(Object.keys(NODE_KIND_DEFAULT_SIZE).sort()).toEqual([...GENERATION_NODE_KINDS].sort())
  })

  it('每个 registry kind 的英文默认标题 === registry.defaultTitle', () => {
    for (const kind of GENERATION_NODE_KINDS) {
      const plugin = GENERATION_NODE_PLUGIN_BY_KIND[kind]
      expect(NODE_KIND_DEFAULT_TITLE[kind]).toBe(plugin.defaultTitle)
    }
    expect(Object.keys(NODE_KIND_DEFAULT_TITLE).sort()).toEqual([...GENERATION_NODE_KINDS].sort())
  })

  it('安全余量常量一致，足迹逐 kind 一致', () => {
    expect(NODE_RENDER_SAFETY).toBe(SRC_NODE_RENDER_SAFETY)
    for (const kind of GENERATION_NODE_KINDS) {
      expect(nodeKindFootprint(kind)).toEqual(srcFootprint(kind))
    }
  })

  it('kind→默认分类逐 kind 一致', () => {
    for (const kind of GENERATION_NODE_KINDS) {
      expect(nodeKindDefaultCategory(kind)).toBe(srcCategory(kind))
    }
  })

  it('占镜号判定与 src isShotNumberedNode 一致（含 referenceSheet/storyboardKeyframe 排除）', () => {
    const cases: Array<{ kind: string; categoryId?: string; meta?: Record<string, unknown> }> = []
    for (const kind of GENERATION_NODE_KINDS) {
      cases.push({ kind, categoryId: 'shots' })
      cases.push({ kind, categoryId: 'cast' })
      cases.push({ kind, categoryId: 'shots', meta: { referenceSheet: true } })
      cases.push({ kind, categoryId: 'shots', meta: { storyboardKeyframe: true } })
      cases.push({ kind }) // categoryId 缺省
    }
    for (const c of cases) {
      expect(nodeKindIsShotNumbered(c)).toBe(
        srcIsShotNumbered(c as Parameters<typeof srcIsShotNumbered>[0]),
      )
    }
  })

  it('nextShotIndex 与 src 一致', () => {
    const nodes = [{ shotIndex: 3 }, { shotIndex: 7 }, {}]
    expect(nodeKindNextShotIndex(nodes)).toBe(srcNextShotIndex(nodes as Parameters<typeof srcNextShotIndex>[0]))
    expect(nodeKindNextShotIndex([])).toBe(srcNextShotIndex([]))
  })
})
