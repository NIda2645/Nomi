import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconDownload, IconUpload } from '../../vendor/tablerIcons'
import { cn } from '../../utils/cn'
import { DesignButton } from '../../design/actions'
import { alertDialog, confirmDialogWithToggle } from '../../design/confirmDialogStore'
import {
  exportModelCatalogPackage,
  importModelCatalogPackage,
  type ModelCatalogImportPackageDto,
  type ModelCatalogImportResultDto,
} from '../../api/desktopClient'
import type { OnboardingCatalogReadOnly } from './useOnboardingDrawerCatalog'

/**
 * 模型设置页顶部那一条**行内横幅**，与它旁边的「导出 / 导入配置」。
 *
 * 为什么这两件事住在同一个文件里：它们回答的是同一个问题——
 * **「我的配置还在不在、出了事我怎么把它拿回来」**。
 * 2026-09-21 那位 Windows 群友换路径重装、装回旧版后看到一片空白，得出的结论是「配置全没了」。
 * 配置一条都没少（根因见 `rootcause-config-loss-on-reinstall.md`），少的是**一句话**：
 * 到底是「你没有」还是「这一次没读到 / 这份只能读」。横幅补的就是那句话；
 * 导出/导入补的是他当时唯一想要的那件事——能把这份配置搬走、搬回来。
 */

/** 横幅只有一种长相（沿用 `bridgeMissing` 那块的形态）：左侧一条色边 + 标题 + 人话 + 一颗动作。 */
export function CatalogNoticeBanner({
  tone = 'warning',
  title,
  body,
  action,
  marker,
}: {
  tone?: 'warning' | 'info'
  title: string
  body: string
  action?: { label: string; onClick: () => void }
  marker: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'mt-4 border-l-2 bg-nomi-ink-05 px-3 py-3',
        tone === 'warning' ? 'border-nomi-warning' : 'border-nomi-accent',
      )}
      data-catalog-notice={marker}
      role="status"
    >
      <div className="text-body-sm font-semibold text-nomi-ink">{title}</div>
      <p className="mt-1 text-caption leading-relaxed text-nomi-ink-60">{body}</p>
      {action ? (
        <DesignButton className="mt-2" variant="light" onClick={action.onClick}>{action.label}</DesignButton>
      ) : null}
    </div>
  )
}

/**
 * 「目录只读」与「这一次读不了」两条横幅。
 *
 * 两条都**不是空白页**：只读时列表照常显示，读失败时上一份数据仍在屏上——
 * 横幅只负责说清楚「为什么现在改不了 / 为什么这份可能是旧的」和下一步做什么。
 */
export function CatalogStatusNotices({
  readOnly,
  loadError,
  onRetry,
}: {
  readOnly: OnboardingCatalogReadOnly | null
  loadError: string | null
  onRetry: () => void
}): JSX.Element | null {
  const { t } = useTranslation()
  if (!readOnly && !loadError) return null
  return (
    <>
      {readOnly ? (
        <CatalogNoticeBanner
          marker={readOnly.reason === 'newer_on_disk' ? 'read-only-newer' : 'read-only-unreadable'}
          title={readOnly.reason === 'newer_on_disk'
            ? t('onboardingProviders.drawer.readOnlyNewerTitle')
            : t('onboardingProviders.drawer.unreadableTitle')}
          body={readOnly.reason === 'newer_on_disk'
            ? t('onboardingProviders.drawer.readOnlyNewerBody', {
              diskVersion: readOnly.diskVersion ?? '?',
              appVersion: readOnly.appVersion ?? '?',
            })
            : t('onboardingProviders.drawer.unreadableBody', {
              path: readOnly.quarantinedPath || readOnly.detail || '',
            })}
        />
      ) : null}
      {loadError ? (
        <CatalogNoticeBanner
          marker="load-error"
          title={t('onboardingProviders.drawer.loadErrorTitle')}
          body={t('onboardingProviders.drawer.loadErrorBody', { detail: loadError })}
          action={{ label: t('common.reload'), onClick: onRetry }}
        />
      ) : null}
    </>
  )
}

function conflictSummary(result: ModelCatalogImportResultDto): string {
  const conflicts = result.conflicts ?? []
  return conflicts.slice(0, 8).map((item) => `· ${item.label || item.key}`).join('\n')
}

