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
import type { FeedbackSurface } from '../../../electron/shared/contracts/feedback'
import type { FeedbackOpenRequest } from './feedbackTypes'

/** 只到分钟（本地时间）。秒对「什么时候出的问题」没有信息，却让这一行变长。 */
function clock(now: Date): string {
  return now.toTimeString().slice(0, 5)
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
  // `filter(Boolean)` 就是「缺的格直接不出现」那条规则的全部实现。
  return [input.summary.trim(), clock(input.now ?? new Date()), input.appVersion, input.model]
    .filter(Boolean).join(' · ')
}

/**
 * 打开请求 → 反馈契约里的 `surface`。**新增一个失败面必须来这里加一行**——加不进来就说明
 * 它该复用现有的某一个（「四处共用同一组件」的机器保证之一）。
 * 什么上下文都没有的那一档落 `unspecified`，理由见下面那行注释。
 */
export function feedbackSurfaceOf(request: FeedbackOpenRequest | null): FeedbackSurface {
  if (request?.surface) return request.surface
  // 老调用点只带 stage（生成失败卡从 2026-09-01 起就这么传），按 stage 归位。
  if (request?.stage === 'model') return 'model-validation'
  if (request?.stage === 'upload') return 'import'
  if (request?.stage === 'generation' || request?.stage === 'export') return 'generation'
  // 什么上下文都没有 = 规范入口（设置 → 关于 → 反馈）。**不许兜底成 'generation'**：
  // 那会把「用户主动来说一件事」在分诊时读成「生成坏了」，一个编错的标签会一直骗人。
  return 'unspecified'
}
