import type { ChipModel } from './ModelChipGroups'

type ModelAdapterDetailInput = {
  kind: ChipModel['kind']
  enabled: boolean
  adapterState?: ChipModel['adapterState']
  hasCustomCall: boolean
  hasActiveRun: boolean
  hasTask: boolean
  canAutoAdapt: boolean
  canUseScript: boolean
  capabilityKnown: boolean
  transportAvailable: boolean
}

export type ModelAdapterDetailState = {
  tone: 'neutral' | 'active' | 'success' | 'warning' | 'danger'
  state:
    | 'adapting'
    | 'readyVerified'
    | 'readyUntested'
    | 'needsCapability'
    | 'needsTransport'
      | 'partial'
      | 'failed'
  primaryAction: 'none' | 'openTask' | 'editCapability' | 'autoConfigure' | 'writeScript'
  secondaryAction: 'none' | 'autoConfigure'
}

export function resolveModelAdapterDetailState(input: ModelAdapterDetailInput): ModelAdapterDetailState {
  if (input.hasActiveRun || input.adapterState === 'testing') {
    return {
      tone: 'active',
      state: 'adapting',
      primaryAction: input.hasTask ? 'openTask' : 'none',
      secondaryAction: 'none',
    }
  }

  // A request implementation cannot compensate for missing model modes and input slots.
  // Keep that distinction explicit so media models never look ready merely because a script exists.
  if (!input.capabilityKnown) {
    return {
      tone: 'warning',
      state: 'needsCapability',
      primaryAction: 'editCapability',
      secondaryAction: input.canAutoAdapt ? 'autoConfigure' : 'none',
    }
  }

  if (input.adapterState === 'failed') {
    const primaryAction = input.hasTask
      ? 'openTask'
      : input.hasCustomCall && input.canUseScript
        ? 'writeScript'
        : input.canAutoAdapt
          ? 'autoConfigure'
          : input.canUseScript
            ? 'writeScript'
            : 'none'
    return {
      tone: 'danger',
      state: 'failed',
      primaryAction,
      secondaryAction: !input.hasTask && input.canAutoAdapt && primaryAction !== 'autoConfigure'
        ? 'autoConfigure'
        : 'none',
    }
  }

  if (!input.transportAvailable) {
    const primaryAction = input.canUseScript
      ? 'writeScript'
      : input.canAutoAdapt
        ? 'autoConfigure'
        : 'none'
    return {
      tone: 'warning',
      state: 'needsTransport',
      primaryAction,
      secondaryAction: input.canAutoAdapt && primaryAction !== 'autoConfigure' ? 'autoConfigure' : 'none',
    }
  }

  if (input.adapterState === 'partial') {
    return {
      tone: 'warning',
      state: 'partial',
      primaryAction: input.hasTask ? 'openTask' : 'none',
      secondaryAction: 'none',
    }
  }

  if (input.adapterState === 'verified') {
    return { tone: 'success', state: 'readyVerified', primaryAction: 'none', secondaryAction: 'none' }
  }

  return {
    tone: 'neutral',
    state: 'readyUntested',
    primaryAction: 'none',
    secondaryAction: input.canAutoAdapt ? 'autoConfigure' : 'none',
  }
}
