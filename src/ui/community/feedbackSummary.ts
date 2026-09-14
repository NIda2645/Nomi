// 摘要行的**格式**。它只拥有排版，**不拥有分类**。
//
// 错误码 → 人话这件事在本仓有五个 owner，按域分，各有门岗：
//   · Agent 对话域  `src/workbench/ai/lane/laneCommandFailure.ts` 的 `laneFailureText()`
//                   （门岗 `check:error-surface` 规则① 硬零）
//   · 生成域        `src/workbench/observability/classifyError.ts` 的 `classifyGenerationError()`
//   · 「宣告了卡却没渲染」族 `src/workbench/ai/v4/missingInterventionCard.ts`（门岗 `check:announced-card`）
//   · 模型连接      `src/ui/onboarding/certificationFailureMessage.ts`
//   · 适配器验证    `src/ui/onboarding/adapterFailureAdvice.ts`
//
// 反馈面**不做第六张表**。调用处用它所在域的 owner 把那句人话算好，经
// `FeedbackOpenRequest.summary` 传进来；这里只负责把它和时间/版本/模型拼成一行。
//
// 这条分工不是洁癖：第六张表一定是「按 message 子串猜分类」那一族（前两个 owner 的头注释
// 里写着，那正是它们当初要替掉的东西），而且它不会被任何门岗覆盖。
import type { FeedbackOpenRequest } from './feedbackTypes'

/** 只到分钟。秒对「什么时候出的问题」没有信息，却让这一行变长。 */
function clock(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

/**
 * 样张 B 那一行：`<人话> · <时间> · <版本> · <模型>`。
 *
 * 缺的那几格**直接不出现**，不留「未知」占位——一行里三个「未知」比短一点更难读，
 * 而且会让用户以为是我们没取到本该有的东西。
 */
export function feedbackSummaryLine(input: {
  /** 调用处所在域的 owner 已经派生好的那句人话。 */
  summary: string
  appVersion?: string | null
  model?: string | null
  now?: Date
}): string {
  const parts = [input.summary.trim()].filter(Boolean)
  parts.push(clock(input.now ?? new Date()))
  if (input.appVersion) parts.push(input.appVersion)
  if (input.model) parts.push(input.model)
  return parts.join(' · ')
}

/**
 * 失败面 → 反馈面的那一格。`surface` 是反馈契约里的四个字面量之一；
 * 这里把打开请求翻成它，**新增一个失败面必须来这里加一行**——加不进来就说明
 * 它该复用现有的某一个（「四处共用同一组件」的机器保证之一）。
 */
export function feedbackSurfaceOf(request: FeedbackOpenRequest | null): 'agent' | 'generation' | 'import' | 'model-validation' {
  if (request?.surface) return request.surface
  // 老调用点只带 stage（生成失败卡从 2026-09-01 起就这么传），按 stage 归位。
  if (request?.stage === 'model') return 'model-validation'
  if (request?.stage === 'upload') return 'import'
  return 'generation'
}
