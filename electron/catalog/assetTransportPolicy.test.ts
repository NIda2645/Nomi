import { describe, expect, it } from 'vitest'
import {
  anonymousConsentFromUnknown,
  canUseAnonymousAssetHosting,
  ingestionVisibility,
  minimumLeaseSecondsForMedia,
} from './assetTransportPolicy'
import type { AssetIngestion } from './types'

describe('asset transport policy', () => {
  it('keeps anonymous hosting available by default but represents first use as ask', () => {
    expect(anonymousConsentFromUnknown(undefined)).toBe('ask')
    expect(anonymousConsentFromUnknown('allow')).toBe('allow')
    expect(anonymousConsentFromUnknown('deny')).toBe('deny')
    expect(anonymousConsentFromUnknown('other')).toBe('ask')
  })

  it('only blocks anonymous routes until the user has consented', () => {
    expect(canUseAnonymousAssetHosting('ask')).toBe(false)
    expect(canUseAnonymousAssetHosting('allow')).toBe(true)
    expect(canUseAnonymousAssetHosting('deny')).toBe(false)
  })

  it('describes visibility and a conservative minimum lease', () => {
    const anonymous: AssetIngestion = { strategy: 'anon-chain', chain: [], accepts: ['video'], visibility: 'public-anonymous', ttlSeconds: 24 * 60 * 60, requiresConsent: true }
    expect(ingestionVisibility(anonymous)).toBe('public-anonymous')
    expect(minimumLeaseSecondsForMedia('video')).toBeGreaterThan(minimumLeaseSecondsForMedia('image'))
  })
})
