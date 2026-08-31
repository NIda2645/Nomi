import type { DesktopAppInfo } from '../../desktop/bridge'
import { getAppLocale } from '../../i18n'
import { safeFeedbackValue, type FeedbackDraft, type FeedbackOpenRequest } from './feedbackTypes'

export type FeedbackDiagnostics = {
  version: 1
  app: {
    version: string
    platform: string
    arch: string
    locale: string
  }
  context: {
    intent: FeedbackDraft['intent']
    stage: FeedbackDraft['stage']
    errorKind?: string
    provider?: string
    model?: string
  }
}

export function buildFeedbackDiagnostics(
  request: FeedbackOpenRequest,
  draft: Pick<FeedbackDraft, 'intent' | 'stage'>,
  appInfo?: Partial<DesktopAppInfo> | null,
): FeedbackDiagnostics {
  return {
    version: 1,
    app: {
      version: safeFeedbackValue(appInfo?.version) ?? 'unknown',
      platform: safeFeedbackValue(appInfo?.platform) ?? 'unknown',
      arch: safeFeedbackValue(appInfo?.arch) ?? 'unknown',
      locale: getAppLocale(),
    },
    context: {
      intent: draft.intent,
      stage: draft.stage,
      errorKind: safeFeedbackValue(request.errorKind),
      provider: safeFeedbackValue(request.provider),
      model: safeFeedbackValue(request.model),
    },
  }
}
