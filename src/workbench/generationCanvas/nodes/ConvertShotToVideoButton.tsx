import React from 'react'
import type { ShotIdentity } from '../../../../electron/shared/canvas/shotNumbering'
import { useTranslation } from 'react-i18next'

/** 镜头号由框外 NodeLabelRow 定位，不随选择或生成状态换位。 */
export function ShotPreviewOverlays({
  shotIndex,
  shotRole,
}: {
  shotIndex?: number | null
  shotRole?: ShotIdentity['shotRole']
}): JSX.Element | null {
  const { t } = useTranslation()
  const role = shotRole === 'first_frame' ? t('generationCommon.shotConversion.firstFrame')
    : shotRole === 'video' ? t('generationCommon.shotConversion.video') : ''
  if (shotIndex == null && !role) return null
  const label = [shotIndex == null ? '' : t('generationCommon.shotConversion.shot', { index: shotIndex }), role].filter(Boolean).join(' · ')
  return (
    <span data-shot-number className="inline-flex shrink-0 items-center rounded-nomi-sm border border-nomi-line bg-nomi-paper/90 px-2 py-0.5 text-nomi-ink font-normal tabular-nums pointer-events-none">
      {label}
    </span>
  )
}
