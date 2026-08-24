// P4 S5 — 多镜占位节点的三态视觉（排队中 / 生成中 / 已停 / 失败）。
//
// 真相源 = Run 的 jobs[]（deriveShotPlaceholderState 纯派生），经 ProductionCanvasLandingHost 的 poll 喂进
// landing store。占位只在「节点属某多镜 Run（meta.productionRunId）且还没回填 result」时渲染——一旦 result 到
// （attach-shot-result 逐个冒），占位退场、露出真片。禁「永远等待生成」假进度：无对应 job 显「排队中」不显生成中。
//
// 状态色一律根层 token（#128 后）：已停 = --nomi-warning（非 danger，预算/急停是可继续的中止，不是错误）；
// 失败 = 复用 NodeErrorReport 的 danger 视觉语言（重试钮本切片**只留位不接线**，返工链是 S6）。
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconClock, IconPlayerPause, IconRefresh } from '@tabler/icons-react'

import { cn } from '../../../utils/cn'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useProductionCanvasLandingStore } from '../../production/productionCanvasLandingStore'
import { deriveShotPlaceholderState } from '../../production/shotPlaceholderState'
import { GeneratingOverlay } from './render/CardCommon'

/** 该节点是否属某多镜 Run 的占位（meta.productionRunId）。非占位 → 组件早退，零开销。 */
function productionRunIdOf(node: GenerationCanvasNode): string | null {
  const meta = node.meta as Record<string, unknown> | undefined
  return typeof meta?.productionRunId === 'string' && meta.productionRunId ? meta.productionRunId : null
}

export function ProductionShotPlaceholder({ node }: { node: GenerationCanvasNode }): JSX.Element | null {
  const { t } = useTranslation()
  const runId = productionRunIdOf(node)
  // 只在这个 Run 是 store 当前缓存的那个时派生（避免读到别的项目/Run 的态）。
  const state = useProductionCanvasLandingStore((store) =>
    runId && store.run?.runId === runId ? deriveShotPlaceholderState(store.run, node.id) : null,
  )

  // 非占位节点 / 已回填 result（占位退场）/ 派生为 done → 不渲染任何占位（露出真片）。
  if (!runId || !state || state.phase === 'done') return null
  if (node.result?.url) return null

  if (state.phase === 'generating') {
    // 生成中：复用现成 GeneratingOverlay 视觉语言（云任务默认遮罩），带 data 锚点供走查。
    return (
      <div className="absolute inset-0 z-[4]" data-shot-placeholder-state="generating" data-production-shot-node={node.id}>
        <GeneratingOverlay />
      </div>
    )
  }

  if (state.phase === 'queued') {
    // 排队中（第 n/N）：左上角小徽标（同 NodeQueuedBadge 语言）+ 棋盘格占位（节点本来就没生成出来）。
    const label = state.queueIndex && state.queueTotal
      ? t('generationCommon.production.canvasLanding.queuedNth', { index: state.queueIndex, total: state.queueTotal })
      : t('generationCommon.production.canvasLanding.queued')
    return (
      <div
        className="absolute left-2 top-2 z-[4] inline-flex items-center gap-1 rounded-full bg-nomi-paper/85 px-2 py-0.5 text-micro text-nomi-ink-60 shadow-nomi-sm"
        data-shot-placeholder-state="queued"
        data-production-shot-node={node.id}
        aria-label={label}
      >
        <IconClock size={11} stroke={1.8} aria-hidden="true" />
        {label}
      </div>
    )
  }

  if (state.phase === 'stopped') {
    // 已停（预算触顶 / 用户急停）：warning 底（非 danger），一句人话 + 提额/继续入口占位（S6 接线）。
    const message = state.stoppedReason === 'budget'
      ? t('generationCommon.production.canvasLanding.stoppedBudget')
      : t('generationCommon.production.canvasLanding.stoppedManual')
    const actionLabel = state.stoppedReason === 'budget'
      ? t('generationCommon.production.canvasLanding.raiseBudget')
      : t('generationCommon.production.canvasLanding.continueRemaining')
    return (
      <div
        role="status"
        data-shot-placeholder-state="stopped"
        data-production-shot-node={node.id}
        className={cn(
          'absolute inset-0 z-[4] flex flex-col items-center justify-center gap-2 rounded-nomi p-4 text-center',
          'bg-[color-mix(in_oklch,var(--nomi-warning)_6%,var(--nomi-paper))]',
          'border border-[color-mix(in_oklch,var(--nomi-warning)_28%,transparent)]',
        )}
      >
        <IconPlayerPause size={18} stroke={1.6} className="text-nomi-warning" aria-hidden="true" />
        <span className="text-caption leading-snug text-nomi-ink-80">{message}</span>
        {/* 提额/继续入口：本切片**只留位不接线**（返工/续拍链是 S6）。disabled 且标注，避免点了没反应。 */}
        <button
          type="button"
          disabled
          data-production-shot-action="resume-pending-s6"
          className="cursor-not-allowed rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2.5 py-1 text-caption text-nomi-ink-40"
          title={t('generationCommon.production.canvasLanding.actionComingSoon')}
        >
          {actionLabel}
        </button>
      </div>
    )
  }

  // failed：复用 NodeErrorReport 的 danger 视觉语言（这里内联一版精简的，重试钮只留位不接线 = S6）。
  return (
    <div
      role="alert"
      data-shot-placeholder-state="failed"
      data-production-shot-node={node.id}
      className={cn(
        'absolute inset-0 z-[4] flex flex-col rounded-nomi p-4',
        'bg-[color-mix(in_oklch,var(--nomi-danger)_5%,var(--nomi-paper))]',
        'border border-[color-mix(in_oklch,var(--nomi-danger)_24%,transparent)]',
      )}
    >
      <div className="flex items-start gap-2">
        <IconAlertTriangle size={16} stroke={1.6} className="mt-[1px] shrink-0 text-nomi-danger" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-body font-bold leading-snug text-nomi-ink">
          {t('generationCommon.production.canvasLanding.failedTitle')}
        </span>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto" onWheel={(event) => event.stopPropagation()}>
        <p className="break-words text-caption leading-relaxed text-nomi-ink-60">
          {state.failureMessage || t('generationCommon.production.canvasLanding.failedFallback')}
        </p>
      </div>
      {/* 重试钮：本切片**只留位不接线**（返工链带锚参考 + 单镜确认 = S6，一功能一个家）。 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          data-production-shot-action="retry-pending-s6"
          className="inline-flex shrink-0 cursor-not-allowed items-center gap-1 whitespace-nowrap rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2.5 py-1 text-caption text-nomi-ink-40"
          title={t('generationCommon.production.canvasLanding.actionComingSoon')}
        >
          <IconRefresh size={13} stroke={1.6} aria-hidden="true" />
          {t('generationCommon.production.canvasLanding.retry')}
        </button>
      </div>
    </div>
  )
}
