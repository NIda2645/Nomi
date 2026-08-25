import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { isAnchorFrozen, isVisualAnchorNode } from '../model/anchorBibleKeys'
import { confirmAnchorLook, undoAnchorLook, toggleAnchorLook, isAnchorLookConfirmed } from './freezeAnchor'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

// F15 冻结门的**操作者**：这是全仓第一处写 meta.frozen 的生产代码。判据仍走 anchorBibleKeys 镜像。
const sceneAnchor = (extraMeta: Record<string, unknown> = {}): GenerationCanvasNode =>
  ({
    id: 'scene1', kind: 'scene', title: '便利店', position: { x: 0, y: 0 }, prompt: '', categoryId: 'scene',
    meta: { referenceSheet: true, ...extraMeta },
    result: { id: 'r', type: 'image', url: 'https://cdn/x.png', createdAt: 1 },
  }) as unknown as GenerationCanvasNode
const plainImage = (): GenerationCanvasNode =>
  ({ id: 'img1', kind: 'image', title: '普通图', position: { x: 0, y: 0 }, prompt: '', categoryId: 'shots', meta: {} }) as unknown as GenerationCanvasNode

function seed(nodes: GenerationCanvasNode[]): void {
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes, edges: [], selectedNodeIds: [], groups: [] })
}

describe('freezeAnchor — 冻结门操作者', () => {
  beforeEach(() => seed([]))

  it('定妆：写 meta.frozen={at>0,by:user} → isAnchorFrozen 认账', () => {
    seed([sceneAnchor()])
    expect(isAnchorFrozen(useGenerationCanvasStore.getState().nodes[0])).toBe(false)
    expect(confirmAnchorLook('scene1')).toBe(true)
    const node = useGenerationCanvasStore.getState().nodes[0]
    expect(isAnchorFrozen(node)).toBe(true)
    const frozen = (node.meta as Record<string, unknown>).frozen as { at: number; by: string }
    expect(frozen.by).toBe('user')
    expect(frozen.at).toBeGreaterThan(0)
  })

  it('定妆必须保住 referenceSheet（F15 破案 case D：丢了这张就不再算锚、门失明）', () => {
    seed([sceneAnchor({ staticFeatures: '短发圆脸' })])
    confirmAnchorLook('scene1')
    const meta = useGenerationCanvasStore.getState().nodes[0].meta as Record<string, unknown>
    expect(meta.referenceSheet).toBe(true) // 没被 spread 丢掉
    expect(meta.staticFeatures).toBe('短发圆脸') // 其它 meta 也在
    expect(isVisualAnchorNode(useGenerationCanvasStore.getState().nodes[0])).toBe(true)
  })

  it('非视觉锚（普通图，无 referenceSheet）→ 定妆 no-op，不误写', () => {
    seed([plainImage()])
    expect(confirmAnchorLook('img1')).toBe(false)
    expect((useGenerationCanvasStore.getState().nodes[0].meta as Record<string, unknown>).frozen).toBeUndefined()
  })

  it('撤销定妆：删掉 frozen', () => {
    seed([sceneAnchor()])
    confirmAnchorLook('scene1')
    expect(isAnchorFrozen(useGenerationCanvasStore.getState().nodes[0])).toBe(true)
    expect(undoAnchorLook('scene1')).toBe(true)
    expect(isAnchorFrozen(useGenerationCanvasStore.getState().nodes[0])).toBe(false)
    expect((useGenerationCanvasStore.getState().nodes[0].meta as Record<string, unknown>).frozen).toBeUndefined()
  })

  it('toggle：未冻结→冻结→未冻结', () => {
    seed([sceneAnchor()])
    toggleAnchorLook('scene1')
    expect(isAnchorLookConfirmed(useGenerationCanvasStore.getState().nodes[0])).toBe(true)
    toggleAnchorLook('scene1')
    expect(isAnchorLookConfirmed(useGenerationCanvasStore.getState().nodes[0])).toBe(false)
  })

  it('幂等：对已冻结再定妆 → 仍 true、不重写时间戳语义（返回已冻结）', () => {
    seed([sceneAnchor()])
    confirmAnchorLook('scene1')
    const firstAt = ((useGenerationCanvasStore.getState().nodes[0].meta as Record<string, unknown>).frozen as { at: number }).at
    expect(confirmAnchorLook('scene1')).toBe(true)
    const secondAt = ((useGenerationCanvasStore.getState().nodes[0].meta as Record<string, unknown>).frozen as { at: number }).at
    expect(secondAt).toBe(firstAt) // 幂等：已冻结不再改
  })
})
