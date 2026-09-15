import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFeedbackOutboxItem, enqueueFeedback, readFeedbackOutbox } from './feedbackOutbox'
import type { FeedbackDiagnostics } from './feedbackDiagnostics'

const diagnostics: FeedbackDiagnostics = {
  version: 1,
  app: { version: '0.21.0', platform: 'darwin', arch: 'arm64', locale: 'zh-CN' },
  context: { intent: 'problem', stage: 'model' },
}

describe('feedback outbox', () => {
  beforeEach(() => {
    const data = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    } })
  })

  it('keeps the latest bounded draft locally for retry', () => {
    const item = createFeedbackOutboxItem({ intent: 'problem', stage: 'model', summary: 'summary', details: 'details' }, diagnostics, 'github')
    expect(enqueueFeedback(item)).toHaveLength(1)
    expect(readFeedbackOutbox()[0]).toMatchObject({ destination: 'github', draft: { summary: 'summary' } })
  })

  it('does not persist screenshot bytes', () => {
    const item = createFeedbackOutboxItem({ intent: 'problem', stage: 'model', summary: 'summary', details: '', screenshotName: 'shot.png' }, diagnostics, 'github')
    enqueueFeedback(item)
    const stored = JSON.stringify(readFeedbackOutbox())
    expect(stored).toContain('shot.png')
    expect(stored).not.toContain('data:image')
  })
})
