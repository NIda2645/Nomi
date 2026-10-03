// 付费卡上一下没做成时说哪一句（2026-09-30 付费卡① 第 11 条：失败只给存在的出路）。
//
// ── 它在解决哪个真实摩擦 ──
//
// 用户点「仍要生成」，弹两次「这一步没成……可以改一下再按一次」，可卡上什么都改不了（那张卡的种类自相矛盾，
// 卡体是锁着的）。那句话许诺了一条不存在的出路，用户只能再按、再看同一句话。
//
// 现在说哪一句只看两样事实：
//   ① 宿主回的那一下的结果——账本说「可能已经发出去」（结果未知，先去核对）还是「没发起」，
//      没发起的话是哪一种（`failure`，与重做 / 续拍同一个闭集：窗口弹不出确认、供应商没接好、项目刚变了……）；
//   ② 卡此刻能不能改（`editable`）。
// 「可以改一下再按一次」只在**认不出是哪一种、而卡确实能改**时出现；卡改不了就说改不了、该怎么办。
import type { TranslationKey } from '../../../i18n/translationKey'
import type { ProductionActionResult } from '../../production/productionRunApi'
import { SHOT_ACTION_FAILURE_COPY } from '../../production/productionShotActions'

/** 宿主回的那一下（IPC 抛出来的那一种没有结果，传 `undefined`）。 */
export type SpendActionOutcome = Partial<Pick<ProductionActionResult, 'ok' | 'code' | 'message' | 'failure'>>

const CARD_CHANGED = new Set(['generation_quote_changed'])
const SHOT_GONE = new Set(['generation_scope_invalid', 'generation_shot_not_found'])

/**
 * 这一下没做成时卡上弹的那一句。
 *
 * 判序是有意的：先认「可能已经发出去」（钱的事实压过一切，说成「没花钱」是最贵的一种错），
 * 再认宿主点名的那几种，最后才落到「改一下再按」——而它只在卡能改时出现。
 */
export function spendActionFailureCopy(outcome: SpendActionOutcome | undefined, editable: boolean): TranslationKey {
  // 调用本身抛了（桥断了 / 主进程回了个拒绝）：不知道走到了哪一步，按「结果未知」说，让他先去核对再按。
  if (!outcome) return 'agentPanelV4.spendActionFailed'
  const message = outcome.message ?? ''
  if (message === 'generation_execution_failed') return 'agentPanelV4.spendActionFailed'
  if (CARD_CHANGED.has(message)) return 'agentPanelV4.spendActionCardChanged'
  if (SHOT_GONE.has(message) || message.startsWith('no pending generation')) return 'agentPanelV4.spendActionShotGone'
  if (outcome.code === 'run_not_open' || message === 'run_not_open') return SHOT_ACTION_FAILURE_COPY.run_not_open
  if (outcome.code === 'unavailable') return SHOT_ACTION_FAILURE_COPY.core_starting
  if (outcome.failure && outcome.failure !== 'internal_error') return SHOT_ACTION_FAILURE_COPY[outcome.failure]
  return editable ? 'agentPanelV4.spendActionNotStarted' : 'agentPanelV4.spendActionNotStartedLocked'
}
