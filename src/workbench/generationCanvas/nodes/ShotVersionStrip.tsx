// P4 S6 — 多镜节点的极简版本条（返工后一个镜头节点会有多版：旧版仍在 history、新版是 result）。
//
// 与 ImageResultStack 的区别（P1 不复用它的 image-only 实现）：① 支持 video（缩略用 thumbnailUrl，没有则显首帧占位）；
// ② 切版走 rollbackHistory（**只改 node.result 指向、history 顺序不动**）而非 promoteNodeResult（后者重排 history →
// 「切回旧版再切新版」会错乱，见计划 §2 岔路裁定）。只对多镜节点（meta.productionRunId）且 history≥1 时出，L2 情境
// 控件（选中才出，§1.5），token-only。「重拍这镜」入口也在这（= 触发返工，一功能一个家 §3.F）。
// 门是 ≥1 不是 ≥2：另两个返工入口（失败占位钮 / NodeErrorReport onRetry）都只在错误态上，成功镜的**第一次**返工
// 只有这里可进——若等 history≥2 才出条，而 history 到 2 又只能靠返工，入口就死锁在门后（拍成了想重来的镜永远无门）。
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconCheck, IconChevronRight, IconRefresh } from '@tabler/icons-react'
import { AnimatePresence, motion } from 'framer-motion'

import { cn } from '../../../utils/cn'
import type { GenerationCanvasNode, GenerationNodeResult } from '../model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { getActiveWorkbenchProjectId } from '../../project/workbenchProjectSession'
import { reworkProductionShot } from '../../production/productionShotActions'

/** 该节点属某多镜 Run + 携带 shotId（materialize 落节点时写 meta.productionRunId / meta.productionShotId）。 */
function productionMetaOf(node: GenerationCanvasNode): { runId: string; shotId?: string } | null {
  const meta = node.meta as Record<string, unknown> | undefined
  const runId = typeof meta?.productionRunId === 'string' && meta.productionRunId ? meta.productionRunId : ''
  if (!runId) return null
  const shotId = typeof meta?.productionShotId === 'string' && meta.productionShotId ? meta.productionShotId : undefined
  return { runId, ...(shotId ? { shotId } : {}) }
}

/** 一个版本条目的缩略（video 用 thumbnailUrl；image 用 url；都没有则给纯色占位不塞坏图）。 */
function VersionThumb({ result, label }: { result: GenerationNodeResult; label: string }): JSX.Element {
  const thumb = result.type === 'image' ? (result.thumbnailUrl || result.url) : result.thumbnailUrl
  if (thumb) {
    return <img className="h-full w-full bg-nomi-paper object-cover" src={thumb} alt={label} draggable={false} />
  }
  // video 无首帧缩略：给中性占位（不塞坏图），仍可点切换。
  return <div className="grid h-full w-full place-items-center bg-nomi-ink-05 text-micro text-nomi-ink-40" aria-hidden="true">▷</div>
}

