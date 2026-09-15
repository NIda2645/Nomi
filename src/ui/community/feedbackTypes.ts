export type FeedbackIntent = 'problem' | 'suggestion'

export type FeedbackStage = 'model' | 'upload' | 'generation' | 'export' | 'other'

export type FeedbackOpenRequest = {
  intent?: FeedbackIntent
  stage?: FeedbackStage
  errorKind?: string
  provider?: string
  model?: string
}

export type FeedbackDraft = {
  intent: FeedbackIntent
  stage: FeedbackStage
  summary: string
  details: string
  screenshotName?: string
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
