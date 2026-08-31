/**
 * 自定义 / 中转站供应商卡（「其他模型」按家拆开后的每一张）。
 *
 * 从 OnboardingDrawer 的 map 回调里抽出来成组件，因为它要调 useVendorHealth——
 * hook 不能在回调里调。顺带把这段 40 行从已经 550+ 行的 Drawer 里挪走（R9）。
 *
 * 胶囊语义：**连不上压倒一切**。参数适配验证（adapterProviderState）得再漂亮，
 * 地址/key 通不了也生成不出东西，所以 unreachable 时红字覆盖 adapter 状态。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconStack2 } from '@tabler/icons-react'
import { FoldableModelCard } from './FoldableModelCard'
import { ModelEnableEditor } from './ModelEnableEditor'
import { CustomVendorManage } from './CustomVendorManage'
import { adapterProviderState } from './adapterVerificationViewModel'
import { useVendorHealth } from './useVendorHealth'
import { vendorConnectionPill } from './vendorConnectionView'
import { type ChipModel } from './ModelChipGroups'
import { shouldSkipImplicitVendorHealth } from './vendorHealthProbePolicy'
import type { ModelSettingsConnectionFocus } from './modelSettingsNavigation'

type ModelEditorProps = React.ComponentProps<typeof ModelEnableEditor>

type CustomVendorCardProps = {
  vendorKey: string
  /** 用户接入时填的「来源名称」（vendorMeta.name）。 */
  name: string
  models: ChipModel[]
  baseUrl: string
  hasApiKey: boolean
  /** Direct-script providers use their explicit test run; generic GET /models is not meaningful. */
  skipHealthProbe?: boolean
  onToggle: ModelEditorProps['onToggle']
  onDelete: ModelEditorProps['onDelete']
  onCustomCall: ModelEditorProps['onCustomCall']
  /** 改类型（接入时按模型名猜的，猜错在这里改）。 */
  onRetype: ModelEditorProps['onRetype']
  onChanged: () => void
  onOpenDetails?: () => void
  detailMode?: boolean
  onOpenModel?: (model: ChipModel) => void
  focus?: ModelSettingsConnectionFocus
}

export function CustomVendorCard({
  vendorKey,
  name,
  models,
  baseUrl,
  hasApiKey,
  skipHealthProbe = false,
  onToggle,
  onDelete,
  onCustomCall,
  onRetype,
  onChanged,
  onOpenDetails,
  detailMode = false,
  onOpenModel,
  focus,
}: CustomVendorCardProps): JSX.Element {
  const { t } = useTranslation()
  const skipImplicitHealth = shouldSkipImplicitVendorHealth({ models })
  const { connection, recheck } = useVendorHealth(vendorKey, {
    hasApiKey,
    baseUrl,
    disableProbe: skipHealthProbe,
    skipImplicitProbe: skipImplicitHealth,
  })
  const enabledN = models.filter((m) => m.enabled).length
  const adapterCard = adapterProviderState(models)
  const adapterLabel =
    adapterCard.state === 'configured'
      ? t('onboardingProviders.drawer.configured')
      : t(`onboardingProviders.adapterVerification.cardStatus.${adapterCard.state}`)
  const health = connection ? vendorConnectionPill(connection) : null
  const unreachable = health?.status === 'error'

  return (
    <FoldableModelCard
      glyph={<IconStack2 size={16} stroke={1.6} />}
      glyphTone="soft"
      name={name}
      subtitle={t('onboardingProviders.drawer.modelsEnabled', { enabled: enabledN, total: models.length })}
      status={
        unreachable ? 'error' : adapterCard.state === 'configured' || adapterCard.state === 'verified' ? 'ok' : 'todo'
      }
      statusLabel={unreachable && health ? t(health.labelKey) : adapterLabel}
      defaultExpanded={false}
      onOpenDetails={onOpenDetails}
      detailMode={detailMode}
    >
      {/* 「连接」在「模型」之前——这一页的主语是连接，模型列表是它的附属。
          此前反着排：24 行模型把地址/凭证挤到弹窗 overflow 之外，落地首屏根本看不见改地址的入口
          （实测铅笔 y=817 / 弹窗底边 y=706），这就是群里「翻了半天没找到」的根因。
          见 docs/plan/2026-08-18-vendor-connection-discoverability.md。 */}
      <CustomVendorManage
        vendorKey={vendorKey}
        vendorName={name}
        baseUrl={baseUrl}
        hasApiKey={hasApiKey}
        modelCount={models.length}
        connection={connection}
        onRecheck={recheck}
        onChanged={onChanged}
        focus={focus}
      />
      <div className="flex flex-col gap-2 border-t border-nomi-line-soft pt-3">
        <h3 className="text-caption font-semibold text-nomi-ink-60">
          {t('onboardingProviders.customVendor.modelsSection')}
        </h3>
        <ModelEnableEditor
          models={models}
          onToggle={onToggle}
          onDelete={onDelete}
          onCustomCall={onCustomCall}
          onRetype={onRetype}
          onOpenModel={onOpenModel}
        />
      </div>
    </FoldableModelCard>
  )
}
