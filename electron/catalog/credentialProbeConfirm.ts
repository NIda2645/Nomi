// 「这次验证会花钱，先问一句」——凭据探测的确认面（T-MO-10，用户 2026-09-22 拍板）。
//
// 为什么不是新造一张卡：全仓的付费确认只有一张（`useSpendConfirmStore`，见
// `src/workbench/capability/capabilityApplyHandler.ts` 的 `confirmSpendFromMainProcess`），
// 主进程侧的入口也只有一条（`requestRendererDecision('spend.confirm', …)`）。这里走同一条，
// 只多带一个 `intent: 'credential-probe'` 让卡上说清「这是一次验证请求」而不是「要生成什么」。
//
// 为什么**不铸令牌**：`confirmSpendAndMintGrant` 那条链的下游是 `runTask` 的硬闸——令牌按
// 节点记预算、由生成调用消费。凭据探测不经 `runtime.ts`、没有节点，铸一颗没人消费的令牌
// 只会在预算账上留一笔假的授权。所以这里只用同一个**报价 owner**（`quoteSpendLine`）算钱、
// 问同一张卡，不碰 grant。
//
// 金额如实：`quoteSpendLine` 算不出价时回 `amount: null`，卡上按「未知价」显示——**不许**
// 在这一层把它兜底成 0 或者「免费」，那正是 T-MO-25 记着的那种不诚实。
import { requestRendererDecision } from '../capabilityCore/rendererBridge'
import { quoteSpendLine } from '../spendQuote'
import type { SpendQuote } from '../shared/contracts/spendQuote'

export type CredentialProbeSpendRequest = {
  vendorKey: string
  /** 卡上显示的供应商名（缺省用 vendorKey）。 */
  vendorName?: string
  /** 这次探测会打到哪个模型上（报价按它算）。 */
  modelKey: string
}

/**
 * 弹卡问人：这次「保存验证」要发一次可能计费的请求，发不发。
 *
 * 真人点确认才回 `true`；没点 / 窗口没了 / 渲染层不可达 → `false`（fail-closed：**不发**）。
 * 刻意不抛：调用方要的答案只有「能不能发」，问不到人时的正确行为是不发，而不是把接入页
 * 弄成一条死路——密钥照样存得下，只是标成未验证。
 */
export async function confirmCredentialProbeSpend(request: CredentialProbeSpendRequest): Promise<boolean> {
  const line = quoteSpendLine({ vendorKey: request.vendorKey, modelKey: request.modelKey })
  const quote: SpendQuote = { lines: [line], amount: line.amount }
  try {
    const reply = (await requestRendererDecision('spend.confirm', {
      intent: 'credential-probe',
      vendor: request.vendorName || request.vendorKey,
      modelKey: line.modelKey,
      quote: line,
      // 一次验证 = 一次调用。说出这个数，用户才知道自己批的是「一下」而不是「一批」。
      callCount: quote.lines.length,
    })) as { confirmed?: boolean } | null
    return reply?.confirmed === true
  } catch {
    // 渲染层不可达（`RendererUnavailableError`）等于「没人可问」。没人可问就不花钱。
    return false
  }
}
