import { describe, expect, it } from 'vitest'
import { enOnboardingProviders, zhOnboardingProviders } from '../../i18n/locales/onboardingProviders'

describe('adapter verification user-facing copy', () => {
  it.each([
    ['zh-CN', zhOnboardingProviders],
    ['en', enOnboardingProviders],
  ])('%s reports real terminal outcomes instead of pretending every run just saved models', (_locale, translations) => {
    const copy = translations.adapterVerification
    expect(copy.stage.completed).toContain(localeWord(_locale, 'completed'))
    expect(copy.stage.cancelled).toContain(localeWord(_locale, 'cancelled'))
    expect(copy.stage.timed_out).toContain(localeWord(_locale, 'timedOut'))
    expect(copy.addedSomeFailed).not.toContain(localeWord(_locale, 'stillUsable'))
    expect(copy.noContract).toContain(localeWord(_locale, 'manualSetup'))
  })
})

function localeWord(locale: string, key: 'completed' | 'cancelled' | 'timedOut' | 'stillUsable' | 'manualSetup'): string {
  const values = {
    'zh-CN': { completed: '完成', cancelled: '停止', timedOut: '超时', stillUsable: '仍可使用', manualSetup: '手动配置' },
    en: { completed: 'complete', cancelled: 'stopped', timedOut: 'timed out', stillUsable: 'still usable', manualSetup: 'manual setup' },
  } as const
  return values[locale as keyof typeof values][key]
}
