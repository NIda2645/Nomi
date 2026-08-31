export type ViewportAnimationSettlementOutcome = 'completed' | 'cancelled'

export type ViewportAnimationSettlement = {
  settle: (outcome: ViewportAnimationSettlementOutcome) => boolean
}

export type ViewportAnimationSettlementErrorReporter = (error: unknown) => void

function consoleReport(...args: unknown[]): void {
  try {
    console.error(...args)
  } catch {
    // Error reporting must never become a second viewport-command failure.
  }
}

function reportViewportAnimationSettlementError(error: unknown): void {
  const browserReportError = (globalThis as typeof globalThis & {
    reportError?: ViewportAnimationSettlementErrorReporter
  }).reportError
  if (typeof browserReportError === 'function') {
    browserReportError.call(globalThis, error)
    return
  }
  consoleReport('[nomi] viewport settlement callback failed:', error)
}

function safelyReportSettlementError(
  error: unknown,
  reportError: ViewportAnimationSettlementErrorReporter,
): void {
  try {
    reportError(error)
  } catch (reportingError) {
    consoleReport(
      '[nomi] viewport settlement error reporter failed:',
      reportingError,
      'Original settlement error:',
      error,
    )
  }
}

/**
 * 一段视口动画只允许结算一次：自然跑完与被下一条视口命令取消是互斥终态。
 * 旧调用方不传回调时仍走同一生命周期，只是不通知外部。
 */
export function createViewportAnimationSettlement(
  onSettled?: (outcome: ViewportAnimationSettlementOutcome) => void,
  reportError: ViewportAnimationSettlementErrorReporter = reportViewportAnimationSettlementError,
): ViewportAnimationSettlement {
  let settled = false
  return {
    settle(outcome) {
      if (settled) return false
      settled = true
      try {
        onSettled?.(outcome)
      } catch (error) {
        // Settlement notifications are best-effort UI ACKs. Report the failure,
        // but never abort the newer viewport command that cancelled this owner.
        safelyReportSettlementError(error, reportError)
      }
      return true
    },
  }
}
