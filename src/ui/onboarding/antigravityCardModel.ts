import { ANTIGRAVITY_IMAGE_MODEL_KEY, ANTIGRAVITY_VENDOR_KEY, type AntigravityCheck, type AntigravityTestRequest } from '../../../electron/shared/antigravity'
import type { DesktopBridge } from '../../desktop/bridge'
import type { ChipModel } from './ModelChipGroups'
import { getAntigravityModelVariant } from '../../../electron/shared/antigravityModelVariants'

/** Presentation only: every saved/enabled/tested identity remains the original upstream ID. */
export function groupAntigravityCatalogModels(models: ChipModel[], selected: Readonly<Record<string, string>> = {}) {
  const groups = new Map<string, ChipModel[]>()
  for (const model of models) {
    const variant = model.vendorKey === ANTIGRAVITY_VENDOR_KEY ? getAntigravityModelVariant(model.modelKey) : undefined
    const key = variant ? `${model.vendorKey}/family/${variant.familyKey}` : `${model.vendorKey}/model/${model.modelKey}`
    groups.set(key, [...(groups.get(key) ?? []), model])
  }
  return [...groups.values()].map((variants) => {
    const family = variants[0].vendorKey === ANTIGRAVITY_VENDOR_KEY ? getAntigravityModelVariant(variants[0].modelKey) : undefined
    const model = variants.find((entry) => entry.modelKey === selected[family?.familyKey ?? entry.modelKey])
      ?? variants.find((entry) => entry.enabled)
      ?? variants.find((entry) => getAntigravityModelVariant(entry.modelKey)?.defaultVariant)
      ?? variants[0]
    return { familyKey: family?.familyKey ?? model.modelKey, variants,
      model: { ...model, labelZh: family?.familyLabel ?? model.labelZh, enabled: variants.some((entry) => entry.enabled) } }
  })
}

export type AntigravityDisplayCheckState = AntigravityCheck['state'] | 'unverified' | 'timeout' | 'limited'
export function antigravityDisplayCheckState(check: AntigravityCheck | undefined): AntigravityDisplayCheckState {
  if (check?.state === 'failed' && (check.code === 'ANTIGRAVITY_TIMEOUT' || check.code === 'ANTIGRAVITY_INIT_TIMEOUT')) return 'timeout'
  if (check?.state === 'failed' && check.code === 'ANTIGRAVITY_QUOTA') return 'limited'
  return check?.state ?? 'unverified'
}

export function antigravityCatalogModelKey(request: AntigravityTestRequest): string {
  return request.capability === 'image' || request.capability === 'edit' ? ANTIGRAVITY_IMAGE_MODEL_KEY : request.modelId
}

export function persistAntigravityModelEnabled(catalog: Pick<DesktopBridge['modelCatalog'], 'upsertModel' | 'upsertVendor'>, enabled: boolean, request: AntigravityTestRequest): void {
  catalog.upsertModel({ vendorKey: ANTIGRAVITY_VENDOR_KEY, modelKey: antigravityCatalogModelKey(request), enabled })
  if (enabled) catalog.upsertVendor({ key: ANTIGRAVITY_VENDOR_KEY, enabled: true })
}
