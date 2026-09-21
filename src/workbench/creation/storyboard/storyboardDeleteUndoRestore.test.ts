// 删一条方案 = 一个手势 + 一条撤销路（2026-09-21 改：不再弹确认）。
//
// 这个文件钉的是**撤销真的把东西放回原处**这件事。它值得被断言，因为「撤销」有两种做法，
// 而错的那种在界面上看起来一模一样：再 add 一条会发新 id、追加到队尾、重起标题——
// 用户点完撤销看到方案回来了，但它排到了最后一位、画布上已落的节点绑定也断了。
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkbenchStore } from '../../workbenchStore'
import type { StoryboardPlan } from '../../generationCanvas/agent/storyboardPlan'
import type { StoryboardDesign } from '../../workbenchTypes'

const DOC = 'doc-1'
const planOf = (title: string): StoryboardPlan => ({ title, anchors: [], shots: [{ index: 1, durationSec: 5, anchorIds: [], prompt: '镜一' }] })
const designOf = (title: string): StoryboardDesign => ({
  id: `design-${title}`, documentId: DOC, title, plan: planOf(title), committed: false,
  status: 'draft', sourceDocumentUpdatedAt: 1, createdAt: 1, updatedAt: 1,
})
const ids = () => (useWorkbenchStore.getState().storyboardDesignsByDocumentId[DOC] ?? []).map((design) => design.id)

beforeEach(() => {
  useWorkbenchStore.setState({
    workbenchDocuments: [{ id: DOC, version: 1, title: '', contentJson: { type: 'doc', content: [] }, updatedAt: 1 }],
    activeDocumentId: DOC,
    storyboardDesignsByDocumentId: { [DOC]: [designOf('甲'), designOf('乙'), designOf('丙')] },
    activeStoryboardId: null,
  })
})

describe('删一条方案之后还撤得回来，而且回到原来的位置', () => {
  it('撤销把中间那条放回**中间**，不是队尾', () => {
    const state = useWorkbenchStore.getState()
    const before = state.storyboardDesignsByDocumentId[DOC]!
    const index = 1
    const removed = before[index]!
    state.deleteStoryboardDesign(removed.id, DOC)
    expect(ids()).toEqual(['design-甲', 'design-丙'])
    useWorkbenchStore.getState().restoreStoryboardDesign(removed, DOC, index)
    // 位置**和 id 都**要一样：位置变了用户得重新找，id 变了画布上已落的节点就绑不回来。
    expect(ids()).toEqual(['design-甲', 'design-乙', 'design-丙'])
    expect(useWorkbenchStore.getState().storyboardDesignsByDocumentId[DOC]![index]).toBe(removed)
  })

  it('撤销第一条与最后一条也各回各位', () => {
    const state = useWorkbenchStore.getState()
    const list = state.storyboardDesignsByDocumentId[DOC]!
    state.deleteStoryboardDesign(list[0]!.id, DOC)
    useWorkbenchStore.getState().restoreStoryboardDesign(list[0]!, DOC, 0)
    expect(ids()).toEqual(['design-甲', 'design-乙', 'design-丙'])
    useWorkbenchStore.getState().deleteStoryboardDesign(list[2]!.id, DOC)
    useWorkbenchStore.getState().restoreStoryboardDesign(list[2]!, DOC, 2)
    expect(ids()).toEqual(['design-甲', 'design-乙', 'design-丙'])
  })

  it('同一条撤两次只回来一个——撤销只撤自己那一笔', () => {
    // toast 挂着的那几秒里世界会变（模型、另一条 lane、另一个会话都可能写同一份表）。
    // 这条判据两头都挡：界面上的 `isUndoable` 一道、store 自己一道。
    const state = useWorkbenchStore.getState()
    const removed = state.storyboardDesignsByDocumentId[DOC]![1]!
    state.deleteStoryboardDesign(removed.id, DOC)
    useWorkbenchStore.getState().restoreStoryboardDesign(removed, DOC, 1)
    useWorkbenchStore.getState().restoreStoryboardDesign(removed, DOC, 1)
    expect(ids()).toEqual(['design-甲', 'design-乙', 'design-丙'])
  })

  it('下标越界不炸也不丢：夹到两端', () => {
    const state = useWorkbenchStore.getState()
    const removed = state.storyboardDesignsByDocumentId[DOC]![0]!
    state.deleteStoryboardDesign(removed.id, DOC)
    useWorkbenchStore.getState().restoreStoryboardDesign(removed, DOC, 99)
    expect(ids()).toContain(removed.id)
    expect(ids()).toHaveLength(3)
  })

  it('删与撤都记一笔 persistRevision——不记就不落盘，重启后它自己回来了', () => {
    const start = useWorkbenchStore.getState().persistRevision
    const removed = useWorkbenchStore.getState().storyboardDesignsByDocumentId[DOC]![1]!
    useWorkbenchStore.getState().deleteStoryboardDesign(removed.id, DOC)
    const afterDelete = useWorkbenchStore.getState().persistRevision
    expect(afterDelete).toBeGreaterThan(start)
    useWorkbenchStore.getState().restoreStoryboardDesign(removed, DOC, 1)
    expect(useWorkbenchStore.getState().persistRevision).toBeGreaterThan(afterDelete)
  })
})

describe('删除那一刻取到的「它排第几」必须是删之前的', () => {
  it('先取下标、再删——顺序反了就永远拿到 -1', () => {
    // 这是接线时唯一会写反的一处：`findIndex` 放在 `deleteStoryboardDesign` 之后，
    // 拿到的是 -1，撤销于是把方案插到队首。界面上「撤销回来了」照样成立，
    // 只有位置不对——而位置正是用户点撤销时要的那个东西。
    const state = useWorkbenchStore.getState()
    const designs = state.storyboardDesignsByDocumentId[DOC]!
    const index = designs.findIndex((design) => design.id === 'design-丙')
    expect(index).toBe(2)
    state.deleteStoryboardDesign('design-丙', DOC)
    expect((useWorkbenchStore.getState().storyboardDesignsByDocumentId[DOC] ?? []).findIndex((design) => design.id === 'design-丙')).toBe(-1)
  })
})
