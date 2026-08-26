export type ParameterReferenceGroup = 'first_frame' | 'last_frame' | 'reference'
export type ParameterReferenceSlot = {
  key: string
  label: string
  group: ParameterReferenceGroup
  mediaKind?: 'image' | 'video'
}
export type ParameterReferenceContract = {
  modelKey: string
  vendorKey: string
  slots: ParameterReferenceSlot[]
}

const DECLARATION_KEY = 'parameterReferenceSlots'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function parameterReferenceModelIdentity(meta: Record<string, unknown>): { modelKey: string; vendorKey: string } {
  return {
    modelKey: text(meta.modelKey) || text(meta.modelAlias) || text(meta.imageModel) || text(meta.videoModel),
    vendorKey: text(meta.modelVendor) || text(meta.vendor) || text(meta.imageModelVendor) || text(meta.videoModelVendor),
  }
}

/** Read and validate the persisted declaration against the node/request identity. */
export function readParameterReferenceContract(meta: Record<string, unknown> | undefined): ParameterReferenceContract | null {
  if (!meta) return null
  const declaration = record(meta[DECLARATION_KEY])
  const identity = parameterReferenceModelIdentity(meta)
  if (declaration.modelKey !== identity.modelKey || declaration.vendorKey !== identity.vendorKey) return null
  if (!Array.isArray(declaration.slots)) return null
  const seen = new Set<string>()
  const slots: ParameterReferenceSlot[] = []
  for (const value of declaration.slots) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const slot = value as Record<string, unknown>
    const key = text(slot.key)
    if (!key || seen.has(key) || !['reference', 'first_frame', 'last_frame'].includes(String(slot.group))) return null
    if (slot.mediaKind !== undefined && slot.mediaKind !== 'image' && slot.mediaKind !== 'video') return null
    seen.add(key)
    slots.push({
      key,
      label: text(slot.label) || key,
      group: slot.group as ParameterReferenceGroup,
      ...(slot.mediaKind === 'image' || slot.mediaKind === 'video' ? { mediaKind: slot.mediaKind } : {}),
    })
  }
  return { ...identity, slots }
}

export function readParameterReferenceSlotsContract(meta: Record<string, unknown> | undefined): ParameterReferenceSlot[] {
  return readParameterReferenceContract(meta)?.slots ?? []
}
