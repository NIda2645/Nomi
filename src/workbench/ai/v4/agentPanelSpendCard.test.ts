import { describe, expect, it } from 'vitest'

import { projectSpendCard, spendBatchStoppedKey } from './agentPanelSpendCard'
import { candidatePatchFromNode } from './spendCardDraft'
import type { PendingSpendConfirm } from '../../../desktop/productionRunBridgeTypes'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'

// 卡上每一个数都要能追到产地。这一组钉的是「印错了会怎样」而不是「长什么样」：
// 印 ¥0 会被读成免费、标题印金额会和价格行漂。2026-09-30 付费卡逐镜：主按钮只生成这一页这一镜、
// 次动作只去掉这一镜；「仍要生成」「价格未知 · 以供应商账单为准」和「逐镜 / 全部」切换都删了（今天不真的钱话不说）。

const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key}(${Object.entries(options).map(([k, v]) => `${k}=${String(v)}`).join(',')})` : key

/** 一镜。`kind` 是宿主给的那一格（`generationShotKind`）——卡只读它，不再自己去解读 `mode`。 */
function shot(index: number, amount: number | null, modelId = 'kling', kind: 'image' | 'video' = 'image') {
  return {
    shotId: `s${index}`,
    nodeId: `node-${index}`,
    index,
    prompt: `镜头 ${index}`,
    providerId: 'kie',
    modelId,
    kind,
    mode: kind === 'video' ? 'text_to_video' : 'text_to_image',
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
  it('单镜：没有翻页器；主按钮「生成这张」（报得出价时带上这一下花多少），次动作「去掉这张」', () => {
    const data = projectSpendCard(pending([shot(1, 0.3)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.kind).toBe('spend')
    expect(data.pager).toBeUndefined()
    expect(data.confirmLabel).toBe('agentPanelV4.spendConfirmThisImagePriced(amount=¥0.30)')
    expect(data.alternateLabel).toBe('agentPanelV4.spendRemoveThisImage')
    expect(data.price?.total).toContain('¥0.30')
  })

  it('标题里不印金额：金额随参数变，两处印同一个数一定有一个先漂', () => {
    const data = projectSpendCard(pending([shot(1, 0.3)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.title).toBe('agentPanelV4.spendParamsTitleImage(count=1)')
    expect(data.title).not.toContain('0.30')
  })

  it('报不出价：不印任何价格的话（没有「价格未知」那句、没有 ¥0），主按钮照样是「生成这张」', () => {
    const data = projectSpendCard(pending([shot(1, null), shot(2, null)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.price?.total).toBeUndefined()
    expect(data.price?.unavailable).toBeUndefined()
    expect(data.totalLead).toBeUndefined()
    expect(JSON.stringify(data)).not.toContain('¥0.00')
    expect(JSON.stringify(data)).not.toContain('spendTotalUnknown')
    expect(data.confirmLabel).toBe('agentPanelV4.spendConfirmThisImage')
  })

  // 2026-09-21 未知价开闸之后这张卡是**真能按下去**的（从前按下去必然失败）。所以「屏上不出现
  // 任何代表未知的 0」从一条显示纪律升级成了一条花钱纪律：用户会照着它做花钱的决定。
  it('报不出价：整张卡序列化后找不到任何金额位的 0（混合批次也一样）', () => {
    const allUnknown = projectSpendCard(pending([shot(1, null), shot(2, null)]), { page: 0 }, t, { locale: 'zh-CN' })!
    // t() 把金额渲染成 `amount=X`，所以金额位的 0 只会长成这两种样子。
    expect(JSON.stringify(allUnknown)).not.toMatch(/amount=0(?!\.\d*[1-9])/)
    expect(allUnknown.price?.total).toBeUndefined()

    // 混合：有一镜算得出、一镜算不出 —— 合计仍然不许印（那个数不是合计），
    // 而算不出的那一行印的是「暂时算不出价格」，不是 ¥0。
    const mixed = projectSpendCard(pending([shot(1, 0.5), shot(2, null)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(mixed.price?.total).toBeUndefined()
    expect(mixed.price?.unavailable).toBeUndefined()
    expect(JSON.stringify(mixed)).not.toMatch(/amount=0(?!\.\d*[1-9])/)
  })

  it('多镜整齐：不出逐镜折叠口（把同一句话抄 N 遍没有信息量）', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.3)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.price?.perItem).toBeUndefined()
    expect(data.pager).toMatchObject({ index: 0, total: 2 })
  })

  it('多镜不整齐：算式退成「逐镜不同」并摊开每一行', () => {
    const data = projectSpendCard(pending([shot(1, 0.5), shot(2, 0.3)]), { page: 1 }, t, { locale: 'zh-CN' })!
    expect(data.price?.breakdown).toContain('spendParamsBreakdownMixed')
    expect(data.price?.perItem).toHaveLength(2)
    // 主按钮只生成这一页这一镜，带的是**这一镜**的价（这一下花多少）；没有任何一条路径依赖它。
    expect(data.confirmLabel).toBe('agentPanelV4.spendConfirmThisImagePriced(amount=¥0.30)')
    // 页脚左下印的是**整单合计**，带镜数——逐镜确认时用户始终看得见整单要花多少。
    // 两格说的是两件事，所以这里两个数不一样才是对的（0.30 vs 0.80）。
    expect(data.totalLead).toBe('agentPanelV4.spendTotalLeadImage(count=2,amount=¥0.80)')
  })

  it('没有「全部」：翻页器旁不再有范围切换，每一页都只有「生成这张 / 这段」和「去掉这张 / 这段」', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.3, 'kling', 'video')]), { page: 1 }, t, { locale: 'zh-CN' })!
    expect(data.pager).toMatchObject({ index: 1, total: 2 })
    expect(JSON.stringify(data.pager)).not.toContain('scope')
    expect(data.confirmLabel).toBe('agentPanelV4.spendConfirmThisVideoPriced(amount=¥0.30)')
    expect(data.alternateLabel).toBe('agentPanelV4.spendRemoveThisVideo')
  })

  it('翻页越界回环：卡永远停在一个真实存在的镜头上', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.4)]), { page: -1 }, t, { locale: 'zh-CN' })!
    expect(data.pager?.index).toBe(1)
  })

  it('「Nomi 选的」是现算的：用户换过模型之后这句话就消失', () => {
    const kept = projectSpendCard(pending([shot(1, 0.3, 'kling')]), { page: 0 }, t, { locale: 'zh-CN', agentPickedModelIds: ['kling'] })!
    expect(kept.badge).toContain('spendParamsModelPicked')
    const changed = projectSpendCard(pending([shot(1, 0.3, 'seedance')]), { page: 0 }, t, { locale: 'zh-CN', agentPickedModelIds: ['kling'] })!
    expect(changed.badge).not.toContain('spendParamsModelPicked')
  })

  it('图片单说图片、视频单才说视频——付钱前那一刻不许让人怀疑它搞错了', () => {
    const image = projectSpendCard(pending([shot(1, 0.3)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(image.title).toContain('spendParamsTitleImage')
    const video = projectSpendCard(pending([shot(1, 0.3, 'kling', 'video')]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(video.title).toContain('spendParamsTitle(')
  })

  // 第 9 条：标题、按钮都只读宿主给的那一格。`mode` 字符串怎么写都不该让卡改口——
  // 以前卡读 `mode`、卡体读模型目录、画布读节点种类，于是标题说视频、卡体是图片模型。
  it('图还是视频只读宿主给的 kind：mode 字符串里有 video 也不改口', () => {
    const data = projectSpendCard(pending([{ ...shot(1, 0.3), mode: 'image_to_video_legacy' }]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.title).toBe('agentPanelV4.spendParamsTitleImage(count=1)')
    expect(data.confirmLabel).toContain('spendConfirmThisImage')
  })

  it('没有镜头就不出卡', () => {
    expect(projectSpendCard(pending([]), { page: 0 }, t, { locale: 'zh-CN' })).toBeUndefined()
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

  it('数组参数按值比：节点上那一份和候选里那一份不是同一个对象，没动过就不发命令（点「生成这张」不白推一版计划）', () => {
    const withArray = { ...base, parameters: { ...base.parameters, image_urls: ['https://example.test/a.png'] } }
    expect(candidatePatchFromNode(node({ image_urls: ['https://example.test/a.png'] }), withArray)).toBeUndefined()
    expect(candidatePatchFromNode(node({ image_urls: ['https://example.test/b.png'] }), withArray)?.parameters)
      .toMatchObject({ image_urls: ['https://example.test/b.png'] })
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

describe('「生成剩下 N 张 / 段」（2026-10-01 用户拍板）', () => {
  it('2 张：从第 1 页起就在，写明张数；N 就是标题那个数', () => {
    const data = projectSpendCard(pending([shot(1, null), shot(2, null)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.batchLabel).toBe('agentPanelV4.spendConfirmRemainingImage(count=2)')
    expect(data.title).toContain('count=2')
  })

  it('翻到第 2 页也还是同一颗（它管的是整叠，不是这一页）', () => {
    const data = projectSpendCard(pending([shot(1, null), shot(2, null), shot(3, null)]), { page: 2 }, t, { locale: 'zh-CN' })!
    expect(data.batchLabel).toBe('agentPanelV4.spendConfirmRemainingImage(count=3)')
  })

  it('只剩 1 张时不出现：它和「生成这张」是同一件事', () => {
    const data = projectSpendCard(pending([shot(1, null)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.batchLabel).toBeUndefined()
  })

  it('张 / 段跟标题同一条规则：有视频就说段——标题、「生成剩下」、合计行三处读同一个（2026-10-01 用户拍板合计行也跟它走）', () => {
    const data = projectSpendCard(pending([shot(1, null), shot(2, null, 'kling', 'video')]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.title).toContain('spendParamsTitle(')
    expect(data.batchLabel).toBe('agentPanelV4.spendConfirmRemainingVideo(count=2)')
    const priced = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.5, 'kling', 'video')]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(priced.title).toContain('spendParamsTitle(')
    expect(priced.totalLead).toBe('agentPanelV4.spendTotalLeadVideo(count=2,amount=¥0.80)')
  })

  it('报得出价时也不带合计：这一叠的合计已经印在翻页那一行（同一个数不说两遍）', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.3)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.batchLabel).toBe('agentPanelV4.spendConfirmRemainingImage(count=2)')
    expect(data.batchLabel).not.toContain('¥')
    expect(data.totalLead).toBe('agentPanelV4.spendTotalLeadImage(count=2,amount=¥0.60)')
  })

  it('报不出价时哪儿都不写数，也没有任何价格未知、预算之类的话', () => {
    const data = projectSpendCard(pending([shot(1, null), shot(2, null)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.totalLead).toBeUndefined()
    expect(JSON.stringify(data)).not.toMatch(/¥|Unavailable|Budget|budget|预算/)
  })
})

describe('「生成剩下 N 张」在跑（2026-10-02：卡不能装成还在等人点）', () => {
  it('标题说正在发第几张；不摆「生成这张」「去掉这张」「生成剩下」、翻页和合计；动作行只说怎么停', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.3), shot(3, 0.3)]), { page: 1, batch: { current: 2, total: 6, stopping: false } }, t, { locale: 'zh-CN' })!
    expect(data.title).toBe('agentPanelV4.spendBatchProgressImage(current=2,total=6)')
    expect(data.progress).toEqual({ hint: 'agentPanelV4.spendBatchStopHint' })
    expect(data.batchLabel).toBeUndefined()
    expect(data.pager).toBeUndefined()
    expect(data.totalLead).toBeUndefined()
  })

  it('点了 × 之后说正在停、已经发出的照常生成；张 / 段跟标题同一条规则', () => {
    const stopping = projectSpendCard(pending([shot(1, null), shot(2, null)]), { page: 0, batch: { current: 1, total: 2, stopping: true } }, t, { locale: 'zh-CN' })!
    expect(stopping.title).toBe('agentPanelV4.spendBatchStopping')
    expect(stopping.progress).toEqual({ hint: 'agentPanelV4.spendBatchStoppingHint' })
    const video = projectSpendCard(pending([shot(1, null), shot(2, null, 'kling', 'video')]), { page: 0, batch: { current: 1, total: 2, stopping: false } }, t, { locale: 'zh-CN' })!
    expect(video.title).toBe('agentPanelV4.spendBatchProgressVideo(current=1,total=2)')
    expect(spendBatchStoppedKey([shot(1, null), shot(2, null, 'kling', 'video')])).toBe('agentPanelV4.spendBatchStoppedVideo')
    expect(spendBatchStoppedKey([shot(1, null), shot(2, null)])).toBe('agentPanelV4.spendBatchStoppedImage')
  })
})

describe('「N 镜」汇总只在多镜时出现', () => {
  it('单镜：标题已经说了「这 1 段」，正文下不再印一行「1 镜」', () => {
    const data = projectSpendCard(pending([shot(1, 0.3)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.price?.breakdown).toBe('')
  })
  it('多镜且整齐：翻页行右端已经是「N 张 / 段 · 合计」，正文下不再重复一行「N 镜」', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, 0.3)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.price?.breakdown).toBe('')
    expect(data.totalLead).toContain('count=2')
  })
  it('多镜但报不出合计：页脚什么价格话都不说，正文下也不再补一句「N 镜」', () => {
    const data = projectSpendCard(pending([shot(1, 0.3), shot(2, null)]), { page: 0 }, t, { locale: 'zh-CN' })!
    // 标题和「生成剩下 N 张」都已经说了几张；正文下不再印第三遍（2026-10-01 样张没有这一行）。
    expect(data.price?.breakdown).toBe('')
    expect(data.totalLead).toBeUndefined()
  })
})

describe('页脚左下只印主按钮说不出的那件事', () => {
  it('单镜且报得出价：左下**留空**——价格行已经印着这个数', () => {
    const data = projectSpendCard(pending([shot(1, 0.3)]), { page: 0 }, t, { locale: 'zh-CN' })!
    expect(data.totalLead).toBeUndefined()
    expect(data.price?.total).toContain('¥0.30')
  })
  it('多镜且报得出合计：翻页行右端「N 张 · 合计」，主按钮只说这一镜（带这一镜的价）', () => {
    const each = projectSpendCard(pending([shot(1, 0.5), shot(2, 0.3)]), { page: 1 }, t, { locale: 'zh-CN' })!
    expect(each.totalLead).toContain('count=2')
    expect(each.totalLead).toContain('¥0.80')
    expect(each.confirmLabel).toBe('agentPanelV4.spendConfirmThisImagePriced(amount=¥0.30)')
  })
})

describe('算不出价**绝不拦**生成（2026-09-21 用户硬性拍板）', () => {
  it('没有价时不印 ¥0、也不印「价格未知」那句，而且主按钮照常给得出来', () => {
    const data = projectSpendCard(pending([shot(1, null)]), { page: 0 }, t, { locale: 'zh-CN' })!
    // 三种可能（免费 / 算不出 / 真的零元）里，印 0 恰好是唯一会让用户误以为「这次不花钱」的那一种；
    // 「价格未知 · 以供应商账单为准」随「仍要生成」一起删了（2026-09-30 第 7 条）。
    expect(data.totalLead).toBeUndefined()
    expect(JSON.stringify(data)).not.toMatch(/amount=0(?!\.\d*[1-9])/)
    // 按钮**存在且有文案** —— 「算不出价格就不让生成」那条闸已经被用户否掉：
    // 「不能因为这个拦截其他任何东西，我们现在都没有建立价格的标尺」。
    expect(data.confirmLabel).toBe('agentPanelV4.spendConfirmThisImage')
  })
})

