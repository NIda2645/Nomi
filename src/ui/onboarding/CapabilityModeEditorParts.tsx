import React from 'react'
import { IconTrash } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { IconActionButton } from '../../design'
import type { CapabilityDraftErrorCode } from './capabilityContractDraft'

export function ErrorText({ code }: { code?: CapabilityDraftErrorCode }): JSX.Element | null {
  const { t } = useTranslation()
  if (!code) return null
  return (
    <span className="mt-1 block text-micro leading-relaxed text-workbench-danger" role="alert">
      {t(
        `onboardingProviders.workspace.capability.editor.errors.${code}` as 'onboardingProviders.workspace.capability.editor.errors.required',
      )}
    </span>
  )
}

export function FieldLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="mb-1 block text-caption font-medium text-nomi-ink-60">{children}</span>
}

export function CapabilityModeEditorHeader({
  modeName,
  isDefault,
  canRemove,
  onSetDefault,
  onRemove,
}: {
  modeName: string
  isDefault: boolean
  canRemove: boolean
  onSetDefault: () => void
  onRemove: () => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-12 items-center gap-3 border-b border-nomi-line px-4 py-2.5">
      <label className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-body-sm font-semibold text-nomi-ink">
        <input
          type="radio"
          name="default-capability-mode"
          checked={isDefault}
          onChange={onSetDefault}
          className="size-4 accent-nomi-accent"
        />
        <span className="min-w-0 break-words">
          {modeName || t('onboardingProviders.workspace.capability.editor.unnamedMode')}
        </span>
        {isDefault ? (
          <span className="shrink-0 rounded-pill bg-nomi-accent-soft px-2 py-0.5 text-micro font-medium text-nomi-accent">
            {t('onboardingProviders.workspace.capability.editor.defaultMode')}
          </span>
        ) : null}
      </label>
      <span title={!canRemove ? t('onboardingProviders.workspace.capability.editor.keepOneMode') : undefined}>
        <IconActionButton
          disabled={!canRemove}
          onClick={onRemove}
          aria-label={t('onboardingProviders.workspace.capability.editor.removeMode')}
          title={
            canRemove
              ? t('onboardingProviders.workspace.capability.editor.removeMode')
              : t('onboardingProviders.workspace.capability.editor.keepOneMode')
          }
          className="size-11 text-nomi-ink-40 hover:text-workbench-danger sm:size-8"
          icon={<IconTrash size={16} stroke={1.8} aria-hidden="true" />}
        />
      </span>
    </div>
  )
}
