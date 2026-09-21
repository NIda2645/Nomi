// 覆写账本的语义（2026-09-11 用户拍板的那三条）：
//   ① 卡上改的东西**不落画布**，只落这份账本；
//   ② 「全部」改公共层、「逐镜」改这一镜层，**逐镜压全部**；
//   ③ 来回切模式两层都还在（不丢覆写）。
import { describe, expect, it, vi } from 'vitest'
import type { PendingSpendShot } from '../../../desktop/productionRunBridgeTypes'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import {
  readSpendDraft, consumeSpendDraft, restoreSpendDraft, clearConsumedSpendDraft, retainSpendDraft, spendDraftKey,
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
      node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1536x1024', quality: 'standard' }), 'each')
    expect(effectivePatchForShot(draft, 'a').parameters).toEqual({ size: '1536x1024', quality: 'standard' })
    expect(effectivePatchForShot(draft, 'b')).toEqual({})
  })

  it('「全部」改公共层，每一镜都吃到', () => {
    const shots = [shot('a'), shot('b', { index: 2 })]
    const draft = draftAfterNodeEdit(EMPTY_SPEND_DRAFT, shots[0],
      node({ modelKey: 'seedream', modelVendor: 'apimart', size: '1024x1024', quality: 'standard' }), 'all')
    expect(effectivePatchForShot(draft, 'a').modelId).toBe('seedream')
    expect(effectivePatchForShot(draft, 'b').modelId).toBe('seedream')
  })

  it('逐镜覆写压全部，来回切模式两层都还在', () => {
    const first = shot('a')
    // 先在「逐镜」里把 a 改成 seedream
    let draft = draftAfterNodeEdit(EMPTY_SPEND_DRAFT, first,
      node({ modelKey: 'seedream', modelVendor: 'apimart', size: '1024x1024', quality: 'standard' }), 'each')
    // 再切「全部」把整批改成 nano-banana（视图此刻只叠公共层，所以基线是宿主那一份）
    draft = draftAfterNodeEdit(draft, first,
      node({ modelKey: 'nano-banana', modelVendor: 'apimart', size: '1024x1024', quality: 'standard' }), 'all')
    expect(effectivePatchForShot(draft, 'a').modelId, '逐镜层压在公共层上面').toBe('seedream')
    expect(effectivePatchForShot(draft, 'b').modelId, '没有逐镜覆写的镜吃公共层').toBe('nano-banana')
    expect(effectivePatchForShot(draft, 'a', 'all').modelId, '「全部」视图看到的是正在编辑的那一层').toBe('nano-banana')
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
      node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1536x1024', quality: 'standard' }), 'each')
    expect(draftIsEmpty(draft)).toBe(false)
    expect(draftIsEmpty(EMPTY_SPEND_DRAFT)).toBe(true)
    expect(revisionsForConfirm(shots, draft).map((entry) => entry.shotId)).toEqual(['b'])
    expect(revisionsForConfirm(shots, draft, ['a'])).toEqual([])
  })

  it('改回原值等于没改：不留一个和原值相等的空覆写', () => {
    const base = shot('a')
    let draft = draftAfterNodeEdit(EMPTY_SPEND_DRAFT, base,
      node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1536x1024', quality: 'standard' }), 'each')
    expect(draftIsEmpty(draft)).toBe(false)
    draft = draftAfterNodeEdit(draft, base,
      node({ modelKey: 'gpt-image-2', modelVendor: 'apimart', size: '1024x1024', quality: 'standard' }), 'each')
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


// 2026-09-21：× 之后**没有**第二本账本。× 撤的是这次操作自己造的占位节点（一次 ⌘Z 全回来），
// 所以「找回被藏起来的草稿」这件事从根上不存在了。这条测试钉住「撤完就真没了」。
it('discarding a request leaves no recovery ledger behind', () => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
  try {
    const pending = { projectId: 'p', runId: 'r', operationId: 'o', quoteId: 'q1', planVersion: 1, candidateRevision: 1, currency: 'CNY', knownSubtotal: 1, unknownShotCount: 0, shots: [shot('a')] }
    const draft = { all: {}, perShot: { a: { prompt: 'unapproved edit' } } }
    retainSpendDraft(spendDraftKey(pending), draft)
    expect(restoreSpendDraft(pending)).toEqual(draft)
    clearConsumedSpendDraft(pending)
    expect(entries.size).toBe(0)
    // 另一笔（新 quote / 新 plan 版本）永远读不到上一笔的账本：账本绑的是报价身份。
    for (const reopened of [{ ...pending, quoteId: 'q2' }, { ...pending, planVersion: 3 }, { ...pending, candidateRevision: 9 }]) {
      expect(restoreSpendDraft(reopened)).toEqual(EMPTY_SPEND_DRAFT)
    }
  } finally { vi.unstubAllGlobals() }
})


it('partial consumption keeps all-layer and per-shot edits for remaining shots across new quotes and scopes', () => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
  try {
    const pending = { projectId: 'p', runId: 'r', operationId: 'o', quoteId: 'q1', planVersion: 1, candidateRevision: 1, currency: 'CNY', knownSubtotal: 1, unknownShotCount: 0, shots: [shot('a'), shot('b'), shot('c')] }
    const draft = { all: { prompt: 'all edited', parameters: { quality: 'high' } }, perShot: { b: { prompt: 'B edited' } } }
    const successor = { ...pending, quoteId: 'q2', planVersion: 2 }
    const remaining = consumeSpendDraft(pending, draft, ['a'], successor)
    expect(effectivePatchForShot(remaining, 'a')).toEqual({})
    expect(effectivePatchForShot(remaining, 'b')).toEqual({ prompt: 'B edited', parameters: { quality: 'high' } })
    expect(effectivePatchForShot(remaining, 'c')).toEqual(draft.all)
    expect(restoreSpendDraft(successor)).toEqual(remaining)
    const editedAgain = { ...remaining, perShot: { ...remaining.perShot, b: { ...remaining.perShot.b, prompt: 'B edited again' } } }
    retainSpendDraft(spendDraftKey(successor), editedAgain)
    expect(restoreSpendDraft(successor).perShot.b).toEqual(editedAgain.perShot.b)
    // 换一份报价身份 = 换一本账本，一个字都带不过去。
    for (const changed of [{ ...successor, runId: 'other' }, { ...successor, operationId: 'other' }, { ...successor, quoteId: 'q3' }]) {
      expect(draftIsEmpty(restoreSpendDraft(changed))).toBe(true)
    }
    const consumed = consumeSpendDraft(successor, restoreSpendDraft(successor))
    expect(draftIsEmpty(consumed)).toBe(true)
    expect(entries.size).toBe(0)
  } finally { vi.unstubAllGlobals() }
})

it('confirming every shot consumes the ledger without resurrecting fragments', () => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
  try {
    const pending = { projectId: 'p', runId: 'r', operationId: 'o', quoteId: 'q1', planVersion: 1, candidateRevision: 1, currency: 'CNY', knownSubtotal: 1, unknownShotCount: 0, shots: [shot('a'), shot('b')] }
    const draft = { all: { prompt: 'all edited' }, perShot: { b: { prompt: 'B edited' } } }
    retainSpendDraft(spendDraftKey(pending), draft)
    expect(restoreSpendDraft(pending)).toEqual(draft)
    expect(draftIsEmpty(consumeSpendDraft(pending, draft))).toBe(true)
    expect(draftIsEmpty(restoreSpendDraft({ ...pending, quoteId: 'q3', shots: [shot('b')] }))).toBe(true)
    expect(entries.size).toBe(0)
  } finally { vi.unstubAllGlobals() }
})


