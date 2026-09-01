/**
 * 视频拆解面板：一条参考视频 → 一张结构化分镜表 → 勾选镜头落画布成组。
 *
 * 就近停靠在右槽（Portal 到 .workbench-generation__canvas，右缘对齐，宽度=现役 AI 栏宽度真相源
 * --generation-assistant-target-width，不自立第二个数字，R-C-4）。与「生成」AI 栏**互斥共占**同一右槽
 * （过渡期 R-C-1，交互 epic 落地后并入 Agent 工作区结果卡区）。
 *
 * **结果驱动、调用者无关**（R-C-5/R-C-7）：面板订阅「这条源视频（nodeId）的拆解结果」这个状态，
 * 而不是「谁点了拆解」。节点浮条是第一个调用者，M 线的 Agent 工具是第二个，二者写回同一个槽、渲染同一张卡。
 *
 * ⚠️ 配色一律 --nomi-*：Portal 到画布视口，--workbench-* 够不到会静默退回继承色（NodeShotCutPanel 同坑）。
 * 引擎是**整批返回**（deconstructVideo 一次给全表），进度=阶段指示（找切点→读画面→归对白）即可。
 */
import React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  IconAlertTriangle,
  IconCheck,
  IconFileText,
  IconLayoutList,
  IconLoader2,
  IconScissors,
  IconShieldCheck,
  IconX,
} from '@tabler/icons-react'
import { cn } from '../../../utils/cn'
import { getDesktopBridge } from '../../../desktop/bridge'
import { getActiveWorkbenchProjectId } from '../../project/workbenchProjectSession'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { toast } from '../../../ui/toast'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import type { DeconstructionResult, DeconstructionShot } from './deconstructionTypes'
import { NODE_DECONSTRUCTION_META_KEY } from './deconstructionTypes'
import { extractDeconstructionShotsToNodes } from './extractDeconstructionShotsToNodes'
import DeconstructionShotRow from './DeconstructionShotRow'
import { formatShotTimestamp } from './shotCutSelection'

type Props = { node: GenerationCanvasNode }

/** 进度阶段（引擎整批返回，这里只作阶段指示；跑到哪步是乐观推进，非真实回调）。 */
const PHASES = [0, 1, 2] as const

