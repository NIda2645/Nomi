import type { FeedbackDiagnostics } from './feedbackDiagnostics'
import type { FeedbackDraft } from './feedbackTypes'

const STORAGE_KEY = 'nomi:feedback-outbox:v1'
const MAX_ITEMS = 20
const MAX_TEXT = 4000

export type FeedbackOutboxItem = {
  id: string
  createdAt: string
  draft: FeedbackDraft
  diagnostics: FeedbackDiagnostics
  destination: 'tally' | 'github' | 'local'
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function trimItem(item: FeedbackOutboxItem): FeedbackOutboxItem {
  return {
    ...item,
    draft: {
      ...item.draft,
      summary: item.draft.summary.slice(0, MAX_TEXT),
      details: item.draft.details.slice(0, MAX_TEXT),
      screenshotName: item.draft.screenshotName?.slice(0, 160),
    },
  }
}

export function readFeedbackOutbox(): FeedbackOutboxItem[] {
  const store = storage()
  if (!store) return []
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is FeedbackOutboxItem => Boolean(item && typeof item === 'object')).slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

export function enqueueFeedback(item: FeedbackOutboxItem): FeedbackOutboxItem[] {
  const next = [trimItem(item), ...readFeedbackOutbox()].slice(0, MAX_ITEMS)
  const store = storage()
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // A full or disabled local store must not block the user from opening GitHub.
  }
  return next
}

export function createFeedbackOutboxItem(
  draft: FeedbackDraft,
  diagnostics: FeedbackDiagnostics,
  destination: FeedbackOutboxItem['destination'],
): FeedbackOutboxItem {
  return {
    id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    draft,
    diagnostics,
    destination,
  }
}