export function ShotVersionStrip({ node, selected }: { node: GenerationCanvasNode; selected: boolean }): JSX.Element | null {
  const { t } = useTranslation()
  const rollbackHistory = useGenerationCanvasStore((state) => state.rollbackHistory)
  // projectId 用画布层正源（工作台会话），不用 landing store：版本条纯靠节点持久数据渲染，返工在
  // 「隔天回来、run 早已不挂在生产面板上」时也必须可用；landing store 只有活动 run 时才有值（占位三态
  // 才该耦合它——占位本来就派生自那个 store）。ClipNode 同款惯用法。
  const projectId = getActiveWorkbenchProjectId()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const production = productionMetaOf(node)
  // history 由 mergeResultHistory「新在前」累积；当前版 = node.result。版本列表 = 去重后的 history（含当前）。
  const versions = React.useMemo(() => (node.history || []).filter((entry) => entry.id || entry.url), [node.history])
  const currentId = node.result?.id || ''
  const currentIndex = React.useMemo(() => {
    const idx = versions.findIndex((entry) => (entry.id && entry.id === currentId) || (node.result?.url && entry.url === node.result.url))
    return idx >= 0 ? idx : 0
  }, [versions, currentId, node.result?.url])

  React.useEffect(() => {
    if (!selected || versions.length < 1) setOpen(false)
  }, [selected, versions.length])

  // 门：多镜节点 + 已有版本（≥1，首版即可返工；为什么不是 ≥2 见文件头）+ 选中。非此不出（L2 情境控件，§1.5）。
  if (!production || versions.length < 1 || !selected) return null

  const switchTo = (entry: GenerationNodeResult) => {
    if (!entry.id) return
    rollbackHistory(node.id, entry.id)
    setOpen(false)
  }
  const rerun = () => {
    if (!projectId || busy) return
    setBusy(true)
    void reworkProductionShot(projectId, production.runId, production.shotId).finally(() => setBusy(false))
  }

  return (
    <>
      {/* 版本徽标（bottom-left，与 ImageResultStack 的 count 徽标同语言、对称另一角，避免与它撞位）。 */}
      <div
        className={cn(
          'absolute bottom-2 left-2 z-[8] inline-flex items-center overflow-hidden rounded-full',
          'border border-nomi-line bg-nomi-paper text-nomi-ink shadow-nomi-md',
          'pointer-events-auto',
          'group-data-[dragging=true]/canvas:invisible',
        )}
        data-shot-version-strip={node.id}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 border-0 bg-transparent px-2.5 text-body-sm font-semibold tabular-nums text-inherit"
          aria-label={t('generationCommon.production.canvasLanding.versionStrip.expandAria', { count: versions.length })}
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation()
            setOpen((value) => !value)
          }}
        >
          {t('generationCommon.production.canvasLanding.versionStrip.badge', { index: currentIndex + 1, total: versions.length })}
          <IconChevronRight size={14} stroke={2} className={cn('transition-transform duration-150', open && 'rotate-90')} aria-hidden="true" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && selected ? (
          <motion.div
            className="absolute bottom-11 left-2 z-[12] flex max-w-[280px] flex-wrap gap-2 rounded-nomi border border-nomi-line bg-nomi-paper p-2 shadow-nomi-lg"
            role="list"
            aria-label={t('generationCommon.production.canvasLanding.versionStrip.current')}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.3, 1] }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {versions.map((entry, index) => {
              const isCurrent = index === currentIndex
              const label = t('generationCommon.production.canvasLanding.versionStrip.versionAlt', { index: index + 1 })
              return (
                <button
                  key={entry.id || entry.url || index}
                  type="button"
                  role="listitem"
                  data-shot-version-item={entry.id || ''}
                  {...(isCurrent ? { 'data-shot-version-current': 'true' } : {})}
                  aria-current={isCurrent ? 'true' : undefined}
                  title={isCurrent ? t('generationCommon.production.canvasLanding.versionStrip.currentBadge') : t('generationCommon.production.canvasLanding.versionStrip.switchTo')}
                  className={cn(
                    'relative h-14 w-14 overflow-hidden rounded-nomi-sm ring-1 ring-inset transition-shadow duration-150',
                    isCurrent ? 'ring-nomi-accent' : 'ring-nomi-line hover:ring-nomi-ink-20',
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!isCurrent) switchTo(entry)
                  }}
                >
                  <VersionThumb result={entry} label={label} />
                  {isCurrent ? (
                    <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-nomi-accent text-nomi-paper" aria-hidden="true">
                      <IconCheck size={10} stroke={2.6} />
                    </span>
                  ) : null}
                </button>
              )
            })}
            {/* 「重拍这镜」= 触发返工（一功能一个家 §3.F），紧贴版本条。 */}
            <button
              type="button"
              disabled={busy || !projectId}
              data-shot-version-rerun="true"
              className={cn(
                'inline-flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-nomi-sm border text-micro',
                busy || !projectId
                  ? 'cursor-not-allowed border-nomi-line bg-nomi-paper text-nomi-ink-40'
                  : 'border-dashed border-nomi-line bg-nomi-paper text-nomi-ink-60 hover:border-nomi-ink-20 hover:text-nomi-ink',
              )}
              onClick={(event) => {
                event.stopPropagation()
                rerun()
              }}
            >
              <IconRefresh size={16} stroke={1.6} aria-hidden="true" />
              {t('generationCommon.production.canvasLanding.versionStrip.rerun')}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