export default function NodeDeconstructionPanel({ node }: Props): JSX.Element {
  const { t } = useTranslation()
  const nodeId = node.id
  const videoUrl = node.result?.url || ''
  const sourceTitle = (node.title || t('generationCommon.node.extractFrame.defaultVideoTitle')).trim()
  const durationLabel = React.useMemo(() => {
    const meta = node.meta as Record<string, unknown> | undefined
    const seconds = typeof meta?.durationSeconds === 'number' ? meta.durationSeconds : node.result?.durationSeconds
    return typeof seconds === 'number' && seconds > 0 ? formatShotTimestamp(seconds) : ''
  }, [node.meta, node.result])

  const entry = useGenerationCanvasStore((state) => state.videoDeconstructions[nodeId])
  const setEntry = useGenerationCanvasStore((state) => state.setVideoDeconstructionEntry)
  const toggleShot = useGenerationCanvasStore((state) => state.toggleVideoDeconstructionShot)
  const closePanel = useGenerationCanvasStore((state) => state.closeVideoDeconstruction)

  const [committing, setCommitting] = React.useState<{ done: number; total: number } | null>(null)
  const [retryingShot, setRetryingShot] = React.useState<number | null>(null)

  const status = entry?.status ?? 'idle'
  const result = entry?.result
  const selectedIndexes = React.useMemo(() => new Set(entry?.selectedIndexes ?? []), [entry?.selectedIndexes])

  // 首次挂载：若节点 meta 里已有历史拆解结果（收起再开 / 重开项目），直接回填进槽，绝不重复拆。
  React.useEffect(() => {
    if (!entry || entry.status !== 'idle' || entry.result) return
    const meta = node.meta as Record<string, unknown> | undefined
    const cached = meta?.[NODE_DECONSTRUCTION_META_KEY] as DeconstructionResult | undefined
    if (cached && Array.isArray(cached.shots) && cached.shots.length) {
      setEntry(nodeId, {
        status: 'ready',
        result: cached,
        selectedIndexes: cached.shots.filter((shot) => !shot.visionFailed).map((shot) => shot.index),
      })
    }
  }, [entry, node.meta, nodeId, setEntry])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !committing) closePanel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closePanel, committing])

  /** 跑引擎拆解（整批返回）。进度阶段乐观推进给用户一个「在动」的观感。 */
  const runDeconstruct = React.useCallback(async () => {
    const deconstruct = getDesktopBridge()?.video?.deconstruct
    const projectId = getActiveWorkbenchProjectId()
    if (!deconstruct || !projectId || !videoUrl) {
      setEntry(nodeId, { status: 'failed', errorMessage: t('generationCommon.node.deconstruct.desktopOnly') })
      return
    }
    setEntry(nodeId, { status: 'running', phase: 0, errorMessage: '' })
    // 阶段乐观推进（切点很快 → 读画面最久 → 归对白）：非真实回调，只为进度态不呆住。
    const phaseTimers = [
      window.setTimeout(() => setEntry(nodeId, { phase: 1 }), 1200),
      window.setTimeout(() => setEntry(nodeId, { phase: 2 }), 4000),
    ]
    try {
      const out = await deconstruct({ videoUrl, projectId })
      const typed = out as DeconstructionResult
      // 结果写回节点 meta（提示词/结构随节点走，收起态角标据此显示，重开不重拆）。
      useGenerationCanvasStore.getState().updateNode(nodeId, {
        meta: { ...(node.meta || {}), [NODE_DECONSTRUCTION_META_KEY]: typed, durationSeconds: typed.durationSeconds },
      })
      setEntry(nodeId, {
        status: 'ready',
        result: typed,
        phase: 2,
        selectedIndexes: typed.shots.filter((shot) => !shot.visionFailed).map((shot) => shot.index),
      })
    } catch (error) {
      setEntry(nodeId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    } finally {
      phaseTimers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [node.meta, nodeId, setEntry, t, videoUrl])

  /** 单镜重拆（引擎无逐镜接口 → v1 重跑整片再合并；只把失败镜的字段替换回来，保住用户已勾选）。 */
  const retryShot = React.useCallback(
    async (shotIndex: number) => {
      const deconstruct = getDesktopBridge()?.video?.deconstruct
      const projectId = getActiveWorkbenchProjectId()
      if (!deconstruct || !projectId || !videoUrl || !result) return
      setRetryingShot(shotIndex)
      try {
        const out = (await deconstruct({ videoUrl, projectId })) as DeconstructionResult
        const fresh = out.shots.find((shot) => shot.index === shotIndex)
        if (!fresh) return
        const nextShots = result.shots.map((shot) => (shot.index === shotIndex ? fresh : shot))
        const nextResult: DeconstructionResult = {
          ...result,
          shots: nextShots,
          failedShotIndexes: nextShots.filter((shot) => shot.visionFailed).map((shot) => shot.index),
        }
        useGenerationCanvasStore.getState().updateNode(nodeId, {
          meta: { ...(node.meta || {}), [NODE_DECONSTRUCTION_META_KEY]: nextResult },
        })
        setEntry(nodeId, { result: nextResult })
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), 'error')
      } finally {
        setRetryingShot(null)
      }
    },
    [node.meta, nodeId, result, setEntry, videoUrl],
  )

  const selectedShots = React.useMemo<DeconstructionShot[]>(
    () => (result?.shots ?? []).filter((shot) => selectedIndexes.has(shot.index)),
    [result, selectedIndexes],
  )

  /** 勾选的镜头逐个落节点、自动编组、整批一个 Cmd+Z（复用旧拍板 extractDeconstructionShotsToNodes）。 */
  const addToCanvas = React.useCallback(async () => {
    if (!selectedShots.length || committing) return
    setCommitting({ done: 0, total: selectedShots.length })
    const outcome = await extractDeconstructionShotsToNodes({
      node,
      shots: selectedShots,
      onProgress: (progress) => setCommitting(progress),
    })
    setCommitting(null)
    if (outcome.created > 0) closePanel()
  }, [closePanel, committing, node, selectedShots])

  /** 用这套结构起稿：把镜头表整理成草稿推进现有生成 AI composer（复用 setGenerationAiDraft）。 */
  const startDraft = React.useCallback(() => {
    if (!result) return
    const lines = result.shots.map((shot) => {
      const parts = [
        t('generationCommon.node.deconstruct.shotLabel', { shot: shot.index }),
        shot.shotSize,
        shot.visual || shot.imagePrompt,
      ].filter((part) => part && String(part).trim())
      return parts.join(' · ')
    })
    const draft = `${t('generationCommon.node.deconstruct.draftHeader', { title: sourceTitle })}\n${lines.join('\n')}`
    useGenerationCanvasStore.getState().setGenerationAiDraft(draft)
    // 起稿即把右槽让给 AI 栏（草稿落在它的输入里）——互斥自动把拆解收成节点浮条。
    useGenerationCanvasStore.getState().setGenerationAiCollapsed(false)
  }, [result, sourceTitle, t])

  // ── 渲染 ────────────────────────────────────────────────────────────────
  const header = (
    <div className="flex shrink-0 items-center gap-3 border-b border-nomi-line px-4 py-3">
      <div className="grid size-[34px] shrink-0 place-items-center rounded-nomi bg-nomi-ink-05 text-nomi-ink-60">
        <IconScissors size={18} stroke={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-body-lg font-semibold text-nomi-ink">{t('generationCommon.node.deconstruct.title')}</div>
        <div className="truncate text-micro text-nomi-ink-40">
          {sourceTitle}
          {durationLabel ? ` · ${durationLabel}` : ''}
        </div>
      </div>
      <button
        type="button"
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-nomi-sm border-0 bg-transparent cursor-pointer',
          'text-nomi-ink-60 hover:bg-nomi-ink-05 hover:text-nomi-ink disabled:opacity-40',
        )}
        aria-label={t('generationCommon.node.deconstruct.close')}
        data-deconstruct-close="true"
        disabled={Boolean(committing)}
        onClick={() => closePanel()}
      >
        <IconX size={16} stroke={1.8} />
      </button>
    </div>
  )

  return createPortal(
    <section
      className={cn(
        'absolute inset-y-0 right-0 z-[90] flex flex-col',
        'w-[var(--generation-assistant-target-width,340px)] max-w-full',
        'border-l border-nomi-line bg-nomi-paper shadow-nomi-lg',
      )}
      role="dialog"
      aria-modal="false"
      aria-label={t('generationCommon.node.deconstruct.title')}
      data-deconstruct-panel={nodeId}
      data-deconstruct-status={status}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {header}

      {status === 'idle' ? (
        <DeconstructionEmptyState onStart={() => void runDeconstruct()} />
      ) : status === 'running' ? (
        <DeconstructionRunningState phase={entry?.phase ?? 0} shotCount={result?.shots.length ?? 0} />
      ) : status === 'failed' ? (
        <DeconstructionFailedState message={entry?.errorMessage ?? ''} onRetry={() => void runDeconstruct()} />
      ) : result ? (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-nomi-line-soft px-4 py-2.5">
            <div className="w-full text-body-sm text-nomi-ink-80">
              {t('generationCommon.node.deconstruct.resultLead', { count: result.shots.length })}
            </div>
            <span className="inline-flex items-center gap-1 rounded-pill bg-nomi-accent-soft px-2 py-0.5 text-micro text-nomi-accent">
              <IconShieldCheck size={13} stroke={1.8} aria-hidden />
              {t('generationCommon.node.deconstruct.chipLocalEvidence')}
            </span>
            <span className="inline-flex items-center rounded-pill bg-nomi-ink-05 px-2 py-0.5 text-micro text-nomi-ink-60">
              {result.hasAudio
                ? t('generationCommon.node.deconstruct.chipHasAudio')
                : t('generationCommon.node.deconstruct.chipNoAudio')}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" data-deconstruct-shots="true">
            {result.shots.map((shot) => (
              <DeconstructionShotRow
                key={shot.index}
                shot={shot}
                selected={selectedIndexes.has(shot.index)}
                onToggle={() => toggleShot(nodeId, shot.index)}
                onRetryShot={() => void retryShot(shot.index)}
                retrying={retryingShot === shot.index}
              />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2.5 border-t border-nomi-line px-4 py-3">
            <button
              type="button"
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full border-0 bg-transparent px-3 cursor-pointer',
                'text-body-sm text-nomi-ink-60 hover:bg-nomi-ink-05 hover:text-nomi-ink disabled:opacity-40',
              )}
              data-deconstruct-start-draft="true"
              disabled={Boolean(committing)}
              onClick={startDraft}
            >
              <IconFileText size={14} stroke={1.8} />
              {t('generationCommon.node.deconstruct.startDraft')}
            </button>
            <span className="ml-auto text-micro tabular-nums text-nomi-ink-40">
              {committing
                ? t('generationCommon.node.deconstruct.committing', { done: committing.done, total: committing.total })
                : t('generationCommon.node.deconstruct.selectedCount', {
                    selected: selectedShots.length,
                    total: result.shots.length,
                  })}
            </span>
            <button
              type="button"
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full border-0 px-4 cursor-pointer',
                'bg-nomi-ink text-body-sm font-medium text-nomi-paper hover:bg-nomi-accent',
                'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              )}
              data-deconstruct-add-to-canvas="true"
              title={
                selectedShots.length ? undefined : t('generationCommon.node.deconstruct.addToCanvasDisabledHint')
              }
              disabled={!selectedShots.length || Boolean(committing)}
              onClick={() => void addToCanvas()}
            >
              <IconLayoutList size={14} stroke={1.8} />
              {t('generationCommon.node.deconstruct.addToCanvas', { count: selectedShots.length })}
            </button>
          </div>
        </>
      ) : null}
    </section>,
    getCanvasViewport(),
  )
}

