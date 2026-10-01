// 覆写账本的语义（2026-09-11 用户拍板）：卡上改的东西**不落画布**，只落这份账本。
// 2026-09-30 付费卡逐镜：每一页的主按钮只生成那一镜，「逐镜 / 全部」切换和它的「全部」那一层一起删了——
// 账本里只有每一镜自己的改动；上一版存下的「全部」那一层在读盘时压进每一镜，他打过的字一个不丢。
import { describe, expect, it, vi } from 'vitest'
import type { PendingSpendShot } from '../../../desktop/productionRunBridgeTypes'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import {
  readSpendDraft, consumeSpendDraft, restoreSpendDraft, retainSpendDraft, spendDraftKey,
  applyPatchToNode,
  candidatePatchFromNode,
  draftAfterNodeEdit,
  draftIsEmpty,
  effectiveCandidate,
  effectivePatchForShot,
  revisionsForConfirm,
  EMPTY_SPEND_DRAFT,
} from './spendCardDraft'

function shot(id: string, overrides: Partial<PendingSpendShot> = {}): PendingSpendShot {
  return {
    shotId: id,
    nodeId: `node-${id}`,
    index: 1,
    prompt: '六棱柱',
    providerId: 'apimart',
    modelId: 'gpt-image-2',
    parameters: { size: '1024x1024', quality: 'standard' },
    price: { known: true, amount: 0.3 },
    ...overrides,
  }
}

function node(meta: Record<string, unknown>, prompt = '六棱柱'): GenerationCanvasNode {
  return { id: 'node-a', kind: 'image', position: { x: 0, y: 0 }, prompt, meta } as unknown as GenerationCanvasNode
}

