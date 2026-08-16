import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { shouldRunVendorHealthProbe, shouldSkipImplicitVendorHealth } from './vendorHealthProbePolicy'

describe('custom vendor health probe policy', () => {
  it('does not turn a save-first registration into an implicit second /models request', () => {
    expect(shouldSkipImplicitVendorHealth({
      models: [
        { adapterState: 'unverified' },
        { adapterState: 'unverified' },
        { adapterState: 'unverified' },
      ],
    })).toBe(true)
  })

  it('keeps existing connection health behavior once a model has moved beyond the fresh saved state', () => {
    expect(shouldSkipImplicitVendorHealth({ models: [{ adapterState: 'verified' }] })).toBe(false)
    expect(shouldSkipImplicitVendorHealth({
      models: [{ adapterState: 'unverified' }, { adapterState: 'failed' }],
    })).toBe(false)
    expect(shouldSkipImplicitVendorHealth({ models: [{ adapterState: undefined }] })).toBe(false)
    expect(shouldSkipImplicitVendorHealth({ models: [] })).toBe(false)
  })

  it('suppresses only implicit health probes and still permits an explicit retry', () => {
    expect(shouldRunVendorHealthProbe({
      hasApiKey: true,
      disabled: false,
      skipImplicit: true,
      explicit: false,
    })).toBe(false)
    expect(shouldRunVendorHealthProbe({
      hasApiKey: true,
      disabled: false,
      skipImplicit: true,
      explicit: true,
    })).toBe(true)
    expect(shouldRunVendorHealthProbe({
      hasApiKey: false,
      disabled: false,
      skipImplicit: false,
      explicit: true,
    })).toBe(false)
    expect(shouldRunVendorHealthProbe({
      hasApiKey: true,
      disabled: true,
      skipImplicit: false,
      explicit: true,
    })).toBe(false)
  })

  it('is wired into the custom vendor card before useVendorHealth', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/onboarding/CustomVendorCard.tsx'), 'utf8')
    expect(source).toContain('shouldSkipImplicitVendorHealth({')
    expect(source).toContain('disableProbe: skipHealthProbe')
    expect(source).toContain('skipImplicitProbe: skipImplicitHealth')
  })
})
