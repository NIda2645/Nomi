import { describe, expect, it, vi } from 'vitest'
import type { ChipModel } from './ModelChipGroups'
import type { OnboardingVendorMeta } from './useOnboardingDrawerCatalog'
import { projectOnboardingConnections } from './onboardingDrawerConnections'

function project(enabled: boolean) {
  const vendorMeta = new Map<string, OnboardingVendorMeta>([['antigravity-cli', {
    name: 'Antigravity CLI', hasApiKey: false, baseUrl: '', enabled, authType: 'none', customCallOnly: false,
  }]])
  const model: ChipModel = { vendorKey: 'antigravity-cli', modelKey: 'auto', labelZh: 'Auto', kind: 'text', enabled: true }
  const openPage = vi.fn()
  return { openPage, ...projectOnboardingConnections({
    models: [model], vendorMeta, dreaminaStatus: null, openPage,
    localNames: { dreamina: 'Dreamina', codex: 'Codex', antigravity: 'Antigravity CLI' },
  }) }
}

describe('model settings connection projection', () => {
  it.each([false, true])('keeps unfinished CLI entry hidden even when enabled=%s, without an API/key fallback', (enabled) => {
    const result = project(enabled)
    expect(result.otherVendorGroups).toEqual([])
    expect(result.homeConnections).toEqual([])
    expect(result.availableHomeConnections).toEqual([])
    expect(result.connectionTitle('antigravity-cli')).toBe('Antigravity CLI')
    expect(result.openPage).not.toHaveBeenCalled()
  })
})
