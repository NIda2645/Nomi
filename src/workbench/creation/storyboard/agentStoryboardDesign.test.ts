import { beforeEach, describe, expect, it, vi } from 'vitest'
import { patchAgentStoryboardDesign, upsertAgentStoryboardDesign } from './agentStoryboardDesign'
import { useWorkbenchStore } from '../../workbenchStore'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import type { StoryboardPlan } from '../../generationCanvas/agent/storyboardPlan'

const context = vi.hoisted(() => ({ projectId: 'p', current: true }))
vi.mock('../../project/projectCanvasReadSurface', () => ({
  withProjectAction: (action: (value: unknown) => unknown) => action({
    binding: { projectId: context.projectId }, signal: new AbortController().signal,
    assertCurrent: () => { if (!context.current) throw new Error('project changed') },
  }),
}))

const plan = (title: string, prompt: string): StoryboardPlan => ({ title, anchors: [],
  shots: [{ index: 1, shotId: 'shot-1', shotKind: 'image', durationSec: 0, anchorIds: [], prompt }] })
const designs = () => useWorkbenchStore.getState().storyboardDesignsByDocumentId.doc ?? []
const upsert = (designId: string, value: StoryboardPlan) => upsertAgentStoryboardDesign({ projectId: 'p', documentId: 'doc', designId, plan: value })

beforeEach(() => {
  context.projectId = 'p'; context.current = true
  const store = useWorkbenchStore.getState()
  store.hydrateWorkbenchDocuments([{ id: 'doc', version: 1, title: 'Doc', updatedAt: 1, contentJson: { type: 'doc', content: [] } }], 'doc')
  store.hydrateStoryboardDesigns({})
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] })
})

describe('the agent writes into the same plan list a hand-made plan lives in', () => {
  it('creates one ordinary plan whose id is the draft id the model holds', () => {
    expect(upsert('op-1', plan('Seaside', 'A'))).toEqual({ status: 'saved', designId: 'op-1' })
    expect(designs()).toHaveLength(1)
    expect(designs()[0]).toMatchObject({ id: 'op-1', documentId: 'doc', title: 'Seaside', committed: false, status: 'draft' })
    // 用户手建的方案有的能力，这一条也必须有：它就是同一种东西。
    useWorkbenchStore.getState().renameStoryboardDesign('op-1', 'My cut')
    expect(designs()[0].title).toBe('My cut')
    useWorkbenchStore.getState().deleteStoryboardDesign('op-1', 'doc')
    expect(designs()).toEqual([])
  })

  it('replaces only the plan the model named, never the one that happens to be open', () => {
    upsert('op-1', plan('First', 'A'))
    upsert('op-2', plan('Second', 'B'))
    useWorkbenchStore.getState().setActiveStoryboardId('op-2', 'doc')
    upsert('op-1', plan('First', 'A revised'))
    expect(designs().map(design => design.plan.shots[0].prompt)).toEqual(['A revised', 'B'])
  })

  it('patches one shot and keeps every field the model did not send', () => {
    upsert('op-1', { title: 'Plan', anchors: [], shots: [
      { index: 1, shotId: 'shot-1', shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'A', modelKey: 'm', modelVendor: 'v' },
      { index: 2, shotId: 'shot-2', shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'B' },
    ] })
    expect(patchAgentStoryboardDesign({ projectId: 'p', documentId: 'doc', designId: 'op-1', shotId: 'shot-1', patch: { prompt: 'A at dusk' } }))
      .toEqual({ status: 'saved', shotId: 'shot-1' })
    expect(designs()[0].plan.shots[0]).toMatchObject({ prompt: 'A at dusk', modelKey: 'm', modelVendor: 'v' })
    expect(designs()[0].plan.shots[1].prompt).toBe('B')
  })

  it('refuses to invent a plan when the model names one that is gone', () => {
    expect(() => patchAgentStoryboardDesign({ projectId: 'p', documentId: 'doc', designId: 'op-missing', shotId: 'shot-1', patch: { prompt: 'x' } }))
      .toThrow('storyboard_design_missing')
    expect(designs()).toEqual([])
  })

  it('refuses a write aimed at another project or a document that is gone', () => {
    context.projectId = 'other'
    expect(() => upsert('op-1', plan('Seaside', 'A'))).toThrow('storyboard_project_changed')
    context.projectId = 'p'
    expect(() => upsertAgentStoryboardDesign({ projectId: 'p', documentId: 'missing', designId: 'op-1', plan: plan('Seaside', 'A') }))
      .toThrow('storyboard_document_missing')
    expect(designs()).toEqual([])
  })

  it('falls back to exactly the name a hand-made new plan gets when the model gives no title', () => {
    // 决策 3：标题缺省时与手动新建**同一套**命名。今天那一套本身还是空标题（审计 D 主题 A 的编号 bug，
    // 排在体验档），所以这里钉的是**两条路一致**，而不是把一个临时名字偷偷塞进 Agent 这一条路。
    const manual = useWorkbenchStore.getState().addStoryboardDesign('doc')!
    upsert('op-1', plan('', 'A'))
    expect(designs().find(design => design.id === 'op-1')!.title).toBe(manual.title)
  })
})
