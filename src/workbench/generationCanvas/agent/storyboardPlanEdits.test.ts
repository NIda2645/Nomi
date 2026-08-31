import { describe, expect, it } from 'vitest'
import type { StoryboardPlan } from './storyboardPlan'
import {
  addAnchor,
  addShot,
  applyDurationToAll,
  applyModelToAll,
  applyShotKindToAll,
  changeAnchorKind,
  danglingAnchorIdsForShot,
  defaultCarrierForKind,
  deriveBulkDuration,
  deriveBulkModelKey,
  deriveBulkShotKind,
  makeAnchorId,
  moveShot,
  removeAnchor,
  removeShotAt,
  shotKindPatch,
  shotTypeOf,
  toggleShotAnchor,
  validatePlan,
} from './storyboardPlanEdits'

const base = (): StoryboardPlan => ({
  title: 't',
  anchors: [
    { id: 'anchor-1', kind: 'character', name: '林夏', description: 'd', carrier: 'visual' },
    { id: 'anchor-2', kind: 'style', name: '全片', description: 's', carrier: 'text', scope: 'all' },
  ],
  shots: [
    { index: 1, durationSec: 5, anchorIds: ['anchor-1', 'anchor-2'], prompt: 'p1' },
    { index: 2, durationSec: 8, anchorIds: ['anchor-1'], prompt: 'p2' },
  ],
})

describe('storyboardPlanEdits — 锚', () => {
  it('addAnchor 按类型给默认 carrier（style=text，其余=visual）+ 唯一 id', () => {
    const p1 = addAnchor(base(), 'scene')
    expect(p1.anchors.at(-1)).toMatchObject({ kind: 'scene', carrier: 'visual', name: '' })
    const p2 = addAnchor(p1, 'style')
    expect(p2.anchors.at(-1)).toMatchObject({ kind: 'style', carrier: 'text', scope: 'all' })
    const ids = p2.anchors.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length) // 无重复
  })

  it('makeAnchorId 避开已有 id', () => {
    const plan = { ...base(), anchors: [{ id: 'anchor-3', kind: 'prop', name: 'x', description: '', carrier: 'visual' } as const] }
    expect(plan.anchors.some((a) => a.id === makeAnchorId(plan))).toBe(false)
  })

  it('changeAnchorKind 改风格 → carrier 跟随成 text', () => {
    expect(defaultCarrierForKind('style')).toBe('text')
    const p = changeAnchorKind(base(), 'anchor-1', 'style')
    expect(p.anchors[0]).toMatchObject({ kind: 'style', carrier: 'text' })
  })

  it('removeAnchor 不擦引用它的镜头（失效引用留给校验标红）', () => {
    const p = removeAnchor(base(), 'anchor-1')
    expect(p.anchors.map((a) => a.id)).toEqual(['anchor-2'])
    expect(p.shots[0].anchorIds).toContain('anchor-1') // 镜头引用未被静默清掉
    expect(danglingAnchorIdsForShot(p, p.shots[0])).toEqual(['anchor-1'])
  })
})

describe('storyboardPlanEdits — 镜头', () => {
  it('addShot 追加并续号', () => {
    const p = addShot(base())
    expect(p.shots.map((s) => s.index)).toEqual([1, 2, 3])
    expect(p.shots.at(-1)).toMatchObject({ index: 3, durationSec: 5, anchorIds: [], prompt: '' })
  })

  it('addShot 继承图片+视频模式', () => {
    const p = addShot({
      ...base(),
      shots: [
        { index: 1, shotKind: 'video', keyframe: { enabled: true, prompt: '首帧' }, durationSec: 5, anchorIds: [], prompt: '视频' },
      ],
    })
    expect(p.shots.at(-1)).toMatchObject({ index: 2, shotKind: 'video', keyframe: { enabled: true, prompt: '' }, durationSec: 5 })
  })

  it('removeShotAt 删除后镜号重排连续', () => {
    const p = removeShotAt(base(), 0)
    expect(p.shots.map((s) => s.index)).toEqual([1])
    expect(p.shots[0].prompt).toBe('p2') // 原镜2 成了镜1
  })

  it('moveShot 重排后镜号连续；越界 no-op', () => {
    const p = moveShot(base(), 1, 0)
    expect(p.shots.map((s) => [s.index, s.prompt])).toEqual([[1, 'p2'], [2, 'p1']])
    expect(moveShot(base(), 0, 9)).toEqual(base()) // 越界不动
  })

  it('toggleShotAnchor 勾/取消引用', () => {
    const added = toggleShotAnchor(base(), 1, 'anchor-2') // 镜2 原无 anchor-2
    expect(added.shots[1].anchorIds).toEqual(['anchor-1', 'anchor-2'])
    const removed = toggleShotAnchor(added, 1, 'anchor-1')
    expect(removed.shots[1].anchorIds).toEqual(['anchor-2'])
  })
})