/** Portal 目标：画布视口（右缘对齐停靠、宽度取那上面继承的 --generation-assistant-target-width）。 */
function getCanvasViewport(): HTMLElement {
  const el = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.workbench-generation__canvas')
  return el ?? document.body
}

/** 空态：可拆但还没拆，含隐私披露 + 「开始拆解」。 */
function DeconstructionEmptyState({ onStart }: { onStart: () => void }): JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-8">
        <div className="mb-3.5 grid size-10 place-items-center rounded-nomi bg-nomi-ink-05 text-nomi-ink-60">
          <IconLayoutList size={18} stroke={1.8} />
        </div>
        <h3 className="text-body font-semibold text-nomi-ink">{t('generationCommon.node.deconstruct.emptyTitle')}</h3>
        <p className="mt-1 max-w-[380px] text-body-sm leading-relaxed text-nomi-ink-60">
          {t('generationCommon.node.deconstruct.emptyBody')}
        </p>
        <div className="mt-4 max-w-[380px] border-l-2 border-nomi-line pl-3">
          <div className="text-body-sm font-medium text-nomi-ink">
            {t('generationCommon.node.deconstruct.disclosureTitle')}
          </div>
          <p className="mt-0.5 text-body-sm text-nomi-ink-60">{t('generationCommon.node.deconstruct.disclosureBody')}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center border-t border-nomi-line px-4 py-3">
        <span className="text-micro text-nomi-ink-40">{t('generationCommon.node.deconstruct.emptyEta')}</span>
        <button
          type="button"
          className={cn(
            'ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border-0 px-4 cursor-pointer',
            'bg-nomi-ink text-body-sm font-medium text-nomi-paper hover:bg-nomi-accent transition-colors',
          )}
          data-deconstruct-start="true"
          onClick={onStart}
        >
          {t('generationCommon.node.deconstruct.startAction')}
        </button>
      </div>
    </>
  )
}