describe('spendCardDraft', () => {
  it('节点 → 补丁只带候选认识的键，没改就没有补丁', () => {
    const base = shot('a')
    expect(candidatePatchFromNode(node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1024x1024', quality: 'standard' }), base))
      .toBeUndefined()
    const patch = candidatePatchFromNode(node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1536x1024', quality: 'standard', title: '别管我' }), base)
    expect(patch?.parameters).toEqual({ size: '1536x1024', quality: 'standard' })
    expect(patch).not.toHaveProperty('title')
  })

  it('补丁 → 节点与 节点 → 补丁 是同一张映射表的两个方向', () => {
    const base = shot('a')
    const patched = applyPatchToNode(
      node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1024x1024', quality: 'standard' }),
      { modelId: 'seedream', providerId: 'kie', modeId: 'omni', parameters: { size: '1536x1024' }, prompt: '换一句' },
    )
    expect(patched.meta).toMatchObject({ modelKey: 'seedream', modelVendor: 'kie', size: '1536x1024' })
    expect((patched.meta as { archetype: { modeId: string } }).archetype.modeId).toBe('omni')
    expect(patched.prompt).toBe('换一句')
    expect(candidatePatchFromNode(patched, base)).toMatchObject({
      modelId: 'seedream', providerId: 'kie', modeId: 'omni', prompt: '换一句',
    })
  })

  it('「逐镜」只改这一镜，别的镜一个字不动', () => {
    const shots = [shot('a', { nodeId: 'n-a' }), shot('b', { nodeId: 'n-b', index: 2 })]
    const draft = draftAfterNodeEdit(EMPTY_SPEND_DRAFT, shots[0],
      node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1536x1024', quality: 'standard' }))
    expect(effectivePatchForShot(draft, 'a').parameters).toEqual({ size: '1536x1024', quality: 'standard' })
    expect(effectivePatchForShot(draft, 'b')).toEqual({})
  })

  it('上一版存下的「全部」那一层：读盘时压进每一镜（这一镜自己的改动压在上面），不丢字', () => {
    const legacy = { all: { modelId: 'nano-banana', parameters: { quality: 'high' } }, perShot: { a: { modelId: 'seedream' } } }
    const storage = { getItem: vi.fn(() => JSON.stringify(legacy)), setItem: vi.fn(), removeItem: vi.fn() }
    vi.stubGlobal('localStorage', storage)
    try {
      const restored = readSpendDraft('legacy-draft', ['a', 'b'])
      expect(effectivePatchForShot(restored, 'a'), '这一镜自己的改动压在「全部」上面').toEqual({ modelId: 'seedream', parameters: { quality: 'high' } })
      expect(effectivePatchForShot(restored, 'b'), '没有自己改动的镜吃到「全部」那一层').toEqual({ modelId: 'nano-banana', parameters: { quality: 'high' } })
      expect(restored).not.toHaveProperty('all')
    } finally { vi.unstubAllGlobals() }
  })

  it('有效候选 = 宿主那一镜 ⊕ 覆写；没被覆写的参数原样留着', () => {
    const base = shot('a')
    const candidate = effectiveCandidate(base, { modelId: 'seedream', parameters: { size: '1536x1024' } })
    expect(candidate).toEqual({
      providerId: 'apimart', modelId: 'seedream',
      parameters: { size: '1536x1024', quality: 'standard' },
    })
  })

  it('确认那一刻只发有改动的镜；限定 shotIds 时别的镜不发', () => {
    const shots = [shot('a'), shot('b', { index: 2 })]
    const draft = draftAfterNodeEdit(EMPTY_SPEND_DRAFT, shots[1],
      node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1536x1024', quality: 'standard' }))
    expect(draftIsEmpty(draft)).toBe(false)
    expect(draftIsEmpty(EMPTY_SPEND_DRAFT)).toBe(true)
    expect(revisionsForConfirm(shots, draft).map((entry) => entry.shotId)).toEqual(['b'])
    expect(revisionsForConfirm(shots, draft, ['a'])).toEqual([])
  })

  it('改回原值等于没改：不留一个和原值相等的空覆写', () => {
    const base = shot('a')
    let draft = draftAfterNodeEdit(EMPTY_SPEND_DRAFT, base,
      node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1536x1024', quality: 'standard' }))
    expect(draftIsEmpty(draft)).toBe(false)
    draft = draftAfterNodeEdit(draft, base,
      node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1024x1024', quality: 'standard' }))
    expect(draftIsEmpty(draft)).toBe(true)
  })
})

it('reference slot edits survive the draft ledger even when absent from scalar parameters', () => {
  const base = shot('a', {modelId: 'seedance-2', modeId: 'omni', parameters: {duration: 5}})
  const changed = node({modelKey: 'seedance-2', modelVendor: 'apimart', archetype: {id:'seedance-2', modeId:'omni'}, referenceImageUrls: ['https://example.com/ref.png']})
  const patch = candidatePatchFromNode(changed, base)
  expect(patch).toHaveProperty('referenceInputs')
})

it('saves declared model controls that were absent from the original candidate', () => {
  const base = shot('a', { modelId: 'seedance-2', modeId: 'omni', parameters: {} })
  const changed = node({ modelKey: 'seedance-2', modelVendor: 'apimart', archetype: { id: 'seedance-2', modeId: 'omni' }, duration: 10 })
  expect(candidatePatchFromNode(changed, base)?.parameters).toMatchObject({ duration: 10 })
})


// 2026-09-21：× 之后**没有**第二本账本（`nomi:dismissed-spend-draft:` 那本连同它的键已删）。
// 2026-09-22 裁决 B/D 之后这条更强了：× 收回的只是这一次出价，账本锚 `operationId`，
// 所以**换一份报价指纹草稿还在**——重新出价、价格刷新、改参数推版都带得过去（T-QA-30 的那一半）。
it('a fresh quote on the same operation still reads the user edits it never approved', () => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
  try {
    const pending = { projectId: 'p', runId: 'r', operationId: 'o', quoteId: 'q1', planVersion: 1, candidateRevision: 1, currency: 'CNY', knownSubtotal: 1, unknownShotCount: 0, shots: [shot('a')] }
    const draft = { perShot: { a: { prompt: 'unapproved edit' } } }
    retainSpendDraft(spendDraftKey(pending), draft)
    expect(restoreSpendDraft(pending)).toEqual(draft)
    // 报价指纹的每一维单独换一次，账本都还是同一本：它们是「你确认的是不是你看到的那个数」，不是地址。
    for (const requoted of [{ ...pending, quoteId: 'q2' }, { ...pending, planVersion: 3 }, { ...pending, candidateRevision: 9 },
      { ...pending, quoteId: 'q2', planVersion: 3, candidateRevision: 9 }]) {
      expect(restoreSpendDraft(requoted)).toEqual(draft)
    }
    // 一个键一本：整场只有这一条记录，没有第二本跟着长出来。
    expect([...entries.keys()]).toEqual([spendDraftKey(pending)])
    // 全部封印 = 这一本消费干净，删得一条不剩。
    expect(draftIsEmpty(consumeSpendDraft(pending, draft))).toBe(true)
    expect(entries.size).toBe(0)
  } finally { vi.unstubAllGlobals() }
})


// 镜头维度不在键里，在这本账本**自己的结构**里（`perShot`）：一次生成一本，一本里镜头各归各的。
// 把 shotId 提进键就是一次生成 N 本，翻页、去掉一镜都要在几本之间搬字——这条钉住「同一次生成里镜头仍然隔离」。
it('one operation keeps one ledger in which shots stay isolated from each other', () => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
  try {
    const pending = { projectId: 'p', runId: 'r', operationId: 'o', quoteId: 'q1', planVersion: 1, candidateRevision: 1, currency: 'CNY', knownSubtotal: 1, unknownShotCount: 0, shots: [shot('a'), shot('b')] }
    const edited = draftAfterNodeEdit(EMPTY_SPEND_DRAFT, pending.shots[0]!,
      applyPatchToNode(node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1024x1024', quality: 'standard' }), { prompt: 'A only' }))
    retainSpendDraft(spendDraftKey(pending), edited)
    expect([...entries.keys()], '一次生成只有一本账本').toEqual([spendDraftKey(pending)])
    const restored = restoreSpendDraft({ ...pending, quoteId: 'q2', planVersion: 2 })
    expect(effectivePatchForShot(restored, 'a')).toMatchObject({ prompt: 'A only' })
    expect(effectivePatchForShot(restored, 'b'), '改 A 那一下不落到 B 头上').toEqual({})
  } finally { vi.unstubAllGlobals() }
})

it("partial consumption keeps the remaining shots' edits across new quotes", () => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
  try {
    const pending = { projectId: 'p', runId: 'r', operationId: 'o', quoteId: 'q1', planVersion: 1, candidateRevision: 1, currency: 'CNY', knownSubtotal: 1, unknownShotCount: 0, shots: [shot('a'), shot('b'), shot('c')] }
    const draft = { perShot: { a: { prompt: 'A edited' }, b: { prompt: 'B edited', parameters: { quality: 'high' } }, c: { prompt: 'C edited' } } }
    // 点了「生成这张」的那一镜会把报价推进一版；剩下没决定的那几镜仍然读得回来（T-QA-27 的那一半）。
    const successor = { ...pending, quoteId: 'q2', planVersion: 2 }
    const remaining = consumeSpendDraft(pending, draft, ['a'])
    expect(effectivePatchForShot(remaining, 'a')).toEqual({})
    expect(effectivePatchForShot(remaining, 'b')).toEqual({ prompt: 'B edited', parameters: { quality: 'high' } })
    expect(effectivePatchForShot(remaining, 'c')).toEqual({ prompt: 'C edited' })
    expect(restoreSpendDraft(successor)).toEqual(remaining)
    const editedAgain = { ...remaining, perShot: { ...remaining.perShot, b: { ...remaining.perShot.b, prompt: 'B edited again' } } }
    retainSpendDraft(spendDraftKey(successor), editedAgain)
    expect(restoreSpendDraft(successor).perShot.b).toEqual(editedAgain.perShot.b)
    // 换一次**生成**（或换个项目 / 换条 Run）才是换一本账本，一个字都带不过去。
    for (const changed of [{ ...successor, runId: 'other' }, { ...successor, operationId: 'other' }, { ...successor, projectId: 'other' }]) {
      expect(draftIsEmpty(restoreSpendDraft(changed))).toBe(true)
    }
    const consumed = consumeSpendDraft(successor, restoreSpendDraft(successor))
    expect(draftIsEmpty(consumed)).toBe(true)
    expect(entries.size).toBe(0)
  } finally { vi.unstubAllGlobals() }
})

it('confirming every shot consumes this operation ledger without resurrecting fragments', () => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
  try {
    const pending = { projectId: 'p', runId: 'r', operationId: 'o', quoteId: 'q1', planVersion: 1, candidateRevision: 1, currency: 'CNY', knownSubtotal: 1, unknownShotCount: 0, shots: [shot('a'), shot('b')] }
    const draft = { perShot: { a: { prompt: 'A edited' }, b: { prompt: 'B edited' } } }
    retainSpendDraft(spendDraftKey(pending), draft)
    expect(restoreSpendDraft(pending)).toEqual(draft)
    expect(draftIsEmpty(consumeSpendDraft(pending, draft))).toBe(true)
    // 消费干净之后，同一次生成重新出价也读不到碎片；另一次生成本来就是另一本。
    expect(draftIsEmpty(restoreSpendDraft({ ...pending, quoteId: 'q3', shots: [shot('b')] }))).toBe(true)
    expect(draftIsEmpty(restoreSpendDraft({ ...pending, operationId: 'other' }))).toBe(true)
    expect(entries.size).toBe(0)
  } finally { vi.unstubAllGlobals() }
})


// Exercise the existing persistence owner with untrusted stored JSON.
describe('persisted spend draft validation', () => {
  it.each([
    null, [], { all: null, perShot: {} }, { all: [], perShot: {} },
    { all: {}, perShot: null }, { all: {}, perShot: [] },
    { all: {}, perShot: { a: null } }, { all: {}, perShot: { a: [] } },
    { all: { prompt: 42 }, perShot: {} },
    { all: { modelId: {} }, perShot: {} },
    { all: { parameters: null }, perShot: {} },
    { all: { parameters: [] }, perShot: {} },
    { all: { referenceInputs: {} }, perShot: {} },
    { all: { referenceInputs: [null] }, perShot: {} },
    { all: {}, perShot: { a: { referenceInputs: [{ reference: null }] } } },
    { all: {}, perShot: { a: { referenceInputs: [{ url: 'x', kind: 'unknown' }] } } },
    { perShot: null }, { perShot: [] }, { perShot: { a: [] } },
    { perShot: { a: { prompt: 42 } } },
    { perShot: {}, extra: true },
  ])('rejects malformed stored value %j before downstream use', value => {
    const raw = JSON.stringify(value)
    const storage = { getItem: vi.fn(() => raw), setItem: vi.fn(), removeItem: vi.fn() }
    vi.stubGlobal('localStorage', storage)
    try {
      const recovered = readSpendDraft('draft-under-test')
      expect(recovered).toEqual(EMPTY_SPEND_DRAFT)
      expect(() => draftIsEmpty(recovered)).not.toThrow()
      expect(() => revisionsForConfirm([shot('a')], recovered)).not.toThrow()
      expect(storage.setItem).not.toHaveBeenCalled()
      expect(storage.removeItem).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })

  it('preserves valid user edits including empty prompt, nested parameters and both reference forms', () => {
    const valid = {
      perShot: { b: { prompt: '', parameters: { nested: { items: [null, true, 2, 'x'] } }, referenceInputs: [] }, a: { prompt: '  preserve spacing  ', referenceInputs: [
        { url: 'https://example.com/a.png', kind: 'image' },
        { reference: { assetId: 'asset', contentHash: 'hash', version: 1, kind: 'image' } },
      ] } },
    }
    const raw = JSON.stringify(valid)
    const storage = { getItem: vi.fn(() => raw), setItem: vi.fn(), removeItem: vi.fn() }
    vi.stubGlobal('localStorage', storage)
    try {
      expect(readSpendDraft('draft-under-test')).toEqual(valid)
      expect(storage.setItem).not.toHaveBeenCalled()
      expect(storage.removeItem).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })
})

// 写不进去（配额满 / 隐私模式）只是「关掉面板回来还在不在」这件便利失效，
// **绝不允许**它把用户正在编辑的这张付费卡打断。
it('a storage failure never interrupts the card', () => {
  const entries = new Map<string, string>()
  let failWrite = false
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { if (failWrite) throw new Error('quota'); entries.set(key, value) },
    removeItem: (key: string) => entries.delete(key) })
  try {
    const pending = { projectId: 'p', runId: 'r', operationId: 'o', quoteId: 'q', planVersion: 1, candidateRevision: 1, currency: 'CNY', knownSubtotal: 1, unknownShotCount: 0, shots: [shot('a'), shot('b')] }
    const draft = { perShot: { a: { prompt: 'retained user input' } } }
    failWrite = true
    expect(() => retainSpendDraft(spendDraftKey(pending), draft)).not.toThrow()
    expect(restoreSpendDraft(pending)).toEqual(EMPTY_SPEND_DRAFT)
    failWrite = false
    retainSpendDraft(spendDraftKey(pending), draft)
    expect(restoreSpendDraft(pending)).toEqual(draft)
  } finally { vi.unstubAllGlobals() }
})

it.each(['exact', 'partial'] as const)('rejects malformed %s recovery without changing another request', kind => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
  try {
    const pending = { projectId: 'p', runId: 'r', operationId: 'o', quoteId: 'q', planVersion: 1, candidateRevision: 1, currency: 'CNY', knownSubtotal: 1, unknownShotCount: 0, shots: [shot('a'), shot('b')] }
    const draft = { perShot: { a: { prompt: 'saved' } } }
    const other = { ...pending, operationId: 'other' }
    retainSpendDraft(spendDraftKey(other), draft)
    if (kind === 'exact') retainSpendDraft(spendDraftKey(pending), draft)
    else consumeSpendDraft(pending, draft, ['a'])
    const otherKey = spendDraftKey(other)
    const otherRaw = entries.get(otherKey)
    for (const key of entries.keys()) {
      if (key === otherKey) continue
      if (kind === 'partial' && key === spendDraftKey(pending)) { entries.delete(key); continue }
      entries.set(key, JSON.stringify({ perShot: { b: null } }))
    }
    expect(restoreSpendDraft(pending)).toEqual(EMPTY_SPEND_DRAFT)
    expect(entries.get(otherKey)).toBe(otherRaw)
    expect(restoreSpendDraft(other)).toEqual(draft)
  } finally { vi.unstubAllGlobals() }
})
