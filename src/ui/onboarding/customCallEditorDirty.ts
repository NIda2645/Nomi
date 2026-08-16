import { configPatchFromRows, type CustomConfigRow } from './customCallConfig'
import type { CustomCallScriptDrafts } from './customCallScriptModes'

function meaningfulScript(script: string): string {
  return script.trim() ? script : ''
}

function sortedEntries(record: Record<string, string>): Array<[string, string]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
}

/** Only fields persisted by Save belong in the editor dirty contract. */
export function customCallPersistedStateSignature(
  scripts: CustomCallScriptDrafts,
  configRows: readonly CustomConfigRow[],
): string {
  const modes = Object.fromEntries(
    sortedEntries(scripts.modes)
      .map(([modeId, script]) => [modeId, meaningfulScript(script)] as const)
      .filter(([, script]) => Boolean(script)),
  )
  const config = configPatchFromRows(configRows)
  return JSON.stringify({
    scripts: { fallback: meaningfulScript(scripts.fallback), modes },
    config,
  })
}
