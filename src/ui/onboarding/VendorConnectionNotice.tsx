/**
 * 展开卡片后的连接状态说明块。只在两种状态下出现：
 *  - unreachable：给出上游那句原因 +「重新检查」（失败态的情境控件，§1.5 L2——
 *    不进常驻，正常连通的家不该看到任何测试类按钮）
 *  - unsupported：诚实说明这家没有可预检的接口，别甩「暂不支持自动测试」那种实现视角的话
 *
 * 这里**不**放「改地址」按钮：地址编辑已经有它的家（下面那支铅笔），
 * 同一动作只保留一个规范入口（设计系统 §1.5.2 硬规则 1）。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertCircle, IconInfoCircle, IconRefresh } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import type { VendorConnection } from './useVendorHealth'

type VendorConnectionNoticeProps = {
  connection: VendorConnection | null
  onRecheck: () => void
  disabled?: boolean
}

export function VendorConnectionNotice({
  connection,
  onRecheck,
  disabled,
}: VendorConnectionNoticeProps): JSX.Element | null {
  const { t } = useTranslation()
  if (!connection) return null

  if (connection.state === 'unreachable') {
    return (
      <div className="rounded-nomi-sm bg-[var(--workbench-danger-soft)] px-2.5 py-2 flex flex-col gap-2">
        <div className="flex gap-1.5 items-start">
          <IconAlertCircle size={14} stroke={1.7} className="shrink-0 mt-[1px] text-workbench-danger" />
          <span className="text-caption text-workbench-danger leading-relaxed">
            {connection.reason || t('onboardingProviders.vendorCard.connection.unknownReason')}
          </span>
        </div>
        <button
          type="button"
          onClick={onRecheck}
          disabled={disabled}
          className={cn(
            'self-start inline-flex items-center gap-1.5 h-7 px-2.5 rounded-nomi-sm',
            'bg-nomi-ink text-nomi-paper text-caption font-semibold',
            'hover:bg-nomi-accent disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <IconRefresh size={13} stroke={1.8} />
          {t('onboardingProviders.vendorCard.connection.recheck')}
        </button>
      </div>
    )
  }

  if (connection.state === 'unsupported') {
    return (
      <div className="flex gap-1.5 items-start">
        <IconInfoCircle size={13} stroke={1.6} className="shrink-0 mt-[2px] text-nomi-ink-40" />
        <span className="text-caption text-nomi-ink-40 leading-relaxed">
          {t('onboardingProviders.vendorCard.connection.unsupportedHint')}
        </span>
      </div>
    )
  }

  return null
}
