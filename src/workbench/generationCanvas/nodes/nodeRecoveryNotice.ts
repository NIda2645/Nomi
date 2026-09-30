// 「这张卡的模型说不了话」那条提示（切家提示）的**事实与前提**——纯函数，不碰 React。
//
// 三件事各自只有一个答案：
//   · 谁失败了 —— 读**失败记录**（运行记录上的 attempt：提交那一刻发给哪家哪个模型），不读「节点现在选着谁」。
//     用户点了提示里的「切到另一家」以后，旧失败还挂在节点上；按现在选的那家去点名，就把一次没发生的失败算到了新家头上
//     （2026-09-29 走查 pb06）。旧记录没有 attempt：读不出是谁，就不点名、不出提示（错误卡自己照样在节点上说清楚）。
//   · 这条失败还描述这张卡吗 —— 节点现在的 (供应商, 模型) 就是失败的那一对，且它仍处在这次失败里。换了家 / 换了模型 /
//     重新跑起来 / 成功了 / 节点没了，这句话都不再成立。
//   · 提示的身份 —— 一张卡同一时刻只有一条（id 按节点），「同一次失败」用运行记录定（occurrence）。
//
// 撤回不在这里、也不靠定时器：这里只回答「前提还成立吗」，谁来问、何时问归 toast 所有者（ToastValidity）。
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { selectedModelKey, selectedVendor } from '../runner/catalogTaskResolve'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { ToastValidity } from '../../../ui/toast'

/** 一张卡同一时刻最多一条「模型说不了话」的提示：新的替换旧的，不叠。 */
export function nodeRecoveryToastId(nodeId: string): string {
  return `node-recovery:${nodeId}`
}

/**
 * 提示模板自己会在「原因」后面补一个句号。原因如果是供应商的一整句话（界面语言的那种），往往已经带着句号，
 * 叠起来就是「…the third checkpoint.. Nomi could not…」「…请等一会儿再来。。」。
 */
export function withoutTrailingStop(reason: string): string {
  return reason.replace(/[.。]+\s*$/, '')
}

export type FailedAttempt = Readonly<{
  vendorKey: string
  modelKey: string
  /** 失败的原文（classifyGenerationError 的输入）。 */
  error: string
  /** 「同一次失败」的身份：哪一次运行、它最后一次更新在何时（找回又改写了原因就是新的一次）。 */
  occurrence: string
}>

/** 这张卡此刻挂着的失败，以及它是**哪一家的哪个模型**失败的。读不出（旧记录 / 非供应商失败）→ null。 */
export function failedAttemptOf(node: GenerationCanvasNode | undefined): FailedAttempt | null {
  if (!node || node.status !== 'error' || !node.error) return null
  const run = node.runs?.[0]
  if (!run || run.status !== 'error' || !run.attempt) return null
  return {
    vendorKey: run.attempt.vendorKey,
    modelKey: run.attempt.modelKey,
    error: node.error,
    occurrence: `${run.id}@${run.updatedAt}`,
  }
}

/** 失败的那一对就是这张卡现在选着的那一对（用户还没换）。 */
export function failureDescribesCurrentSelection(node: GenerationCanvasNode, failed: Pick<FailedAttempt, 'vendorKey' | 'modelKey'>): boolean {
  return selectedVendor(node) === failed.vendorKey && selectedModelKey(node) === failed.modelKey
}

/** 这一次失败的提示还成立吗（提示挂在屏上期间节点会变：重跑、成功、换家、被删）。 */
export function failureNoticeStillHolds(node: GenerationCanvasNode | undefined, failed: Pick<FailedAttempt, 'vendorKey' | 'modelKey' | 'occurrence'>): boolean {
  const current = failedAttemptOf(node)
  return Boolean(node && current && current.occurrence === failed.occurrence && failureDescribesCurrentSelection(node, current))
}

/** 「节点钉着的模型已经不在下拉里」的提示还成立吗：节点没换、模型仍然不在。 */
export function disconnectionNoticeStillHolds(
  node: GenerationCanvasNode | undefined,
  pinned: Readonly<{ vendorKey: string; modelKey: string }>,
  selectionStillMissing: boolean,
): boolean {
  return Boolean(node && selectionStillMissing && selectedVendor(node) === pinned.vendorKey && selectedModelKey(node) === pinned.modelKey)
}

/** 「agent 指定的模型解析不出来」的提示还成立吗：节点仍然没有选模型。 */
export function candidateNoticeStillHolds(node: GenerationCanvasNode | undefined): boolean {
  return Boolean(node && !selectedModelKey(node))
}

/**
 * 把「节点的状态」接成 toast 所有者要的前提监视：画布 store 里节点一变就问一遍 `holds`，
 * 前提不成立所有者就撤回提示。`alsoRecheckOn` 给 store 之外的触发源（如下拉里模型清单变了——它是 React 状态，不在 store 里）。
 */
export function nodeNoticeValidity(input: {
  nodeId: string
  holds: (node: GenerationCanvasNode | undefined) => boolean
  alsoRecheckOn?: (recheck: () => void) => () => void
}): ToastValidity {
  return {
    isValid: () => input.holds(useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === input.nodeId)),
    subscribe: (recheck) => {
      const stopStore = useGenerationCanvasStore.subscribe((state, previous) => {
        if (state.nodes !== previous.nodes) recheck()
      })
      const stopExtra = input.alsoRecheckOn?.(recheck)
      return () => { stopStore(); stopExtra?.() }
    },
  }
}
