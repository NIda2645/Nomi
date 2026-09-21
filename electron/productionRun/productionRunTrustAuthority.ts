import { HumanApprovalRequiredError } from '../capabilityCore/approvalReceipt'
import { normalizeTrustLevel, type AutomationPolicy, type TrustLevel } from './productionRunTypes'

/**
 * 信任档是「Nomi 还问不问你」，所以它只能由**你**决定。
 *
 * 三个档位按「问得多少」排序：confirm_all（每镜都问）> key_confirm（默认，停方向/样片门）>
 * budget_only（跳过创意与样片门，只管钱）。**往下 = 少问 = 需要授权；往上 = 多问 = 随便。**
 *
 * 2026-09-21 真机复现：一个只持裸 bearer 的本机进程 `production.start` 带
 * `trustLevel: 'budget_only'` → 200，回读 `production.get` 看到
 * `gate gate-direction-v1 -> approved`，`decidedAt` 就是 run 创建的那一刻——**没有任何人看见过它**。
 * 创建那条路上既没有手势章，也没有收据，连一个能问人的面都没有：档位是调用方在请求体里自己写的。
 *
 * 类根因与 `docs/fixes/2026-09-11-legacy-spend-door.root-cause.json` 同形：一条不变量由两扇证据标准
 * 不同的门守着，弱的那扇接受调用方自己的话。这里弱的那扇是 `createDraft`（policy 直接来自 payload），
 * 强的那扇是 `run.control set_trust`（走 `verifyTrustGrant`，要手势章或收据）。
 *
 * 用户已拍板的规则（2026-09-21）：只有「花钱 / 撤不回 / 全自动档」这些由用户的设置或授权决定要不要问，
 * **外部入口不能靠一个参数把门批掉**。
 */
export const TRUST_LEVEL_STRICTNESS: Readonly<Record<TrustLevel, number>> = Object.freeze({
  budget_only: 0,
  key_confirm: 1,
  confirm_all: 2,
})

/** 往「少问」的方向走（= 需要一次真人答过的确认）。 */
export function isTrustDowngrade(from: TrustLevel, to: TrustLevel): boolean {
  return TRUST_LEVEL_STRICTNESS[to] < TRUST_LEVEL_STRICTNESS[from]
}

/**
 * 建 Run 时调用方声明的档位：**只许收紧，不许放松**。
 *
 * 放松要有一次真人答过的确认，而 `createDraft` 这条路上一个能问人的面都没有（没有手势章、
 * 没有收据、没有 elicitation 通道）。所以这里不是「验不了就放行」，是**拒绝并指路**：
 * 先按用户的默认档把 Run 建起来，再走 `nomi_run_control action=set_trust`——那条路会在
 * 调用方客户端或 Nomi 窗口里真的问一次人（`mcpTrustDowngrade` + `verifyTrustGrant`）。
 */
export function assertCallerDeclaredTrustLevel(
  requested: unknown,
  userPolicy: Partial<AutomationPolicy>,
): void {
  if (requested === undefined) return
  const level = normalizeTrustLevel(requested)
  const authorized = normalizeTrustLevel(userPolicy.trustLevel)
  if (!isTrustDowngrade(authorized, level)) return
  throw new HumanApprovalRequiredError(
    `Starting a run at trust level "${level}" skips checkpoints the user has not authorized. `
    + `Create the run at "${authorized}", then call run control set_trust — that path asks a human and carries the receipt.`,
  )
}
