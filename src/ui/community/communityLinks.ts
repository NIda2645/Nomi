import type { FeedbackDiagnostics } from './feedbackDiagnostics'

export const NOMI_COMMUNITY_LINKS = {
  website: 'https://nomiaqm.com/',
  github: 'https://github.com/aqm857886159/Nomi',
  issues: 'https://github.com/aqm857886159/Nomi/issues/new/choose',
} as const

/**
 * Keep the private form URL in one place. The desktop app never puts feedback
 * text, conversation content, assets, or credentials in this URL; only the
 * bounded runtime context below is carried to Tally's hidden fields.
 */
export const PRIVATE_FEEDBACK_URL = 'https://tally.so/r/GxPrx2'

function platformLabel(platform: string): string {
  if (platform === 'darwin') return 'macOS'
  if (platform === 'win32') return 'Windows'
  if (platform === 'linux') return 'Linux'
  return platform
}

/**
 * Pass only low-risk runtime context to the private form. Tally's hidden
 * fields use these values to avoid making the user retype version/platform
 * details; the feedback text and attachments remain browser-confirmed inputs.
 */
export function buildPrivateFeedbackUrl(diagnostics: FeedbackDiagnostics): string {
  const params = new URLSearchParams({
    nomi_version: diagnostics.app.version,
    nomi_platform: platformLabel(diagnostics.app.platform),
    nomi_arch: diagnostics.app.arch,
    nomi_stage: diagnostics.context.stage,
    nomi_provider: [diagnostics.context.provider, diagnostics.context.model].filter(Boolean).join(' / '),
    nomi_model: diagnostics.context.model ?? '',
  })
  return `${PRIVATE_FEEDBACK_URL}?${params.toString()}`
}

export function buildGitHubIssueUrl(input: { intent: 'problem' | 'suggestion'; stage: string; errorKind?: string }): string {
  const kind = input.errorKind ? ` · ${input.errorKind.slice(0, 40)}` : ''
  const title = `${input.intent === 'problem' ? '[Bug]' : '[Idea]'} ${input.stage}${kind}`
  const params = new URLSearchParams({
    template: input.intent === 'problem' ? 'bug_report.yml' : 'feature_request.yml',
    title: title.slice(0, 80),
  })
  return `${NOMI_COMMUNITY_LINKS.issues}?${params.toString()}`
}
