import { describe, expect, it } from 'vitest'
import { isOnboardingApiKeyReady, resolveOnboardingAuth } from './onboardingAuth'

describe('model onboarding authentication', () => {
  it('uses no authentication and discards any stale key for a keyless gateway', () => {
    expect(resolveOnboardingAuth('openai-compatible', 'stale-key', true)).toEqual({
      apiKey: '',
      authType: 'none',
    })
    expect(isOnboardingApiKeyReady('', true)).toBe(true)
  })

  it('keeps the existing authenticated provider contracts', () => {
    expect(resolveOnboardingAuth('openai-compatible', ' sk-openai ', false)).toEqual({
      apiKey: 'sk-openai',
      authType: 'bearer',
    })
    expect(resolveOnboardingAuth('anthropic', ' sk-anthropic ', false)).toEqual({
      apiKey: 'sk-anthropic',
      authType: 'x-api-key',
    })
    expect(isOnboardingApiKeyReady('  ', false)).toBe(false)
  })
})
