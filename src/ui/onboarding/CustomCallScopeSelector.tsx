import React from 'react'
import { useTranslation } from 'react-i18next'
import { NomiSelect } from '../../design'
import type { CustomCallScriptDrafts, CustomCallScriptMode } from './customCallScriptModes'

const FALLBACK_SCOPE_VALUE = '__fallback__'

export function CustomCallScopeSelector({
  modes,
  selectedModeId,
  savedScripts,
  onSelect,
}: {
  modes: CustomCallScriptMode[]
  selectedModeId: string | null
  savedScripts: CustomCallScriptDrafts
  onSelect: (modeId: string | null) => void
}): JSX.Element | null {
  const { t } = useTranslation()
  const selectedMode = selectedModeId ? modes.find((mode) => mode.id === selectedModeId) ?? null : null
  if (modes.length === 0) return null
  const selectedScript = selectedModeId ? savedScripts.modes[selectedModeId] : savedScripts.fallback
  const options = [
    {
      value: FALLBACK_SCOPE_VALUE,
      label: t('onboardingProviders.customCall.scopeFallback'),
      trailing: savedScripts.fallback.trim() ? t('onboardingProviders.customCall.scopeConfigured') : undefined,
      trailingTone: 'accent' as const,
    },
    ...modes.map((mode) => ({
      value: mode.id,
      label: mode.label,
      trailing: savedScripts.modes[mode.id]?.trim()
        ? t('onboardingProviders.customCall.scopeConfigured')
        : mode.taskKind,
      trailingTone: savedScripts.modes[mode.id]?.trim() ? 'accent' as const : 'muted' as const,
    })),
  ]

  return (
    <fieldset className="order-1 min-w-0">
      <legend className="sr-only">{t('onboardingProviders.customCall.scopeLabel')}</legend>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <NomiSelect
          value={selectedModeId ?? FALLBACK_SCOPE_VALUE}
          options={options}
          onChange={(value) => onSelect(value === FALLBACK_SCOPE_VALUE ? null : value)}
          ariaLabel={t('onboardingProviders.customCall.scopeLabel')}
          leadingLabel={t('onboardingProviders.customCall.scopeLabel')}
          triggerBadge={selectedScript?.trim()
            ? { text: t('onboardingProviders.customCall.scopeConfigured'), tone: 'accent' }
            : undefined}
          triggerMaxWidth={220}
          className="max-w-full"
        />
        <span className="min-w-0 text-caption leading-relaxed text-nomi-ink-60">
          {selectedMode
            ? t('onboardingProviders.customCall.scopeModeHint', {
                name: selectedMode.label,
                taskKind: selectedMode.taskKind,
                hint: selectedMode.hint,
              })
            : t('onboardingProviders.customCall.scopeFallbackHint')}
        </span>
      </div>
    </fieldset>
  )
}
