import { describe, expect, it } from 'vitest'
import { buildGitHubIssueUrl, buildPrivateFeedbackUrl, NOMI_COMMUNITY_LINKS, PRIVATE_FEEDBACK_URL } from './communityLinks'

describe('community links', () => {
  it('keeps public destinations on the real Nomi properties', () => {
    expect(NOMI_COMMUNITY_LINKS.website).toBe('https://nomiaqm.com/')
    expect(NOMI_COMMUNITY_LINKS.github).toBe('https://github.com/aqm857886159/Nomi')
    expect(NOMI_COMMUNITY_LINKS.issues).toContain('github.com/aqm857886159/Nomi/issues')
  })

  it('points private feedback at the published form', () => {
    expect(PRIVATE_FEEDBACK_URL).toBe('https://tally.so/r/GxPrx2')
  })

  it('prefills only a safe template and short title', () => {
    const url = new URL(buildGitHubIssueUrl({ intent: 'problem', stage: 'model', errorKind: 'model-config' }))
    expect(url.origin).toBe('https://github.com')
    expect(url.searchParams.get('template')).toBe('bug_report.yml')
    expect(url.searchParams.get('title')).toBe('[Bug] model · model-config')
    expect(url.search).not.toContain('prompt')
    expect(url.search).not.toContain('details')
  })

  it('passes only safe runtime context to the private form', () => {
    const url = new URL(buildPrivateFeedbackUrl({
      version: 1,
      app: { version: '0.21.0', platform: 'darwin', arch: 'arm64', locale: 'en' },
      // Built-in vendor identity (as it survives the buildFeedbackDiagnostics boundary):
      // vendorKey/modelKey are stable catalog literals, never user input.
      context: { intent: 'problem', stage: 'model', provider: 'apimart', model: 'seedance-2.5' },
    }))
    expect(url.origin + url.pathname).toBe(PRIVATE_FEEDBACK_URL)
    expect(url.searchParams.get('nomi_version')).toBe('0.21.0')
    expect(url.searchParams.get('nomi_platform')).toBe('macOS')
    expect(url.searchParams.get('nomi_arch')).toBe('arm64')
    expect(url.searchParams.get('nomi_stage')).toBe('model')
    expect(url.searchParams.get('nomi_provider')).toBe('apimart / seedance-2.5')
    expect(url.searchParams.get('nomi_model')).toBe('seedance-2.5')
    expect(url.search).not.toContain('secret')
    expect(url.search).not.toContain('summary')
    expect(url.search).not.toContain('details')
  })
})
