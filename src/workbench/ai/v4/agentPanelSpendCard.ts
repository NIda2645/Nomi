// 付费确认卡的**纯投影**：宿主给的那笔待确认生成 → 介入槽的 `InterventionData`。
//
// 为什么单独一层：这张卡上每一个数都必须能追到产地。住在组件里就只能靠截图证明「印对了没有」，
// 住在这里能逐条单测——而这是**钱**的卡，印错一个数的代价不是难看。
//
// 三条印数纪律（`docs/research/2026-09-10-permission-rework-prior-art/prior-art.md` 1-4/1-5）：
//   ① 价格来自宿主投影（目录里的 `model.pricing`），渲染层不从参数反推；
//   ② 算不出就印「暂时算不出价格」，**绝不落成 ¥0**——三种可能里只有它会被读成「这次免费」；
//   ③ 算式只印我们真的算过的东西。目录的价目是「基价 + 命中的规格加价」，**不是**「每秒单价 × 时长」，
//      所以这里印的是「N 镜」而不是「N 镜 × 3s · ¥0.10/秒」。后者要等目录长出按秒计价才成立，
//      在那之前印它就是编一个不存在的算法（样张上那句是报价桩，不是我们的价目模型）。
import { formatMoney } from './formatMoney'
import type { PendingSpendConfirm, PendingSpendShot } from '../../../desktop/productionRunBridgeTypes'
import type { InterventionData } from './agentPanelV4Types'

type Translate = (key: string, options?: Record<string, unknown>) => string

export type SpendCardView = Readonly<{
  page: number
  /**
   * 「生成剩下 N 张」正在一张一张走（2026-10-02）：`total` 是点下去那一刻卡上那一叠，`current` 是正在发的第几张，
   * `stopping` = 用户已经点了 ×、宿主还没停稳。缺席 = 卡在等人点。
   */
  batch?: Readonly<{ current: number; total: number; stopping: boolean }>
}>

/** 这一镜的价格文本；算不出 → `undefined`（调用方据此走「算不出」那一档）。 */

/**
 * 这一单是视频还是图片：只读宿主给的 `kind`（2026-09-30 第 9 条）。它和画布节点、派发读的是同一个答案；
 * 以前这里自己去解读 `mode` 字符串，卡体却读模型目录、画布读另一种写法，于是标题说视频、卡体是图片模型。
 */
function isVideoOrder(shots: readonly PendingSpendShot[]): boolean {
  return shots.some((shot) => shot.kind === 'video')
}

/**
 * 这一叠说「图片 · 张」还是「视频 · 段」：标题、「生成剩下 N 张 / 段」、翻页行右端的「N 张 · 合计」**只读这一个**
 * （有视频就说视频，2026-10-01 用户拍板合计行也跟它走）。三处各自判一次，迟早有一处先漂。
 */
function orderWording(shots: readonly PendingSpendShot[]) {
  return isVideoOrder(shots)
    ? { title: 'agentPanelV4.spendParamsTitle', remaining: 'agentPanelV4.spendConfirmRemainingVideo', totalLead: 'agentPanelV4.spendTotalLeadVideo', progress: 'agentPanelV4.spendBatchProgressVideo', stopped: 'agentPanelV4.spendBatchStoppedVideo' } as const
    : { title: 'agentPanelV4.spendParamsTitleImage', remaining: 'agentPanelV4.spendConfirmRemainingImage', totalLead: 'agentPanelV4.spendTotalLeadImage', progress: 'agentPanelV4.spendBatchProgressImage', stopped: 'agentPanelV4.spendBatchStoppedImage' } as const
}

/**
 * 「生成剩下 N 张」被停下时那一句（「发出了 K 张，剩下 N−K 张没发」）用哪个键：张 / 段跟卡标题同一条规则，
 * 读点下去那一刻卡上那一叠（卡这时已经关了）。
 */
export function spendBatchStoppedKey(shots: readonly PendingSpendShot[]): 'agentPanelV4.spendBatchStoppedVideo' | 'agentPanelV4.spendBatchStoppedImage' {
  return orderWording(shots).stopped
}

/** 每一镜都有价、且都是同一个数 = 「整齐」。不整齐时算式退成「逐镜不同」。 */
function isUniform(shots: readonly PendingSpendShot[]): boolean {
  const first = shots[0]?.price
  if (!first?.known) return false
  return shots.every((shot) => shot.price.known && shot.price.amount === first.amount)
}

export function spendCardPage(pending: PendingSpendConfirm, page: number): number {
  if (pending.shots.length === 0) return 0
  return ((page % pending.shots.length) + pending.shots.length) % pending.shots.length
}

/**
 * 卡上要印的一切。`undefined` = 这笔待确认里一镜都没有（不该出卡）。
 *
 * 「Nomi 选的」是**现算**的：这些候选本来就是 agent 挑的模型，用户一旦在卡上换了模型，
 * 下一次投影里的 `modelId` 就变了，那句话跟着消失——不会留在卡上变成一句假话。
 */
