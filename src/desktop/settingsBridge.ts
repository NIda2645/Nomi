export type DesktopProjectLocation = {
  path: string
  source: 'environment' | 'custom' | 'default'
}

export type DesktopProjectLocationError =
  | 'not-directory'
  | 'not-writable'
  | 'open-failed'
  | 'managed-by-environment'

export type DesktopProjectLocationResult =
  | { ok: true; location: DesktopProjectLocation; canceled?: boolean }
  | { ok: false; error: DesktopProjectLocationError }

export type DesktopSettingsBridge = {
  projectLocation: {
    get: () => Promise<DesktopProjectLocationResult>
    pick: () => Promise<DesktopProjectLocationResult>
    reset: () => Promise<DesktopProjectLocationResult>
    reveal: () => Promise<DesktopProjectLocationResult>
  }
  automationPolicy: {
    get: () => Promise<import('../../electron/settings/automationPolicyContract').AutomationPolicySettings>
    set: (payload: unknown) => Promise<import('../../electron/settings/automationPolicyContract').AutomationPolicySettings>
  }
  systemPrompts: {
    get: () => Promise<import('../../electron/settings/systemPromptsContract').SystemPromptOverrides>
    set: (payload: unknown) => Promise<import('../../electron/settings/systemPromptsContract').SystemPromptOverrides>
  }
}
