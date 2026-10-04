import type { TFunction } from 'i18next'
import type { PlanCostEstimate } from '../spend/planCostEstimate'

/**
 * 快捷动作菜单上的价格。
 *
 * 数从哪来：`estimatePlanCost`（`spend/planCostEstimate.ts`）——同一条算式（`deriveShotPrice`）、
 * 同一份目录价目，付费确认卡与批量确认条也用它。这里**不算**，只把它的结果翻成菜单上的一小段字。
 *
 * 两条铁律（2026-10-04 协调会话定的默认，样张阶段请用户确认）：
 *   · **未知不是 0**：目录里没配价目的模型（全走中转时是常态）不写 ¥0、不估一个数；
 *   · **说一次就够**：未知时不在每一项后面重复「价格以服务商为准」，菜单底部统一一行。
 *     每一项都写一遍 = 让创作者每次多读五六遍同一句话。
 */
export type QuickActionPrice = { known: true; credits: number } | { known: false }

export function quickActionPriceFromEstimate(estimate: PlanCostEstimate | null): QuickActionPrice {
  if (!estimate || !estimate.known) return { known: false }
  return { known: true, credits: estimate.credits }
}

/** 这一项右侧的短字；价格未知时返回 undefined（不占位，见上面第二条）。 */
export function quickActionPriceTrailing(price: QuickActionPrice | undefined, t: TFunction): string | undefined {
  if (!price || !price.known) return undefined
  return t('generationCommon.quickActions.price.known', { credits: price.credits })
}

/** 菜单里只要有一项价格未知，底部就出那一行说明；全都已知就不出。 */
export function quickActionPriceNote(prices: readonly (QuickActionPrice | undefined)[], t: TFunction): string | undefined {
  return prices.some((price) => !price || !price.known) ? t('generationCommon.quickActions.price.unknown') : undefined
}