describe('storyboardPlanEdits — 校验', () => {
  it('全合法方案 → 无 issue', () => {
    expect(validatePlan(base())).toEqual([])
  })

  it('删锚造成的失效引用被逐镜捕获', () => {
    const p = removeAnchor(base(), 'anchor-1')
    const issues = validatePlan(p)
    expect(issues).toContainEqual({ kind: 'dangling-ref', shotIndex: 1, anchorId: 'anchor-1' })
    expect(issues).toContainEqual({ kind: 'dangling-ref', shotIndex: 2, anchorId: 'anchor-1' })
  })

  it('空提示词镜 / 无镜 / 视觉锚无名 各自拦截', () => {
    expect(validatePlan({ title: 't', anchors: [], shots: [] })).toContainEqual({ kind: 'no-shots' })
    const noPrompt = { ...base(), shots: [{ index: 1, durationSec: 5, anchorIds: [], prompt: '  ' }] }
    expect(validatePlan(noPrompt)).toContainEqual({ kind: 'empty-shot-prompt', shotIndex: 1 })
    const noName = { ...base(), anchors: [{ id: 'anchor-1', kind: 'character', name: '', description: '', carrier: 'visual' } as const] }
    expect(validatePlan(noName)).toContainEqual({ kind: 'anchor-no-name', anchorId: 'anchor-1' })
  })

  it('文本锚无名不拦（不建卡，无需标题）', () => {
    const textNoName = { ...base(), anchors: [{ id: 'anchor-2', kind: 'style', name: '', description: 's', carrier: 'text' } as const], shots: [{ index: 1, durationSec: 5, anchorIds: [], prompt: 'p' }] }
    expect(validatePlan(textNoName).some((i) => i.kind === 'anchor-no-name')).toBe(false)
  })
})

// ── 「全部镜头」批量条的领域逻辑（样张 A）：档位换算 / 改档补丁 / 整片应用 / 混合判定 ──

const planOf = (shots: StoryboardPlan['shots']): StoryboardPlan => ({ ...base(), shots })

