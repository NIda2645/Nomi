import React from 'react'
import { useTranslation } from 'react-i18next'
import { ANTIGRAVITY_IMAGE_MODEL_KEY, ANTIGRAVITY_VENDOR_KEY, type AntigravityCapability, type AntigravityTestRequest } from '../../../electron/shared/antigravity'
import { getAntigravityModelVariant } from '../../../electron/shared/antigravityModelVariants'
import { DesignButton, NomiSelect } from '../../design'
import { antigravityDisplayCheckState, groupAntigravityCatalogModels } from './antigravityCardModel'
import { antigravityCheckFor, canEnableAntigravityRequest } from './antigravityConnection'
import type { ChipModel } from './ModelChipGroups'
import type { ModelWorkspaceConnection } from './ModelSettingsWorkspacePages'
import type { AntigravitySettingsSession } from './useAntigravitySettings'

/** Supplies native verification and variant fields to the common model workspace. */
export function useAntigravityModelWorkspace(model: ChipModel | undefined, models: ChipModel[], session: AntigravitySettingsSession,
  onVariant: (modelKey: string) => void): ModelWorkspaceConnection | undefined {
  const { t } = useTranslation()
  const [selection, setSelection] = React.useState<{ modelKey: string; capability: AntigravityCapability } | null>(null)
  const [now, setNow] = React.useState(Date.now)
  const image = model?.modelKey === ANTIGRAVITY_IMAGE_MODEL_KEY
  const capabilities: AntigravityCapability[] = image ? ['image', 'edit'] : ['text', 'vision']
  const capability = selection && selection.modelKey === model?.modelKey ? selection.capability : capabilities[0]
  const request: AntigravityTestRequest = { capability, modelId: image ? 'auto' : model?.modelKey ?? 'auto' }
  const { view, controller, perform } = session
  const proof = antigravityCheckFor(view.status, request)
  React.useEffect(() => {
    setNow(Date.now())
    if (proof?.state !== 'passed') return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, proof.checkedAt + 600_000 - Date.now()) + 1)
    return () => window.clearTimeout(timer)
  }, [proof])
  if (!model || model.vendorKey !== ANTIGRAVITY_VENDOR_KEY) return undefined
  const busy = !!view.busy || !controller
  const canEnable = canEnableAntigravityRequest(view.status, request, now)
  const discovered = new Set(view.status?.models.map((entry) => entry.id) ?? [])
  const readyToTest = !busy && discovered.size > 0 && (request.modelId === 'auto' || discovered.has(request.modelId))
    && view.status?.state !== 'missing' && view.status?.state !== 'login-required'
  const family = getAntigravityModelVariant(model.modelKey)
  const variants = groupAntigravityCatalogModels(models.filter((entry) => entry.vendorKey === model.vendorKey && discovered.has(entry.modelKey)))
    .find((group) => group.variants.some((entry) => entry.modelKey === model.modelKey))?.variants ?? [model]
  const checkLabel = t(`antigravity.check.${antigravityDisplayCheckState(proof)}`)
  const issue = view.issue ? t(`antigravity.issues.${view.issue}`) : null
  const fields = family ? (
    <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-nomi-line py-2.5" data-agy-variant>
      <div className="min-w-0"><div className="text-body-sm font-medium text-nomi-ink">{t('antigravity.thinkingTier')}</div>
        <div className="mt-0.5 text-caption text-nomi-ink-40">{t('antigravity.tierHint')}</div></div>
      {variants.length > 1 ? <NomiSelect value={model.modelKey} disabled={busy} size="sm" ariaLabel={t('antigravity.thinkingTier')}
        options={variants.map((entry) => ({ value: entry.modelKey, label: getAntigravityModelVariant(entry.modelKey)?.variantLabel ?? entry.labelZh }))}
        onChange={onVariant} /> : <span className="text-caption text-nomi-ink-60">{family.variantLabel}</span>}
    </div>
  ) : undefined
  const status = (
    <section className="border-y border-nomi-line py-3" data-agy-verification>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="status" className="text-body-sm font-semibold text-nomi-ink">{view.busy === 'testing' ? t('antigravity.testing', { capability: t(`antigravity.capability.${view.request?.capability ?? capability}`), model: view.request?.modelId }) : view.busy === 'cancelling' ? t('antigravity.cancelling') : checkLabel}</div>
        <div className="flex items-center gap-2">
          <NomiSelect value={capability} disabled={busy} size="sm" ariaLabel={t('antigravity.testCapability')}
            options={capabilities.map((value) => ({ value, label: t(`antigravity.capability.${value}`) }))}
            onChange={(value) => { if (capabilities.includes(value as AntigravityCapability)) setSelection({ modelKey: model.modelKey, capability: value as AntigravityCapability }) }} />
          <DesignButton data-agy-test variant="filled" disabled={view.busy !== 'testing' && !readyToTest}
            onClick={() => void perform(view.busy === 'testing' ? 'cancel' : 'test', request)}>
            {view.busy === 'testing' ? t('antigravity.cancel') : t(proof?.state === 'passed' ? 'antigravity.retest' : 'antigravity.test', { capability: t(`antigravity.capability.${capability}`) })}
          </DesignButton>
        </div>
      </div>
      <p className="mt-2 text-caption text-nomi-ink-60">{t('antigravity.accountUsage')}</p>
      <div className="mt-1 text-micro text-nomi-ink-40">{capabilities.map((value) => `${t(`antigravity.capability.${value}`)} ${t(`antigravity.check.${antigravityDisplayCheckState(antigravityCheckFor(view.status, { ...request, capability: value }))}`)}`).join(' · ')}</div>
      {proof?.code ? <p className="mt-2 break-all text-micro text-workbench-danger">{proof.code}</p> : null}
      {issue ? <p role="status" className="mt-2 text-caption text-nomi-ink-60">{issue}</p> : null}
    </section>
  )
  return {
    status, fields, title: family?.familyLabel ?? (image ? t('antigravity.tool') : model.modelKey === 'auto' ? t('antigravity.automatic') : model.labelZh),
    enabledLocked: busy || (!model.enabled && !canEnable),
    enabledHint: t(busy ? 'antigravity.busyHint' : !model.enabled && !canEnable ? 'antigravity.enableHint' : 'onboardingProviders.workspace.enabledHint'),
    onSetEnabled: (enabled) => { controller?.setEnabled(enabled, request) },
    inputSummary: image ? undefined : t('antigravity.textVisionInput'),
    requestSummary: t('antigravity.nativeRequest'),
  }
}
