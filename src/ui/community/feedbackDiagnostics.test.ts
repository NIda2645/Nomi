import { describe, expect, it } from 'vitest'
import { buildFeedbackDiagnostics } from './feedbackDiagnostics'
import { buildPrivateFeedbackUrl } from './communityLinks'

describe('feedback diagnostics', () => {
  it('contains only a bounded, non-content context envelope', () => {
    const result = buildFeedbackDiagnostics(
      { intent: 'problem', stage: 'generation', errorKind: 'network', provider: 'apimart', model: 'seedance-2.5' },
      { intent: 'problem', stage: 'generation' },
      { version: '0.21.0', platform: 'darwin', arch: 'arm64' },
    )
    expect(result).toEqual({
      version: 1,
      app: { version: '0.21.0', platform: 'darwin', arch: 'arm64', locale: 'zh-CN' },
      context: { intent: 'problem', stage: 'generation', errorKind: 'network', provider: 'apimart', model: 'seedance-2.5' },
    })
    expect(JSON.stringify(result)).not.toContain('prompt')
    expect(JSON.stringify(result)).not.toContain('Authorization')
  })

  it('redacts control characters and bounds identifiers', () => {
    const result = buildFeedbackDiagnostics({ intent: 'problem', stage: 'other', model: `a\n${'x'.repeat(200)}` }, { intent: 'problem', stage: 'other' })
    expect(result.context.model).toHaveLength(120)
    expect(result.context.model).not.toContain('\n')
  })

  it('keeps built-in vendor identities verbatim (curated registry + fixed internal literals)', () => {
    for (const [provider, model] of [
      ['apimart', 'seedance-2.5'],
      ['volcengine', 'seedream-4.0'],
      ['dreamina', 'jimeng-video'],
      ['codex-local', 'gpt-image'],
      ['antigravity-cli', 'gemini-image'],
    ] as const) {
      const result = buildFeedbackDiagnostics(
        { intent: 'problem', stage: 'model', errorKind: 'auth', provider, model },
        { intent: 'problem', stage: 'model' },
      )
      expect(result.context.provider).toBe(provider)
      expect(result.context.model).toBe(model)
    }
  })

  it('collapses a local ComfyUI instance to the bare literal and drops the user-named suffix', () => {
    const result = buildFeedbackDiagnostics(
      // Multi-instance key minted from the user's typed instance name (AddComfyuiInstanceButton).
      { intent: 'problem', stage: 'generation', errorKind: 'network', provider: 'comfyui-local-secret-lab-rig', model: 'my-private-workflow' },
      { intent: 'problem', stage: 'generation' },
    )
    expect(result.context.provider).toBe('comfyui-local')
    expect(result.context.model).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('secret-lab-rig')
    expect(JSON.stringify(result)).not.toContain('my-private-workflow')
  })

  it('never carries a user-defined vendor string into diagnostics or the Tally URL', () => {
    // A relay/manual vendor key is minted from the user's own base URL
    // (deriveVendorKeyFromBaseUrl → hostname slug). This can be a private internal address.
    const privateBaseUrlSlug = 'internal-proxy-corp-local'
    const privateModelAlias = 'exec-secret-model'
    const result = buildFeedbackDiagnostics(
      { intent: 'problem', stage: 'generation', errorKind: 'network', provider: privateBaseUrlSlug, model: privateModelAlias },
      { intent: 'problem', stage: 'generation' },
      { version: '0.21.0', platform: 'darwin', arch: 'arm64' },
    )
    // Boundary maps it to the literal "custom" and drops the user-typed model.
    expect(result.context.provider).toBe('custom')
    expect(result.context.model).toBeUndefined()
    // The private strings must not appear anywhere in the diagnostics envelope...
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(privateBaseUrlSlug)
    expect(serialized).not.toContain(privateModelAlias)
    expect(serialized).not.toContain('corp-local')
    // ...nor in the outbound Tally URL built from those diagnostics.
    const tallyUrl = buildPrivateFeedbackUrl(result)
    expect(tallyUrl).not.toContain(privateBaseUrlSlug)
    expect(tallyUrl).not.toContain(privateModelAlias)
    expect(tallyUrl).not.toContain('corp-local')
    expect(new URL(tallyUrl).searchParams.get('nomi_provider')).toBe('custom')
    expect(new URL(tallyUrl).searchParams.get('nomi_model')).toBe('')
  })
})
