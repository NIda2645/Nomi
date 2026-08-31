export const SETTINGS_UNSAVED_CHANGES_SELECTOR = '[data-settings-unsaved="true"]'

export function hasSettingsUnsavedChanges(
  root: { querySelector: (selector: string) => unknown } | null,
): boolean {
  return Boolean(root?.querySelector(SETTINGS_UNSAVED_CHANGES_SELECTOR))
}
