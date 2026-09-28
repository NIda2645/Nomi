import { describe, expect, it } from 'vitest'

import { projectSpendCard } from './agentPanelSpendCard'
import { candidatePatchFromNode } from './spendCardDraft'
import type { PendingSpendConfirm } from '../../../desktop/productionRunBridgeTypes'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'

// 卡上每一个数都要能追到产地。这一组钉的是「印错了会怎样」而不是「长什么样」：
// 印 ¥0 会被读成免费、标题印金额会和价格行漂、报不出价还给「全部」会让主按钮无数可印。

const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key}(${Object.entries(options).map(([k, v]) => `${k}=${String(v)}`).join(',')})` : key

function shot(index: number, amount: number | null, modelId = 'kling', mode?: string) {
  return {
    shotId: `s${index}`,
    nodeId: `node-${index}`,
    index,
    prompt: `镜头 ${index}`,
    providerId: 'kie',
    modelId,
    mode,
    parameters: { duration: '3' },
    price: amount === null ? { known: false as const } : { known: true as const, amount },
  }
}

function pending(shots: ReturnType<typeof shot>[]): PendingSpendConfirm {
  const known = shots.filter((entry) => entry.price.known)
  return {
    projectId: 'p1', runId: 'op-1', operationId: 'op-1', planVersion: 1, quoteId: 'fixture-quote', candidateRevision: 2,
    currency: 'CNY', shots,
    knownSubtotal: known.reduce((sum, entry) => sum + (entry.price.known ? entry.price.amount : 0), 0),
    unknownShotCount: shots.length - known.length,
  }
}

describe('付费卡投影', () => {
  it('单镜：没有翻页器、没有范围切换，主按钮印这一镜的价', () => {
    const data = projectSpendCard(pending([shot(1, 0.3)]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(data.kind).toBe('spend')
    expect(data.pager).toBeUndefined()
    expect(data.confirmLabel).toContain('spendParamsConfirm')
    expect(data.price?.total).toContain('¥0.30')
  })

  it('标题里不印金额：金额随参数变，两处印同一个数一定有一个先漂', () => {
    const data = projectSpendCard(pending([shot(1, 0.3)]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(data.title).toBe('agentPanelV4.spendParamsTitleImage(count=1)')
    expect(data.title).not.toContain('0.30')
  })

  it('报不出价：印那句话而不是 ¥0，主按钮退成「仍要生成」，范围切换不渲染', () => {
    const data = projectSpendCard(pending([shot(1, null), shot(2, null)]), { page: 0, scope: 'all' }, t, { locale: 'zh-CN' })!
    expect(data.price?.total).toBeUndefined()
    expect(data.price?.unavailable).toBe('agentPanelV4.spendParamsUnavailable')
    expect(JSON.stringify(data)).not.toContain('¥0.00')
    expect(data.confirmLabel).toBe('agentPanelV4.spendParamsConfirmUnknown')
    expect(data.pager?.scope).toBeUndefined()
    // 这句交代**只说一遍**，住在页脚左下；正文下不再有第二句同义的话。
    expect(data.scope).toBeUndefined()
    expect(data.totalLead).toBe('agentPanelV4.spendTotalUnknown')
  })

  // 2026-09-21 未知价开闸之后这张卡是**真能按下去**的（从前按下去必然失败）。所以「屏上不出现
  // 任何代表未知的 0」从一条显示纪律升级成了一条花钱纪律：用户会照着它做花钱的决定。
  it('报不出价：整张卡序列化后找不到任何金额位的 0（混合批次也一样）', () => {
    const allUnknown = projectSpendCard(pending([shot(1, null), shot(2, null)]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    // t() 把金额渲染成 `amount=X`，所以金额位的 0 只会长成这两种样子。
    expect(JSON.stringify(allUnknown)).not.toMatch(/amount=0(?!\.\d*[1-9])/)
    expect(allUnknown.price?.total).toBeUndefined()

    // 混合：有一镜算得出、一镜算不出 —— 合计仍然不许印（那个数不是合计），
    // 而算不出的那一行印的是「暂时算不出价格」，不是 ¥0。
    const mixed = projectSpendCard(pending([shot(1, 0.5), shot(2, null)]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(mixed.price?.total).toBeUndefined()
    expect(mixed.price?.unavailable).toBe('agentPanelV4.spendParamsUnavailable')
    expect(JSON.stringify(mixed)).not.toMatch(/amount=0(?!\.\d*[1-9])/)
  })

  it('多镜整齐：不出逐镜折叠口（把同一句话抄 N 遍没有信息量）', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.3)]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(data.price?.perItem).toBeUndefined()
    expect(data.pager).toMatchObject({ index: 0, total: 2 })
  })

  it('多镜不整齐：算式退成「逐镜不同」并摊开每一行', () => {
    const data = projectSpendCard(pending([shot(1, 0.5), shot(2, 0.3)]), { page: 1, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(data.price?.breakdown).toContain('spendParamsBreakdownMixed')
    expect(data.price?.perItem).toHaveLength(2)
    // 翻到第 2 页时**主按钮**印的是那一页的价，不是第一页的（这一下花多少）。
    expect(data.confirmLabel).toContain('¥0.30')
    // 页脚左下印的是**整单合计**，带镜数——逐镜确认时用户始终看得见整单要花多少。
    // 两格说的是两件事，所以这里两个数不一样才是对的（0.30 vs 0.80）。
    expect(data.totalLead).toBe('agentPanelV4.spendTotalLeadBatch(count=2,amount=¥0.80)')
  })

  it('切到「全部」：主按钮改口印合计，动作行仍然只有一颗填色按钮', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.3)]), { page: 0, scope: 'all' }, t, { locale: 'zh-CN' })!
    expect(data.pager?.scope?.value).toBe('all')
    expect(data.confirmLabel).toBe('agentPanelV4.spendParamsConfirmAll(count=2,amount=¥0.60)')
    // 「全部」档下按钮与左下是同一个数（这一下 = 整单）。
    expect(data.totalLead).toBe('agentPanelV4.spendTotalLeadBatch(count=2,amount=¥0.60)')
    expect(data.alternateLabel).toBeUndefined()
  })

  it('翻页越界回环：卡永远停在一个真实存在的镜头上', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.4)]), { page: -1, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(data.pager?.index).toBe(1)
  })

  it('「Nomi 选的」是现算的：用户换过模型之后这句话就消失', () => {
    const kept = projectSpendCard(pending([shot(1, 0.3, 'kling')]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN', agentPickedModelIds: ['kling'] })!
    expect(kept.badge).toContain('spendParamsModelPicked')
    const changed = projectSpendCard(pending([shot(1, 0.3, 'seedance')]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN', agentPickedModelIds: ['kling'] })!
    expect(changed.badge).not.toContain('spendParamsModelPicked')
  })

  it('图片单说图片、视频单才说视频——付钱前那一刻不许让人怀疑它搞错了', () => {
    const image = projectSpendCard(pending([{ ...shot(1, 0.3), mode: 'text_to_image' }]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(image.title).toContain('spendParamsTitleImage')
    const video = projectSpendCard(pending([{ ...shot(1, 0.3), mode: 'image_to_video' }]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(video.title).toContain('spendParamsTitle(')
  })

  it('没有镜头就不出卡', () => {
    expect(projectSpendCard(pending([]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })).toBeUndefined()
  })
})

describe('节点 → 候选补丁', () => {
  const base = shot(1, 0.3)
  function node(meta: Record<string, unknown>, prompt = '镜头 1'): GenerationCanvasNode {
    return {
      id: 'node-1', kind: 'video', categoryId: 'shots', title: '镜头 1', prompt,
      position: { x: 0, y: 0 }, size: { width: 340, height: 192 }, status: 'idle',
      meta: { modelKey: 'kling', modelVendor: 'kie', archetype: { id: 'kling', modeId: undefined }, duration: '3', ...meta },
    } as GenerationCanvasNode
  }

  it('一个字都没改 → 不发命令（防抖之外的第二道闸：空改动不推进 planVersion）', () => {
    expect(candidatePatchFromNode(node({}), base)).toBeUndefined()
  })

  it('改时长 → 参数整组带过去（候选认识的键才带，不另立第二份词表）', () => {
    const patch = candidatePatchFromNode(node({ duration: '5' }), base)!
    expect(patch.parameters).toEqual({ duration: '5' })
    expect(patch.prompt).toBeUndefined()
  })

  it('改提示词 / 换模型 → 各自单独进补丁', () => {
    expect(candidatePatchFromNode(node({}, '六棱柱'), base)).toEqual({ prompt: '六棱柱' })
    const swapped = candidatePatchFromNode(node({ modelKey: 'seedance', modelVendor: 'apimart' }), base)!
    expect(swapped).toMatchObject({ modelId: 'seedance', providerId: 'apimart' })
  })

  it('节点上没有的参数键回落候选原值，不把它抹成 undefined', () => {
    const patch = candidatePatchFromNode(node({ duration: undefined, modelKey: 'seedance' }), base)!
    expect(patch.parameters).toBeUndefined()
    expect(patch.modelId).toBe('seedance')
  })
})

describe('「N 镜」汇总只在多镜时出现', () => {
  it('单镜：标题已经说了「这 1 段」，正文下不再印一行「1 镜」', () => {
    const data = projectSpendCard(pending([shot(1, 0.3)]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(data.price?.breakdown).toBe('')
  })
  it('多镜且整齐：页脚左下已经是「N 镜 · 合计」，正文下不再重复一行「N 镜」', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.3)]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(data.price?.breakdown).toBe('')
    expect(data.totalLead).toContain('count=2')
  })
  it('多镜但报不出合计：页脚那句没有镜数，所以正文下补一句「N 镜」', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, null)]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(data.price?.breakdown).toContain('spendParamsBreakdownNoUnit')
    expect(data.totalLead).toBe('agentPanelV4.spendTotalUnknown')
  })
})

describe('页脚左下只印主按钮说不出的那件事', () => {
  it('单镜且报得出价：左下**留空**——主按钮上已经是同一个数', () => {
    const data = projectSpendCard(pending([shot(1, 0.3)]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(data.totalLead).toBeUndefined()
    expect(data.confirmLabel).toContain('¥0.30')
  })
  it('多镜：左下「N 镜 · 合计」，主按钮印这一下实际会花的数', () => {
    const each = projectSpendCard(pending([shot(1, 0.5), shot(2, 0.3)]), { page: 1, scope: 'each' }, t, { locale: 'zh-CN' })!
    expect(each.totalLead).toContain('count=2')
    expect(each.totalLead).toContain('¥0.80')
    expect(each.confirmLabel).toContain('¥0.30')
    const all = projectSpendCard(pending([shot(1, 0.5), shot(2, 0.3)]), { page: 1, scope: 'all' }, t, { locale: 'zh-CN' })!
    expect(all.confirmLabel).toContain('¥0.80')
  })
})

describe('算不出价**绝不拦**生成（2026-09-21 用户硬性拍板）', () => {
  it('没有价时页脚印一整句话，不是 ¥0，而且主按钮照常给得出来', () => {
    const data = projectSpendCard(pending([shot(1, null)]), { page: 0, scope: 'each' }, t, { locale: 'zh-CN' })!
    // 三种可能（免费 / 算不出 / 真的零元）里，印 0 恰好是唯一会让用户
    // 误以为「这次不花钱」的那一种。
    expect(data.totalLead).toBe('agentPanelV4.spendTotalUnknown')
    expect(data.totalLead).not.toContain('0')
    // 按钮**存在且有文案** —— 「算不出价格就不让生成」那条闸已经被用户否掉：
    // 「不能因为这个拦截其他任何东西，我们现在都没有建立价格的标尺」。
    expect(data.confirmLabel).toBe('agentPanelV4.spendParamsConfirmUnknown')
  })
})

