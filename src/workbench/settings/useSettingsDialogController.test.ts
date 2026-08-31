import { describe, expect, it } from 'vitest'
import { normalizeSettingsInitialTab } from './useSettingsDialogController'

describe('normalizeSettingsInitialTab', () => {
  it('accepts every settings destination, including the canonical models home', () => {
    for (const tab of ['file', 'models', 'ai', 'automation', 'general', 'about'] as const) {
      expect(normalizeSettingsInitialTab(tab)).toBe(tab)
    }
  })

  it('falls back to file for unknown external event details', () => {
    expect(normalizeSettingsInitialTab('model-catalog')).toBe('file')
    expect(normalizeSettingsInitialTab(undefined)).toBe('file')
  })
})
