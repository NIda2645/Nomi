export type FeedbackIntent = 'problem' | 'suggestion'

export type FeedbackStage = 'model' | 'upload' | 'generation' | 'export' | 'other'

/**
 * 打开反馈面的请求。四个失败面都派发 `nomi-open-feedback-share` 带这个 detail。
 *
 * 2026-09-15 加了三格（`summary` / `surface` / `laneName`），它们是「用户零输入」的代价所在：
 * 机器要自己填的东西，得由**知情的那一侧**给出来。
 */
export type FeedbackOpenRequest = {
  intent?: FeedbackIntent
  stage?: FeedbackStage
  errorKind?: string
  provider?: string
  model?: string
  /**
   * 那句人话。**调用处用它所在域的错误码 owner 算好**（Agent 域 `laneFailureText()`、
   * 生成域 `classifyGenerationError()`…）。反馈面刻意不带自己的码表——那会是仓库里的
   * 第六张，而前五张各有门岗。理由写在 `feedbackSummary.ts` 的头注释。
   */
  summary?: string
  /** 四个失败面之一。不给就按 `stage` 归位（老调用点只带 stage）。 */
  surface?: 'agent' | 'generation' | 'import' | 'model-validation'
  /** 哪条对话的轨迹。不给就不带轨迹，清单里写明原因。 */
  laneName?: string
}

/** 只剩「这是问题还是建议 + 哪个阶段」两格——2026-09-15 起摘要与详情不再由用户填。 */
export type FeedbackDraft = {
  intent: FeedbackIntent
  stage: FeedbackStage
}

export function stageForGenerationError(kind: string): FeedbackStage {
  if (kind.includes('model') || kind === 'auth' || kind === 'quota' || kind === 'balance') return 'model'
  if (kind.includes('upload') || kind.includes('asset')) return 'upload'
  return 'generation'
}

export function safeFeedbackValue(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0
    return code < 0x20 || code === 0x7f ? ' ' : character
  }).join('').trim()
  return normalized ? normalized.slice(0, maxLength) : undefined
}
