import type { Mapping } from '../../../electron/catalog/types'
import type { ChipModel } from './ModelChipGroups'
import { projectModelCapability } from './modelCapabilityProjection'

export type ModelHomeStatus = 'working' | 'verified' | 'ready' | 'needsSetup' | 'failed' | 'disabled'
export type ModelHomeConnectionState = 'working' | 'verified' | 'attention' | 'disabled'

export function resolveModelHomeStatus(model: ChipModel, mappings: readonly Mapping[]): ModelHomeStatus {
  if (model.adapterState === 'testing') return 'working'
  if (model.adapterState === 'failed') return 'failed'
  if (model.customCallDraft) return 'needsSetup'

  const capability = projectModelCapability({ model, mappings })
  const capabilityKnown = model.kind === 'text' || capability.inputContract === 'known'
  const transportAvailable = model.kind === 'text' || capability.customCall.enabled || capability.transport.mappings.length > 0
  if (!capabilityKnown || !transportAvailable) return 'needsSetup'
  if (!model.enabled) return 'disabled'
  if (model.adapterState === 'verified') return 'verified'
  return 'ready'
}

export function summarizeModelHomeConnection(
  models: readonly ChipModel[],
  mappings: readonly Mapping[],
): {
  state: ModelHomeConnectionState
  ready: number
  working: number
  needsSetup: number
  disabled: number
} {
  const statuses = models.map((model) => resolveModelHomeStatus(model, mappings))
  const ready = statuses.filter((status) => status === 'ready' || status === 'verified').length
  const working = statuses.filter((status) => status === 'working').length
  const needsSetup = statuses.filter((status) => status === 'needsSetup' || status === 'failed').length
  const disabled = statuses.filter((status) => status === 'disabled').length
  const state: ModelHomeConnectionState = needsSetup > 0
    ? 'attention'
    : working > 0
      ? 'working'
      : ready > 0
        ? 'verified'
        : 'disabled'
  return { state, ready, working, needsSetup, disabled }
}

export function modelsVisibleOnHome({
  models,
  mappings,
  search,
  connectionName,
}: {
  models: readonly ChipModel[]
  mappings: readonly Mapping[]
  search: string
  connectionName: string
}): ChipModel[] {
  const normalized = search.trim().toLocaleLowerCase()
  if (normalized) {
    if (connectionName.toLocaleLowerCase().includes(normalized)) return [...models]
    return models.filter((model) => (
      `${model.labelZh} ${model.modelKey}`.toLocaleLowerCase().includes(normalized)
    ))
  }
  return models.filter((model) => {
    const status = resolveModelHomeStatus(model, mappings)
    return status === 'working' || status === 'needsSetup' || status === 'failed'
  })
}
