import { HumanApprovalRequiredError } from '../capabilityCore/approvalReceipt'
import { projectAgentApprovalPolicyOf, type ProjectAgentApprovalPolicy } from '../shared/agentCapabilities/capabilityApprovalPolicy'
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

/**
 * **两套词表之间唯一的那座桥**（2026-09-21）。
 *
 * 用户只在一个地方表达过「Nomi 还问不问我」：Agent 面板上的权限档（每步问 / 自动改 / 全自动，
 * 词表 `ProjectAgentApprovalPolicy`）。Run 这一侧另有一套 `TrustLevel`，而两者之间此前**没有任何
 * 转换函数**（第一轮横扫 B3 的原始发现）：`policyResolver()` 不产出 trustLevel，`normalizeTrustLevel`
 * 于是恒给 `key_confirm`，外部入口要不到「全自动」，只能靠调用方在请求体里自报——那条路已经在
 * 2026-09-21 被 `assertCallerDeclaredTrustLevel` 堵死了，堵完之后就再也没有任何办法表达「全自动」。
 *
 * 所以档位只能**派生**，不能各答一次：
 *   · `step`（每步都问）   → `confirm_all`：每镜提交给供应商前都在 Nomi 停下。
 *   · `safe-auto`（自动改） → `key_confirm`：默认档，方向门与样片门都停。
 *   · `project`（全自动）   → `budget_only`：跳过创意门与样片门，只留预算门与不可逆动作。
 *
 * `spend` 那根轴**故意不参与**：它今天没有预算撑着（见 `capabilityApprovalPolicy.spendDecidedByPolicy`
 * 的说明），拿它去放松 Run 的门等于用一张没有额度的通行证开门。钱门在任何档位都不跳
 * （`productionRunService` 的 `autoApproveGate` 对 `isSpendGate` 硬抛）。
 */
export function trustLevelFromApprovalPolicy(policy: ProjectAgentApprovalPolicy | undefined): TrustLevel {
  switch (projectAgentApprovalPolicyOf(policy).mode) {
    case 'step': return 'confirm_all'
    case 'project': return 'budget_only'
    case 'safe-auto': return 'key_confirm'
  }
}

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
