export type MaskedCustomConfigEntry = { name: string; hasValue: true }

export type CustomConfigRow = {
  name: string
  /** Only a newly typed replacement. Stored values never enter renderer state. */
  value: string
  storedName?: string
  valueChanged: boolean
}

export type CustomConfigPatchEntry = { name: string; value?: string; keepFrom?: string }

export function configRowsFromMaskedEntries(raw: unknown): CustomConfigRow[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((entry): entry is MaskedCustomConfigEntry => Boolean(
      entry && typeof entry === 'object' && !Array.isArray(entry) &&
      typeof (entry as { name?: unknown }).name === 'string' &&
      (entry as { hasValue?: unknown }).hasValue === true,
    ))
    .map((entry) => ({
      name: entry.name.trim(),
      value: '',
      storedName: entry.name.trim(),
      valueChanged: false,
    }))
    .filter((entry) => entry.name.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name))
}

/** Last duplicate wins, matching object semantics without ever materializing a stored value. */
export function configPatchFromRows(rows: readonly CustomConfigRow[]): CustomConfigPatchEntry[] {
  const byName = new Map<string, CustomConfigPatchEntry>()
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    if (row.valueChanged || !row.storedName) byName.set(name, { name, value: row.value })
    else byName.set(name, { name, keepFrom: row.storedName })
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function hasCustomConfig(rows: readonly CustomConfigRow[]): boolean {
  return rows.some((row) => row.name.trim().length > 0)
}
