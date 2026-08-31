import { describe, expect, it } from 'vitest'
import { buildFeedbackDiagnostics } from './feedbackDiagnostics'

describe('feedback diagnostics', () => {
  it('contains only a bounded, non-content context envelope', () => {
    const result = buildFeedbackDiagnostics(
      { intent: 'problem', stage: 'generation', errorKind: 'network', provider: 'vendor', model: 'model' },
      { intent: 'problem', stage: 'generation' },
      { version: '0.21.0', platform: 'darwin', arch: 'arm64' },
    )
    expect(result).toEqual({
      version: 1,
      app: { version: '0.21.0', platform: 'darwin', arch: 'arm64', locale: 'zh-CN' },
      context: { intent: 'problem', stage: 'generation', errorKind: 'network', provider: 'vendor', model: 'model' },
    })
    expect(JSON.stringify(result)).not.toContain('prompt')
    expect(JSON.stringify(result)).not.toContain('Authorization')
  })

  it('redacts control characters and bounds identifiers', () => {
    const result = buildFeedbackDiagnostics({ intent: 'problem', stage: 'other', model: `a\n${'x'.repeat(200)}` }, { intent: 'problem', stage: 'other' })
    expect(result.context.model).toHaveLength(120)
    expect(result.context.model).not.toContain('\n')
  })
})
