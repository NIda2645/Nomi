import path from 'node:path'
import { readConfigFile, readConfigFileOrDefault, writeConfigFileAtomic } from '../configFileStore'
import { getSettingsRoot } from './settingsRoot'
import { automationPolicySettingsPath } from './automationPolicySettings'
import { normalizeAttentionSound, type AttentionSoundSettings } from '../shared/contracts/attentionSound'

const settingsPath = (): string => path.join(getSettingsRoot(), 'attention-sound.json')
export const customAttentionSoundPath = (): string => path.join(getSettingsRoot(), 'sounds', 'attention.wav')
function legacyEnabled(): unknown {
  return readConfigFileOrDefault<{ notificationSound?: unknown } | null>(automationPolicySettingsPath(), () => null)?.notificationSound
}
export function readAttentionSoundSettings(): AttentionSoundSettings {
  const stored = readConfigFileOrDefault<unknown>(settingsPath(), () => null)
  return normalizeAttentionSound(stored ?? { enabled: legacyEnabled() })
}
export function writeAttentionSoundSettings(value: unknown): AttentionSoundSettings {
  const next = normalizeAttentionSound(value)
  writeConfigFileAtomic(settingsPath(), next)
  return next
}

/** One-time migration before automation settings can discard the retired sound field. */
export function migrateAttentionSoundSettings(): void {
  if (readConfigFile(settingsPath()).status !== 'missing') return
  writeAttentionSoundSettings({ enabled: legacyEnabled() })
}
