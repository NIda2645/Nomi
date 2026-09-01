import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowLeft, IconCamera, IconCheck, IconCopy, IconExternalLink, IconMessage } from '@tabler/icons-react'
import { DesignButton, DesignModal, DesignTextarea } from '../../design'
import { getDesktopBridge } from '../../desktop/bridge'
import { buildFeedbackDiagnostics, type FeedbackDiagnostics } from './feedbackDiagnostics'
import { buildGitHubIssueUrl, buildPrivateFeedbackUrl, NOMI_COMMUNITY_LINKS, PRIVATE_FEEDBACK_URL } from './communityLinks'
import {
  createFeedbackOutboxItem,
  enqueueFeedback,
  type FeedbackOutboxItem,
} from './feedbackOutbox'
import {
  type FeedbackDraft,
  type FeedbackIntent,
  type FeedbackOpenRequest,
  type FeedbackStage,
} from './feedbackTypes'

type Page = 'home' | 'feedback' | 'share' | 'success'

const STAGES: FeedbackStage[] = ['model', 'upload', 'generation', 'export', 'other']

function ActionRow({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-nomi border border-nomi-line bg-nomi-paper p-3.5 text-left transition-colors hover:border-nomi-accent hover:bg-nomi-accent-soft"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-nomi-sm bg-nomi-accent-soft text-nomi-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-medium text-nomi-ink">{title}</span>
        <span className="mt-0.5 block text-caption text-nomi-ink-50">{hint}</span>
      </span>
      <IconExternalLink size={15} stroke={1.7} className="shrink-0 text-nomi-ink-30 transition-colors group-hover:text-nomi-accent" aria-hidden="true" />
    </button>
  )
}

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function FeedbackShareDialog({
  opened,
  onClose,
  request = null,
}: {
  opened: boolean
  onClose: () => void
  request?: FeedbackOpenRequest | null
}): JSX.Element {
  const { t } = useTranslation()
  const [page, setPage] = React.useState<Page>('home')
  const [intent, setIntent] = React.useState<FeedbackIntent>('problem')
  const [stage, setStage] = React.useState<FeedbackStage>('other')
  const [summary, setSummary] = React.useState('')
  const [details, setDetails] = React.useState('')
  const [appInfo, setAppInfo] = React.useState<{ version?: string; platform?: string; arch?: string } | null>(null)
  const [diagnostics, setDiagnostics] = React.useState<FeedbackDiagnostics | null>(null)
  const [outboxItem, setOutboxItem] = React.useState<FeedbackOutboxItem | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [validationMessage, setValidationMessage] = React.useState('')

  React.useEffect(() => {
    if (!opened) return
    const nextIntent = request?.intent ?? 'problem'
    setPage(request?.intent || request?.stage ? 'feedback' : 'home')
    setIntent(nextIntent)
    setStage(request?.stage ?? 'other')
    setSummary('')
    setDetails('')
    setDiagnostics(null)
    setOutboxItem(null)
    setCopied(false)
    setValidationMessage('')
    let active = true
    void getDesktopBridge()?.update?.appInfo().then((info) => {
      if (active) setAppInfo(info)
    }).catch(() => undefined)
    return () => {
      active = false
    }
  }, [opened, request])

  const draft: FeedbackDraft = React.useMemo(
    () => ({
      intent,
      stage,
      summary: summary.trim(),
      details: details.trim(),
    }),
    [details, intent, stage, summary],
  )

  const buildDiagnostics = React.useCallback(() => {
    const next = buildFeedbackDiagnostics(request ?? {}, draft, appInfo)
    setDiagnostics(next)
    return next
  }, [appInfo, draft, request])

  const handleOpenDestination = React.useCallback((destination: 'tally' | 'github') => {
    if (!draft.summary) {
      setValidationMessage(t('community.required'))
      return
    }
    const nextDiagnostics = buildDiagnostics()
    const item = createFeedbackOutboxItem(draft, nextDiagnostics, destination)
    enqueueFeedback(item)
    setOutboxItem(item)
    setPage('success')
    const url = destination === 'tally' && PRIVATE_FEEDBACK_URL
      ? buildPrivateFeedbackUrl(nextDiagnostics)
      : buildGitHubIssueUrl({ intent: draft.intent, stage: draft.stage, errorKind: request?.errorKind })
    openExternal(url)
  }, [buildDiagnostics, draft, request?.errorKind, t])

  const handleCopy = React.useCallback(async () => {
    const nextDiagnostics = diagnostics ?? buildDiagnostics()
    const text = [draft.summary, draft.details, `Nomi ${nextDiagnostics.app.version} · ${nextDiagnostics.app.platform} · ${nextDiagnostics.app.arch}`]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard permissions are optional; the draft remains in the local outbox.
    }
  }, [buildDiagnostics, diagnostics, draft.details, draft.summary])

  const title = page === 'share' ? t('community.shareTitle') : t('community.title')

  return (
    <DesignModal opened={opened} onClose={onClose} centered size="md" title={title} padding="lg" closeOnClickOutside>
      {page === 'home' ? (
        <div className="space-y-3">
          <p className="text-body-sm leading-relaxed text-nomi-ink-60">{t('community.homeHint')}</p>
          <div className="space-y-2.5">
            <ActionRow
              icon={<IconMessage size={19} stroke={1.7} aria-hidden="true" />}
              title={t('community.reportProblem')}
              hint={t('community.reportProblemHint')}
              onClick={() => setPage('feedback')}
            />
            <ActionRow
              icon={<IconExternalLink size={19} stroke={1.7} aria-hidden="true" />}
              title={t('community.shareNomi')}
              hint={t('community.shareNomiHint')}
              onClick={() => setPage('share')}
            />
          </div>
          <p className="pt-1 text-micro leading-relaxed text-nomi-ink-40">{t('community.trustLine')}</p>
        </div>
      ) : null}

      {page === 'share' ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setPage('home')} className="inline-flex items-center gap-1 text-caption text-nomi-ink-50 hover:text-nomi-ink">
            <IconArrowLeft size={14} stroke={1.7} aria-hidden="true" /> {t('community.back')}
          </button>
          <p className="text-body-sm leading-relaxed text-nomi-ink-60">{t('community.shareHint')}</p>
          <div className="space-y-2.5">
            <ActionRow icon={<IconExternalLink size={18} stroke={1.7} aria-hidden="true" />} title={t('community.website')} hint={NOMI_COMMUNITY_LINKS.website} onClick={() => openExternal(NOMI_COMMUNITY_LINKS.website)} />
            <ActionRow icon={<IconExternalLink size={18} stroke={1.7} aria-hidden="true" />} title={t('community.github')} hint={NOMI_COMMUNITY_LINKS.github} onClick={() => openExternal(NOMI_COMMUNITY_LINKS.github)} />
          </div>
        </div>
      ) : null}

      {page === 'feedback' ? (
        <div className="space-y-4">
          <button type="button" onClick={() => setPage('home')} className="inline-flex items-center gap-1 text-caption text-nomi-ink-50 hover:text-nomi-ink">
            <IconArrowLeft size={14} stroke={1.7} aria-hidden="true" /> {t('community.back')}
          </button>
          <div className="flex gap-1.5">
            {(['problem', 'suggestion'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={intent === option}
                onClick={() => setIntent(option)}
                className={intent === option ? 'rounded-nomi-sm border border-nomi-accent bg-nomi-accent-soft px-2.5 py-1.5 text-caption text-nomi-accent' : 'rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2.5 py-1.5 text-caption text-nomi-ink-50 hover:bg-nomi-ink-05'}
              >
                {option === 'problem' ? t('community.problem') : t('community.suggestion')}
              </button>
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-caption text-nomi-ink-60">{t('community.stageLabel')}</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={stage === option}
                  onClick={() => setStage(option)}
                  className={stage === option ? 'rounded-nomi-sm border border-nomi-ink bg-nomi-ink px-2.5 py-1.5 text-caption text-nomi-paper' : 'rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2.5 py-1.5 text-caption text-nomi-ink-50 hover:bg-nomi-ink-05'}
                >
                  {t(`community.stages.${option}`)}
                </button>
              ))}
            </div>
          </div>
          <DesignTextarea label={t('community.summaryLabel')} placeholder={t('community.summaryPlaceholder')} value={summary} onChange={(event) => { setSummary(event.currentTarget.value); setValidationMessage('') }} autosize minRows={2} maxRows={4} error={validationMessage || undefined} />
          <DesignTextarea label={t('community.detailsLabel')} placeholder={t('community.detailsPlaceholder')} value={details} onChange={(event) => setDetails(event.currentTarget.value)} autosize minRows={3} maxRows={7} />
          <div className="flex items-center gap-2 rounded-nomi-sm border border-nomi-line-soft bg-nomi-ink-05 px-3 py-2 text-caption text-nomi-ink-50">
            <IconCamera size={15} stroke={1.7} aria-hidden="true" />
            <span>{t('community.screenshotLabel')}</span>
          </div>
          <p className="text-micro leading-relaxed text-nomi-ink-40">{t('community.screenshotHint')}</p>
          <details className="rounded-nomi-sm border border-nomi-line-soft bg-nomi-ink-05 px-3 py-2">
            <summary className="cursor-pointer text-caption text-nomi-ink-60">{t('community.diagnostics')}</summary>
            <p className="mt-2 text-micro leading-relaxed text-nomi-ink-40">{t('community.diagnosticsHint')}</p>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words font-nomi-mono text-micro text-nomi-ink-50">{JSON.stringify(diagnostics ?? buildFeedbackDiagnostics(request ?? {}, draft, appInfo), null, 2)}</pre>
          </details>
          <p className="text-micro leading-relaxed text-nomi-ink-40">{t('community.destinationHint')}</p>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => void handleCopy()} className="inline-flex items-center gap-1 text-caption text-nomi-ink-50 hover:text-nomi-ink">
              {copied ? <IconCheck size={14} stroke={1.7} aria-hidden="true" /> : <IconCopy size={14} stroke={1.7} aria-hidden="true" />}
              {copied ? t('community.copied') : t('community.copySummary')}
            </button>
            <div className="flex items-center gap-2">
              {PRIVATE_FEEDBACK_URL ? (
                <DesignButton variant="filled" onClick={() => handleOpenDestination('tally')}>{t('community.submitPrivate')}</DesignButton>
              ) : null}
              <DesignButton variant={PRIVATE_FEEDBACK_URL ? 'light' : 'filled'} onClick={() => handleOpenDestination('github')}>{t('community.submitPublic')}</DesignButton>
            </div>
          </div>
        </div>
      ) : null}

      {page === 'success' ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-nomi-sm bg-nomi-accent-soft p-3 text-body-sm text-nomi-ink">
            <IconCheck size={18} stroke={1.8} className="mt-0.5 shrink-0 text-nomi-accent" aria-hidden="true" />
            <span>{t('community.saved')}</span>
          </div>
          <p className="text-caption leading-relaxed text-nomi-ink-50">{outboxItem?.destination === 'tally' ? t('community.privateOpened') : t('community.publicOpened')}</p>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => void handleCopy()} className="inline-flex items-center gap-1 text-caption text-nomi-ink-50 hover:text-nomi-ink">
              <IconCopy size={14} stroke={1.7} aria-hidden="true" /> {copied ? t('community.copied') : t('community.copySummary')}
            </button>
            <div className="flex items-center gap-2">
              {outboxItem?.destination === 'tally' && PRIVATE_FEEDBACK_URL ? (
                <DesignButton variant="filled" onClick={() => openExternal(buildPrivateFeedbackUrl(outboxItem.diagnostics))}>{t('community.openPrivate')}</DesignButton>
              ) : null}
              <DesignButton variant="light" onClick={() => openExternal(buildGitHubIssueUrl({ intent: outboxItem?.draft.intent ?? intent, stage: outboxItem?.draft.stage ?? stage, errorKind: request?.errorKind }))}>{t('community.openGitHub')}</DesignButton>
            </div>
          </div>
        </div>
      ) : null}
    </DesignModal>
  )
}
