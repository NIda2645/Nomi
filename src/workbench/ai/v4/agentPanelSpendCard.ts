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
}>

/** 这一镜的价格文本；算不出 → `undefined`（调用方据此走「算不出」那一档）。 */

/**
 * 这一单是视频还是图片。判据是候选自己的 `mode`（`text_to_image` / `image_to_video` …），
 * 不是猜的：agent 建的草稿两种都有，标题一律写「视频」会让用户在**付钱前那一刻**怀疑它搞错了。
 */
function isVideoOrder(shots: readonly PendingSpendShot[]): boolean {
  return shots.some((shot) => /video/i.test(shot.mode ?? ''))
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
    // · 多镜且整齐、报得出合计：页脚左下已经是「N 镜 · 合计 ¥X」，再印「N 镜」同样是重复；
    // · 多镜但**逐镜不同**：印「N 镜 · 逐镜不同」并带逐镜折叠口——这是页脚说不出的；
    // · 多镜但**报不出合计**：页脚是「价格未知…」那句、没有镜数，所以这里补一句「N 镜」。
    breakdown: shots.length <= 1
      ? ''
      : total === undefined
        ? t('agentPanelV4.spendParamsBreakdownNoUnit', { count: shots.length })
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
  return Object.freeze({
    kind: 'spend' as const,
    // 标题里**不印金额**：金额随参数变，两个地方印同一个数就一定有一个先漂。
    title: t(isVideoOrder(shots) ? 'agentPanelV4.spendParamsTitle' : 'agentPanelV4.spendParamsTitleImage', { count: shots.length }),
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
    // 页脚左下只在多镜且报得出合计时印「N 镜 · 合计 ¥X」；报不出价时什么都不印——「价格未知 · 以供应商账单为准」
    // 这一句随「仍要生成」一起删了（第 7 条：今天不真的钱话不说，2026-09-30）。
    ...(total !== undefined && shots.length > 1
      ? { totalLead: t('agentPanelV4.spendTotalLeadBatch', { count: shots.length, amount: money(total) }) }
      : {}),
    // 主按钮只生成这一页这一镜（第 1 条），次动作「去掉这张 / 这段」只让这一镜不生成（第 2 条）。
    // 这一镜报得出价时按钮带上这一下花多少（第 7 条：可以带，但没有任何一条路径依赖它）；报不出就只说动作。
    confirmLabel: current.price.known
      ? t(currentIsVideo ? 'agentPanelV4.spendConfirmThisVideoPriced' : 'agentPanelV4.spendConfirmThisImagePriced', { amount: money(current.price.amount) })
      : t(currentIsVideo ? 'agentPanelV4.spendConfirmThisVideo' : 'agentPanelV4.spendConfirmThisImage'),
    alternateLabel: t(currentIsVideo ? 'agentPanelV4.spendRemoveThisVideo' : 'agentPanelV4.spendRemoveThisImage'),
  })
}