export function projectSpendCard(
  pending: PendingSpendConfirm,
  view: SpendCardView,
  t: Translate,
  /**
   * `locale` **必填**：金额怎么印跟着界面语言走（`formatMoney`）。做成必填是因为漏传不会报错、
   * 只会悄悄按某个默认语言印——那种分歧只有换了语言的用户看得见。
   */
  options: Readonly<{ locale: string; agentPickedModelIds?: readonly string[] }>,
): InterventionData | undefined {
  const shots = pending.shots
  const money = (amount: number): string => formatMoney(options.locale, pending.currency, amount)
  if (shots.length === 0) return undefined
  const index = spendCardPage(pending, view.page)
  const current = shots[index]
  const total = pending.unknownShotCount === 0 ? pending.knownSubtotal : undefined
  const uniform = isUniform(shots)
  // 按钮只说这一镜（第 1 条）：视频是「这段」，图片是「这张」——看的是这一页这一镜自己的 mode。
  const currentIsVideo = isVideoOrder([current])
  const picked = options.agentPickedModelIds
  const pickedByAgent = picked ? picked.includes(current.modelId) : true
  const badge = pickedByAgent
    ? `${t('agentPanelV4.slotSpendBadge')} · ${t('agentPanelV4.spendParamsModelPicked')}`
    : t('agentPanelV4.slotSpendBadge')
  const price: NonNullable<InterventionData['price']> = {
    // 正文下那一行只在它**说得出页脚说不出的事**时才印（由数据 derive，不写死）：
    // · 单镜：标题已经写着「生成这 1 段视频？」，再印「1 镜」是把同一件事说两遍；
    // · 多镜且整齐、报得出合计：翻页行右端已经是「N 张 / 段 · 合计 ¥X」，再印「N 镜」同样是重复；
    // · 多镜但**逐镜不同**：印「N 镜 · 逐镜不同」并带逐镜折叠口——这是页脚说不出的；
    // · 多镜但**报不出合计**：什么都不印。以前这里补一句「N 镜」，因为页脚那句「价格未知…」没有镜数；
    //   那句随「仍要生成」删了，标题和「生成剩下 N 张」都已经说了几张，再印一行就是第三遍（2026-10-01 样张没有这一行）。
    breakdown: shots.length <= 1
      ? ''
      : total === undefined
        ? ''
        : uniform
          ? ''
          : t('agentPanelV4.spendParamsBreakdownMixed', { count: shots.length }),
    // 报不出价时什么都不印（第 7 条：今天不真的钱话不说）。报得出时照实印合计。
    ...(total === undefined ? {} : { totalLabel: t('agentPanelV4.spendParamsTotalLabel'), total: money(total) }),
    // 逐镜摊开只在「不整齐」时才有信息量：整齐时每一行都是同一个数，摊开等于把同一句话抄 N 遍。
    ...(total !== undefined && shots.length > 1 && !uniform
      ? {
          perItemLabel: t('agentPanelV4.spendParamsPerItem', { count: shots.length }),
          perItem: shots.map((shot) => ({
            label: t('agentPanelV4.spendParamsShot', { number: shot.index }),
            amount: shot.price.known
              ? money(shot.price.amount)
              : t('agentPanelV4.spendParamsUnavailable'),
          })),
        }
      : {}),
  }
  const wording = orderWording(shots)
  const batch = view.batch
  if (batch) {
    // 「生成剩下 N 张」在一张一张走（2026-10-02）：卡不能装成还在等人点——标题说进度，动作行只说怎么停，
    // 不摆「去掉这张 / 生成这张」、翻页和合计（正在被自动批的那几张谁也点不了）。右上那颗 × 就是停下。
    return Object.freeze({
      kind: 'spend' as const,
      title: batch.stopping ? t('agentPanelV4.spendBatchStopping') : t(wording.progress, { current: batch.current, total: batch.total }),
      badge,
      progress: { hint: t(batch.stopping ? 'agentPanelV4.spendBatchStoppingHint' : 'agentPanelV4.spendBatchStopHint') },
    })
  }
  return Object.freeze({
    kind: 'spend' as const,
    // 标题里**不印金额**：金额随参数变，两个地方印同一个数就一定有一个先漂。
    title: t(wording.title, { count: shots.length }),
    badge,
    ...(shots.length > 1
      ? {
          pager: {
            index,
            total: shots.length,
            keyHint: t('agentPanelV4.pagerKeyHint'),
          },
        }
      : {}),
    price,
    // 「N 张 · 合计 ¥X」只在多镜且报得出合计时印（住在翻页那一行的右端）；报不出价时什么都不印——
    // 「价格未知 · 以供应商账单为准」这一句随「仍要生成」一起删了（第 7 条：今天不真的钱话不说，2026-09-30）。
    // 单位跟标题同一条规则（2026-10-01 用户拍板：图片说张、视频说段，英文与标题同词）。
    ...(total !== undefined && shots.length > 1
      ? { totalLead: t(wording.totalLead, { count: shots.length, amount: money(total) }) }
      : {}),
    // 整叠的动作「生成剩下 N 张 / 段」（2026-10-01 用户拍板）：N 就是卡上还没决定的镜（= 标题那个数，去掉的不算），
    // 张 / 段跟标题同一条规则（有视频就说段）；报得出价也不带合计（翻页行右端已经印着这个数）。
    // 只剩 1 张时它和「生成这张」是同一件事，不画。
    ...(shots.length > 1
      ? { batchLabel: t(wording.remaining, { count: shots.length }) }
      : {}),
    // 主按钮只生成这一页这一镜（第 1 条），次动作「去掉这张 / 这段」只让这一镜不生成（第 2 条）。
    // 这一镜报得出价时按钮带上这一下花多少（第 7 条：可以带，但没有任何一条路径依赖它）；报不出就只说动作。
    confirmLabel: current.price.known
      ? t(currentIsVideo ? 'agentPanelV4.spendConfirmThisVideoPriced' : 'agentPanelV4.spendConfirmThisImagePriced', { amount: money(current.price.amount) })
      : t(currentIsVideo ? 'agentPanelV4.spendConfirmThisVideo' : 'agentPanelV4.spendConfirmThisImage'),
    alternateLabel: t(currentIsVideo ? 'agentPanelV4.spendRemoveThisVideo' : 'agentPanelV4.spendRemoveThisImage'),
  })
}