/** 进行中：诚实阶段文案 + 可安全关闭后台继续。 */
function DeconstructionRunningState({ phase, shotCount }: { phase: number; shotCount: number }): JSX.Element {
  const { t } = useTranslation()
  const phaseLabels = [
    t('generationCommon.node.deconstruct.phaseCuts'),
    t('generationCommon.node.deconstruct.phaseVision'),
    t('generationCommon.node.deconstruct.phaseDialogue'),
  ]
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col px-6 pt-7">
        <div className="mb-3.5 grid size-10 place-items-center rounded-nomi bg-nomi-accent-soft text-nomi-accent">
          <IconLoader2 size={18} stroke={1.8} className="animate-spin" />
        </div>
        <h3 className="text-body font-semibold text-nomi-ink">{t('generationCommon.node.deconstruct.runningTitle')}</h3>
        <p className="mt-1 max-w-[380px] text-body-sm leading-relaxed text-nomi-ink-60">
          {t('generationCommon.node.deconstruct.runningBody')}
        </p>
        <div className="mt-4 flex max-w-[400px] flex-col gap-2">
          {PHASES.map((step) => (
            <div
              key={step}
              className={cn(
                'flex items-center gap-2.5 text-body-sm',
                step <= phase ? 'font-medium text-nomi-ink' : 'text-nomi-ink-60',
              )}
            >
              <span
                className={cn(
                  'grid size-4 shrink-0 place-items-center rounded-full',
                  step < phase && 'bg-nomi-track-video text-nomi-paper',
                  step === phase && 'border-2 border-nomi-accent',
                  step > phase && 'border-[1.5px] border-nomi-ink-20',
                )}
              >
                {step < phase ? <IconCheck size={11} stroke={2.4} /> : null}
              </span>
              {phaseLabels[step]}
              {step === 0 && shotCount > 0 ? ` · ${t('generationCommon.node.deconstruct.cutCount', { count: shotCount })}` : ''}
            </div>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center border-t border-nomi-line px-4 py-3">
        <span className="text-micro text-nomi-ink-40">{t('generationCommon.node.deconstruct.runningSafeClose')}</span>
      </div>
    </>
  )
}

/** 整次失败（区别于逐镜 visionFailed）：给下一步、可重试。 */
function DeconstructionFailedState({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-8">
      <div className="mb-3.5 grid size-10 place-items-center rounded-nomi bg-nomi-warning-soft text-nomi-warning">
        <IconAlertTriangle size={18} stroke={1.8} />
      </div>
      <h3 className="text-body font-semibold text-nomi-ink">{t('generationCommon.node.deconstruct.failedTitle')}</h3>
      <p className="mt-1 max-w-[380px] break-words text-body-sm leading-relaxed text-nomi-ink-60">
        {message || t('generationCommon.node.deconstruct.failedBody')}
      </p>
      <button
        type="button"
        className={cn(
          'mt-4 inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-nomi-line px-4 cursor-pointer',
          'bg-nomi-paper text-body-sm font-medium text-nomi-ink hover:bg-nomi-ink-05',
        )}
        data-deconstruct-retry="true"
        onClick={onRetry}
      >
        {t('generationCommon.node.deconstruct.retryAction')}
      </button>
    </div>
  )
}
