import { describe, expect, it, vi } from 'vitest'
import { hasSettingsUnsavedChanges, SETTINGS_UNSAVED_CHANGES_SELECTOR } from './settingsUnsavedChanges'

describe('settings unsaved-change guard', () => {
  it('detects a dirty nested settings page through the shared data contract', () => {
    const querySelector = vi.fn(() => ({ dataset: { settingsUnsaved: 'true' } }))

    expect(hasSettingsUnsavedChanges({ querySelector })).toBe(true)
    expect(querySelector).toHaveBeenCalledWith(SETTINGS_UNSAVED_CHANGES_SELECTOR)
  })

  it('does not block closing when no nested page is dirty', () => {
    expect(hasSettingsUnsavedChanges({ querySelector: () => null })).toBe(false)
    expect(hasSettingsUnsavedChanges(null)).toBe(false)
  })
})
