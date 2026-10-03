// 「供应商任务失败了」这句话的**格式**——唯一的产出、唯一的解析，放在一起。
//
// 为什么要有解析：节点错误卡的标题读的是 classifyGenerationError(...).reason。异步任务在供应商那边失败时，
// 主进程回的是 `TaskResult.error`（供应商的原话，或一句我们自己的兜底），渲染层把它拼成
// `<原话> (taskId=…, kind=…)` 抛出去。分类器认不出这个形状，就把整句——连同内部的 taskId 后缀——
// 当标题印出来：中文界面于是顶着一句供应商的英文原话（2026-09-29）。
// 认得这个形状（它只由本文件产出）= 分得清「这是供应商说的话」和「这是我们自己的话」。
import i18n from '../../../i18n'

export type TaskFailureIds = { taskId?: string; kind?: string }

/** 产出：`<原话或我们的兜底句> (taskId=…, kind=…)`；没有任何 id 就不带后缀。 */
export function formatTaskFailureMessage(upstream: string, ids: TaskFailureIds): string {
  const prefix = upstream.trim() || i18n.t('generationCommon.error.taskFailed')
  const suffix = [ids.taskId ? `taskId=${ids.taskId}` : '', ids.kind ? `kind=${ids.kind}` : ''].filter(Boolean).join(', ')
  return suffix ? `${prefix} (${suffix})` : prefix
}

const SUFFIX = /^([\s\S]+?) \(((?:taskId=[^,()]*)?(?:, )?(?:kind=[^,()]*)?)\)$/

/**
 * 解析：是这个形状 → 返回**供应商说的那句话**（没说就是 ''，兜底句不算它说的）；不是 → null。
 * 后缀里必须真有 `taskId=` 或 `kind=`，一句碰巧以括号收尾的人话不会被误认。
 */
export function parseTaskFailureMessage(message: string): { upstream: string } | null {
  const match = SUFFIX.exec(String(message || '').trim())
  if (!match || !/^(?:taskId=|kind=)/.test(match[2])) return null
  const prefix = match[1].trim()
  // 兜底句是我们自己的话（两种界面语言都认——错误可能是另一种语言下落进项目的），不算供应商说的。
  const ourFallbacks: string[] = (['zh-CN', 'en'] as const).map((lng) => String(i18n.t('generationCommon.error.taskFailed', { lng })))
  return { upstream: ourFallbacks.includes(prefix) ? '' : prefix }
}
