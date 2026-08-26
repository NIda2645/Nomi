export type ViewportAnimationSettlementOutcome = 'completed' | 'cancelled'

export type ViewportAnimationSettlement = {
  settle: (outcome: ViewportAnimationSettlementOutcome) => boolean
}

/**
 * 一段视口动画只允许结算一次：自然跑完与被下一条视口命令取消是互斥终态。
 * 旧调用方不传回调时仍走同一生命周期，只是不通知外部。
 */
export function createViewportAnimationSettlement(
  onSettled?: (outcome: ViewportAnimationSettlementOutcome) => void,
): ViewportAnimationSettlement {
  let settled = false
  return {
    settle(outcome) {
      if (settled) return false
      settled = true
      onSettled?.(outcome)
      return true
    },
  }
}