/**
 * 导出 / 导入两颗动作。
 *
 * 用图标 + tooltip，不用一串文字当按钮（2026-09-21 用户原话：「一串名字作为按钮很蠢」）。
 * 「导出不含密钥」「导入默认保留本机已有」这两句话**不靠 tooltip 说**——它们会改变用户对结果的
 * 预期，所以写在旁边那行常驻说明里；tooltip 只重复动作名。
 */
export function CatalogPackageActions({ onImported }: { onImported: () => void }): JSX.Element {
  const { t } = useTranslation()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)

  const handleExport = React.useCallback(async () => {
    setBusy(true)
    try {
      const pkg = await exportModelCatalogPackage()
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `nomi-model-catalog-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      await alertDialog({
        title: t('onboardingProviders.drawer.exportFailedTitle'),
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }, [t])

  const handleFile = React.useCallback(async (file: File) => {
    setBusy(true)
    try {
      const payload = JSON.parse(await file.text()) as ModelCatalogImportPackageDto
      // 先按「保留本机已有」试一次：这一趟同时回答了「有没有冲突」和「冲突是哪几条」，
      // 不用再造一条只为预览的通道（预览与真正写入两条路，迟早会答出两个不同的答案）。
      const kept = await importModelCatalogPackage(payload, { conflictPolicy: 'keep' })
      const conflicts = kept.conflicts ?? []
      if (kept.errors.length > 0) {
        await alertDialog({
          title: t('onboardingProviders.drawer.importFailedTitle'),
          message: kept.errors.slice(0, 5).join('\n'),
        })
        return
      }
      if (conflicts.length === 0) {
        onImported()
        await alertDialog({
          title: t('onboardingProviders.drawer.importDoneTitle'),
          message: t('onboardingProviders.drawer.importDoneBody', {
            vendors: kept.imported.vendors, models: kept.imported.models, mappings: kept.imported.mappings,
          }),
        })
        return
      }
      const answer = await confirmDialogWithToggle({
        title: t('onboardingProviders.drawer.importConflictTitle', { count: conflicts.length }),
        message: `${t('onboardingProviders.drawer.importConflictKept')}\n\n${conflictSummary(kept)}`,
        toggleLabel: t('onboardingProviders.drawer.importConflictReplaceToggle'),
        confirmLabel: t('onboardingProviders.drawer.importConflictConfirm'),
      })
      if (!answer.confirmed) return
      if (answer.toggled) await importModelCatalogPackage(payload, { conflictPolicy: 'replace' })
      onImported()
      await alertDialog({
        title: t('onboardingProviders.drawer.importDoneTitle'),
        message: t('onboardingProviders.drawer.importNeedsKey'),
      })
    } catch (error) {
      await alertDialog({
        title: t('onboardingProviders.drawer.importFailedTitle'),
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }, [onImported, t])

  return (
    <div className="flex items-start gap-2 px-3 py-2" data-catalog-package-actions="true">
      <p className="m-0 min-w-0 flex-1 text-micro leading-relaxed text-nomi-ink-60">
        {t('onboardingProviders.drawer.configPackageHint')}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => { void handleExport() }}
        aria-label={t('onboardingProviders.drawer.exportConfig')}
        title={t('onboardingProviders.drawer.exportConfig')}
        data-catalog-package-action="export"
        className="grid size-7 shrink-0 place-items-center rounded-nomi-sm border border-nomi-line text-nomi-ink-60 hover:border-nomi-accent hover:text-nomi-accent disabled:opacity-40"
      >
        <IconUpload size={15} stroke={1.7} aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        aria-label={t('onboardingProviders.drawer.importConfig')}
        title={t('onboardingProviders.drawer.importConfig')}
        data-catalog-package-action="import"
        className="grid size-7 shrink-0 place-items-center rounded-nomi-sm border border-nomi-line text-nomi-ink-60 hover:border-nomi-accent hover:text-nomi-accent disabled:opacity-40"
      >
        <IconDownload size={15} stroke={1.7} aria-hidden="true" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-catalog-package-input="true"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void handleFile(file)
        }}
      />
    </div>
  )
}
