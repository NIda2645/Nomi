import { describe, expect, it } from 'vitest'
import { resolveModelAdapterDetailState } from './modelAdapterDetailState'

describe('model adapter detail state', () => {
  it('does not call a media model ready while its input contract is unknown', () => {
    expect(resolveModelAdapterDetailState({
      kind: 'video',
      enabled: false,
      adapterState: 'unverified',
      hasCustomCall: false,
      hasActiveRun: false,
      hasTask: false,
      canAutoAdapt: true,
      canUseScript: true,
      capabilityKnown: false,
      transportAvailable: false,
    })).toEqual({
      tone: 'warning',
      state: 'needsCapability',
      primaryAction: 'editCapability',
      secondaryAction: 'autoConfigure',
    })
  })

  it('describes a standard text route as usable but untested', () => {
    expect(resolveModelAdapterDetailState({
      kind: 'text',
      enabled: true,
      adapterState: 'unverified',
      hasCustomCall: false,
      hasActiveRun: false,
      hasTask: false,
      canAutoAdapt: true,
      canUseScript: true,
      capabilityKnown: true,
      transportAvailable: true,
    })).toEqual({
      tone: 'neutral',
      state: 'readyUntested',
      primaryAction: 'none',
      secondaryAction: 'autoConfigure',
    })
  })

  it('keeps slow automatic adaptation secondary when a request script is available', () => {
    expect(resolveModelAdapterDetailState({
      kind: 'video',
      enabled: false,
      adapterState: 'unverified',
      hasCustomCall: false,
      hasActiveRun: false,
      hasTask: false,
      canAutoAdapt: true,
      canUseScript: true,
      capabilityKnown: true,
      transportAvailable: false,
    })).toEqual({
      tone: 'warning',
      state: 'needsTransport',
      primaryAction: 'writeScript',
      secondaryAction: 'autoConfigure',
    })
  })

  it('reopens active work instead of starting a duplicate run', () => {
    expect(resolveModelAdapterDetailState({
      kind: 'image',
      enabled: false,
      adapterState: 'testing',
      hasCustomCall: false,
      hasActiveRun: true,
      hasTask: true,
      canAutoAdapt: true,
      canUseScript: true,
      capabilityKnown: false,
      transportAvailable: false,
    })).toEqual({ tone: 'active', state: 'adapting', primaryAction: 'openTask', secondaryAction: 'none' })
  })

  it('opens a failed task to its real error instead of blindly retrying', () => {
    expect(resolveModelAdapterDetailState({
      kind: 'image',
      enabled: false,
      adapterState: 'failed',
      hasCustomCall: false,
      hasActiveRun: false,
      hasTask: true,
      canAutoAdapt: true,
      canUseScript: true,
      capabilityKnown: true,
      transportAvailable: false,
    })).toEqual({ tone: 'danger', state: 'failed', primaryAction: 'openTask', secondaryAction: 'none' })
  })

  it('does not claim a saved script is enough when media inputs are still unknown', () => {
    expect(resolveModelAdapterDetailState({
      kind: 'image',
      enabled: true,
      adapterState: 'failed',
      hasCustomCall: true,
      hasActiveRun: false,
      hasTask: true,
      canAutoAdapt: true,
      canUseScript: true,
      capabilityKnown: false,
      transportAvailable: true,
    })).toEqual({
      tone: 'warning',
      state: 'needsCapability',
      primaryAction: 'editCapability',
      secondaryAction: 'autoConfigure',
    })
  })

  it('shows no primary action for a fully verified model', () => {
    expect(resolveModelAdapterDetailState({
      kind: 'video',
      enabled: true,
      adapterState: 'verified',
      hasCustomCall: false,
      hasActiveRun: false,
      hasTask: true,
      canAutoAdapt: true,
      canUseScript: true,
      capabilityKnown: true,
      transportAvailable: true,
    })).toEqual({ tone: 'success', state: 'readyVerified', primaryAction: 'none', secondaryAction: 'none' })
  })

  it('falls through to a manual request script when no automatic route exists', () => {
    expect(resolveModelAdapterDetailState({
      kind: 'video',
      enabled: false,
      adapterState: 'unverified',
      hasCustomCall: false,
      hasActiveRun: false,
      hasTask: false,
      canAutoAdapt: false,
      canUseScript: true,
      capabilityKnown: true,
      transportAvailable: false,
    }).primaryAction).toBe('writeScript')
  })
})