describe('storyboardPlanEdits — 镜头类型档位', () => {
  it('shotTypeOf 三档：image / video / image-video（shotKind 缺省按 video 兜底）', () => {
    expect(shotTypeOf({ index: 1, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'p' })).toBe('image')
    expect(shotTypeOf({ index: 1, shotKind: 'video', durationSec: 5, anchorIds: [], prompt: 'p' })).toBe('video')
    expect(shotTypeOf({ index: 1, durationSec: 5, anchorIds: [], prompt: 'p' })).toBe('video')
    expect(
      shotTypeOf({ index: 1, shotKind: 'video', durationSec: 5, keyframe: { enabled: true }, anchorIds: [], prompt: 'p' }),
    ).toBe('image-video')
    // keyframe 存在但没 enabled ≠ image-video
    expect(
      shotTypeOf({ index: 1, shotKind: 'video', durationSec: 5, keyframe: { prompt: 'k' }, anchorIds: [], prompt: 'p' }),
    ).toBe('video')
  })

  it('image→video：时长兜底 5s + 清模型/模式/参数 + 不带 keyframe', () => {
    const shot = { index: 1, shotKind: 'image' as const, durationSec: 0, anchorIds: [], prompt: 'p', modelKey: 'm', modeId: 'md', params: { a: 1 } }
    const patch = shotKindPatch(shot, 'video')
    expect(patch).toMatchObject({ shotKind: 'video', durationSec: 5 })
    expect(patch.modelKey).toBeUndefined()
    expect(patch.modeId).toBeUndefined()
    expect(patch.params).toBeUndefined()
    expect(patch.keyframe).toBeUndefined()
  })

  it('video→image：清 keyframe + 清模型三件套，不留时长（图片镜无时长）', () => {
    const shot = { index: 1, shotKind: 'video' as const, durationSec: 8, keyframe: { enabled: true, prompt: 'k' }, anchorIds: [], prompt: 'p', modelKey: 'm' }
    const patch = shotKindPatch(shot, 'image')
    expect(patch).toMatchObject({ shotKind: 'image' })
    expect(patch.keyframe).toBeUndefined()
    expect(patch.modelKey).toBeUndefined()
    expect(patch).not.toHaveProperty('durationSec')
  })

  it('→image-video：置 keyframe.enabled 并保留已写的首帧提示词；已有时长不被覆盖', () => {
    const shot = { index: 1, shotKind: 'video' as const, durationSec: 8, keyframe: { prompt: 'k' }, anchorIds: [], prompt: 'p' }
    expect(shotKindPatch(shot, 'image-video')).toMatchObject({
      shotKind: 'video',
      durationSec: 8,
      keyframe: { enabled: true, prompt: 'k' },
    })
    // 从图片镜过来：时长兜底 5、首帧提示词为空串
    const img = { index: 1, shotKind: 'image' as const, durationSec: 0, anchorIds: [], prompt: 'p' }
    expect(shotKindPatch(img, 'image-video')).toMatchObject({ durationSec: 5, keyframe: { enabled: true, prompt: '' } })
  })
})

describe('storyboardPlanEdits — 整片批量应用', () => {
  it('applyShotKindToAll 把全镜改成同一档，逐镜等价于 shotKindPatch', () => {
    const plan = planOf([
      { index: 1, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'a', modelKey: 'img-m' },
      { index: 2, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'b' },
    ])
    const next = applyShotKindToAll(plan, 'video')
    expect(next.shots.map(shotTypeOf)).toEqual(['video', 'video'])
    expect(next.shots.every((s) => s.durationSec === 5)).toBe(true)
    expect(next.shots[0].modelKey).toBeUndefined()
    // 与逐镜改同构
    expect(next.shots[0]).toEqual({ ...plan.shots[0], ...shotKindPatch(plan.shots[0], 'video') })
  })

  it('applyShotKindToAll 对已是目标档的镜头原样返回（同一引用，不无谓清参数）', () => {
    const plan = planOf([
      { index: 1, shotKind: 'video', durationSec: 8, anchorIds: [], prompt: 'a', modelKey: 'keep' },
      { index: 2, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'b' },
    ])
    const next = applyShotKindToAll(plan, 'video')
    expect(next.shots[0]).toBe(plan.shots[0])
    expect(next.shots[0].modelKey).toBe('keep')
    expect(shotTypeOf(next.shots[1])).toBe('video')
  })

  it('applyModelToAll 写 modelKey 并清 modeId/params；空串 = 回默认模型', () => {
    const plan = planOf([
      { index: 1, durationSec: 5, anchorIds: [], prompt: 'a', modelKey: 'x', modeId: 'mx', params: { a: 1 } },
      { index: 2, durationSec: 5, anchorIds: [], prompt: 'b' },
    ])
    const next = applyModelToAll(plan, 'seedance')
    expect(next.shots.map((s) => s.modelKey)).toEqual(['seedance', 'seedance'])
    expect(next.shots.every((s) => s.modeId === undefined && s.params === undefined)).toBe(true)
    expect(applyModelToAll(next, '').shots.every((s) => s.modelKey === undefined)).toBe(true)
  })

  it('applyDurationToAll 只改视频镜，图片镜不动；非法值原样返回', () => {
    const plan = planOf([
      { index: 1, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'a' },
      { index: 2, shotKind: 'video', durationSec: 5, anchorIds: [], prompt: 'b' },
    ])
    const next = applyDurationToAll(plan, 10)
    expect(next.shots.map((s) => s.durationSec)).toEqual([0, 10])
    expect(applyDurationToAll(plan, 0)).toBe(plan)
    expect(applyDurationToAll(plan, Number.NaN)).toBe(plan)
  })
})