it('each can explicitly restore original prompt model and size underneath an all-layer override', () => {
  const base = shot('a')
  const original = node({ modelKey: base.modelId, modelVendor: base.providerId, ...base.parameters })
  const common = draftAfterNodeEdit(EMPTY_SPEND_DRAFT, base,
    applyPatchToNode(original, { prompt: 'common changed', modelId: 'seedream', parameters: {size:'1536x1024'} }), 'all')
  const reverted = draftAfterNodeEdit(common, base, original, 'each')
  expect(effectivePatchForShot(reverted, 'a')).toMatchObject({ prompt: base.prompt, modelId: base.modelId, parameters: {size:'1024x1024'} })
  expect(effectivePatchForShot(reverted, 'b')).toMatchObject({ prompt: 'common changed', modelId: 'seedream', parameters: {size:'1536x1024'} })
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
      all: { prompt: '', parameters: { nested: { items: [null, true, 2, 'x'] } }, referenceInputs: [] },
      perShot: { a: { prompt: '  preserve spacing  ', referenceInputs: [
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
    const draft = { all: { prompt: 'retained user input' }, perShot: {} }
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
    const draft = { all: { prompt: 'saved' }, perShot: {} }
    const other = { ...pending, operationId: 'other' }
    retainSpendDraft(spendDraftKey(other), draft)
    if (kind === 'exact') retainSpendDraft(spendDraftKey(pending), draft)
    else consumeSpendDraft(pending, draft, ['a'])
    const otherKey = spendDraftKey(other)
    const otherRaw = entries.get(otherKey)
    for (const key of entries.keys()) {
      if (key === otherKey) continue
      if (kind === 'partial' && key === spendDraftKey(pending)) { entries.delete(key); continue }
      entries.set(key, JSON.stringify({ all: {}, perShot: { b: null } }))
    }
    expect(restoreSpendDraft(pending)).toEqual(EMPTY_SPEND_DRAFT)
    expect(entries.get(otherKey)).toBe(otherRaw)
    expect(restoreSpendDraft(other)).toEqual(draft)
  } finally { vi.unstubAllGlobals() }
})
