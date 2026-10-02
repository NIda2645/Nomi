/**
 * 按运行记账模型健康 —— `generationRunController` 结算时用的薄封装。
 *
 * 从 controller 里搬出来：那个文件是**运行编排**，不该顺带承载记账细节（R9；它已顶到 800 行硬上限）。
 * 记账主体的定义与 [[modelHealthMemory]] 同住一处；「发给谁」怎么从节点读出来只有一份
 * （catalogTaskResolve.dispatchedAttempt），这里不再有第二份取数规则。
 */
import type { GenerationNodeRunAttempt } from '../model/generationCanvasTypes'
import { recordModelFailure, recordModelSuccess, type ModelHealthIdentity } from './modelHealthMemory'

/**
 * 记账的身份 = **这一次运行发出去的** (vendor, modelKey)，取自运行记录上的 attempt，
 * 不取「节点现在选着谁」——运行期间用户可以换模型（点提示里的「切到另一家」正是这么干的），
 * 按节点当前身份记账会让「失败」记到没失败过的那家头上，「换家优先于换模型」随即失效（2026-09-29，
 * 与 2026-09-03 按裸 modelKey 记账是同一类根因：失败被记到错的身份上）。
 * 没有 attempt（没选模型的异常路径）= 记账时静默跳过。
 */
function identityOf(attempt: GenerationNodeRunAttempt | undefined): ModelHealthIdentity {
  return { modelKey: attempt?.modelKey, vendor: attempt?.vendorKey }
}

/** 这一跑成了：清零该 (vendor, model) 的连败计数。 */
export function recordNodeModelSuccess(attempt: GenerationNodeRunAttempt | undefined): void {
  recordModelSuccess(identityOf(attempt))
}

/** 这一跑败了：给该 (vendor, model) 记一笔连败（可找回超时不算，调用方已过滤）。 */
export function recordNodeModelFailure(attempt: GenerationNodeRunAttempt | undefined): void {
  recordModelFailure(identityOf(attempt))
}