describe('storyboardPlanEdits — 批量条当前值（混合判定）', () => {
  it('deriveBulkShotKind：全同 → 该档；不同 → null（显「混合」）；无镜 → null', () => {
    expect(deriveBulkShotKind(planOf([
      { index: 1, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'a' },
      { index: 2, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'b' },
    ]))).toBe('image')
    expect(deriveBulkShotKind(planOf([
      { index: 1, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'a' },
      { index: 2, shotKind: 'video', durationSec: 5, anchorIds: [], prompt: 'b' },
    ]))).toBeNull()
    // video vs image-video 也算不一致
    expect(deriveBulkShotKind(planOf([
      { index: 1, shotKind: 'video', durationSec: 5, anchorIds: [], prompt: 'a' },
      { index: 2, shotKind: 'video', durationSec: 5, keyframe: { enabled: true }, anchorIds: [], prompt: 'b' },
    ]))).toBeNull()
    expect(deriveBulkShotKind(planOf([]))).toBeNull()
  })

  it('deriveBulkModelKey：都没选 → 空串（默认模型）；一选一没选 → null', () => {
    expect(deriveBulkModelKey(planOf([
      { index: 1, durationSec: 5, anchorIds: [], prompt: 'a' },
      { index: 2, durationSec: 5, anchorIds: [], prompt: 'b' },
    ]))).toBe('')
    expect(deriveBulkModelKey(planOf([
      { index: 1, durationSec: 5, anchorIds: [], prompt: 'a', modelKey: 'x' },
      { index: 2, durationSec: 5, anchorIds: [], prompt: 'b', modelKey: 'x' },
    ]))).toBe('x')
    expect(deriveBulkModelKey(planOf([
      { index: 1, durationSec: 5, anchorIds: [], prompt: 'a', modelKey: 'x' },
      { index: 2, durationSec: 5, anchorIds: [], prompt: 'b' },
    ]))).toBeNull()
  })

  it('deriveBulkDuration：只看视频镜；全图片镜 → null；视频镜时长不同 → null', () => {
    expect(deriveBulkDuration(planOf([
      { index: 1, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'a' },
      { index: 2, shotKind: 'video', durationSec: 8, anchorIds: [], prompt: 'b' },
      { index: 3, shotKind: 'video', durationSec: 8, anchorIds: [], prompt: 'c' },
    ]))).toBe(8)
    expect(deriveBulkDuration(planOf([
      { index: 1, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'a' },
    ]))).toBeNull()
    expect(deriveBulkDuration(planOf([
      { index: 1, shotKind: 'video', durationSec: 5, anchorIds: [], prompt: 'a' },
      { index: 2, shotKind: 'video', durationSec: 8, anchorIds: [], prompt: 'b' },
    ]))).toBeNull()
  })

  it('批量改完 → derive 回同一个值（往返一致，批量条不会改完还显「混合」）', () => {
    const mixed = planOf([
      { index: 1, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'a' },
      { index: 2, shotKind: 'video', durationSec: 8, anchorIds: [], prompt: 'b', modelKey: 'x' },
    ])
    expect(deriveBulkShotKind(mixed)).toBeNull()
    const unified = applyShotKindToAll(mixed, 'image-video')
    expect(deriveBulkShotKind(unified)).toBe('image-video')
    expect(deriveBulkModelKey(unified)).toBe('')
    expect(deriveBulkDuration(applyDurationToAll(unified, 6))).toBe(6)
  })
})
