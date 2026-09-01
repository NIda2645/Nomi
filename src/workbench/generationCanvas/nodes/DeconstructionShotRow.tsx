// 拆解面板里的一行镜头卡（勾选框 + 对照帧 + 字段）。抽成独立组件让 NodeDeconstructionPanel 保持精简（R9）。
//
// 配色一律 --nomi-*：面板 Portal 到画布视口，--workbench-* 只在 .workbench-shell 作用域内有定义，
// 够不到会静默退回继承色（NodeShotCutPanel 头注释同一坑）。
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconCheck, IconCornerDownRight } from '@tabler/icons-react'
import { cn } from '../../../utils/cn'
import { formatShotTimestamp } from './shotCutSelection'
import type { DeconstructionShot } from './deconstructionTypes'

type Props = {
  shot: DeconstructionShot
  selected: boolean
  onToggle: () => void
  onRetryShot: () => void
  retrying: boolean
}

/** 一个字段行：标签 + 值（提示词类值用等宽底纹与正文区分）。空值不渲染整行。 */
function Field({ label, value, prompt = false }: { label: string; value: string; prompt?: boolean }): JSX.Element | null {
  if (!value.trim()) return null
  return (
    <div className="mt-1.5 flex gap-1.5 text-body-sm leading-normal">
      <span className="w-10 shrink-0 text-nomi-ink-40">{label}</span>
      <span
        className={cn(
          'min-w-0 text-nomi-ink-80',
          prompt && 'rounded-nomi-sm bg-nomi-ink-05 px-1.5 py-0.5 font-mono text-micro text-nomi-ink-60',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function DeconstructionShotRowImpl({ shot, selected, onToggle, onRetryShot, retrying }: Props): JSX.Element {
  const { t } = useTranslation()
  const failed = shot.visionFailed === true
  return (
    <div
      className={cn(
        'flex gap-3 border-b border-nomi-line-soft px-4 py-3.5',
        'transition-colors hover:bg-nomi-ink-05',
        selected && 'bg-nomi-accent-soft',
      )}
      data-deconstruct-shot={shot.index}
      data-selected={selected ? 'true' : 'false'}
      data-vision-failed={failed ? 'true' : 'false'}
    >
      {/* 勾选框：失败镜也能勾（对白仍可用），只是没画面提示词。 */}
      <button
        type="button"
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-nomi-sm border-[1.5px] cursor-pointer',
          selected ? 'border-nomi-accent bg-nomi-accent text-nomi-paper' : 'border-nomi-ink-30 bg-transparent',
        )}
        role="checkbox"
        aria-checked={selected}
        aria-label={t('generationCommon.node.deconstruct.toggleShot', { shot: shot.index })}
        data-deconstruct-shot-toggle={shot.index}
        onClick={onToggle}
      >
        {selected ? <IconCheck size={12} stroke={2.2} /> : null}
      </button>

      {/* 对照帧（sourceFrameUrl 只读缩略图）+ 镜号/时间。失败镜灰掉。 */}
      <div className="w-[92px] shrink-0">
        <div
          className={cn(
            'h-[60px] w-[92px] overflow-hidden rounded-nomi-sm bg-nomi-ink-05 bg-cover bg-center',
            failed && 'opacity-50 grayscale',
          )}
          style={shot.sourceFrameUrl ? { backgroundImage: `url("${shot.sourceFrameUrl}")` } : undefined}
          aria-hidden
        />
        <div className="mt-1 flex justify-between text-micro tabular-nums text-nomi-ink-40">
          <span>{t('generationCommon.node.deconstruct.shotLabel', { shot: shot.index })}</span>
          <span>
            {formatShotTimestamp(shot.startSeconds)}–{formatShotTimestamp(shot.endSeconds)}
          </span>
        </div>
      </div>

      {/* 正文：序号 + 景别 + 情绪 + 承接标 + 时长；画面描述；字幕/对白/图片/运镜字段。 */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-body-lg font-semibold text-nomi-ink">{shot.index}</span>
          {shot.shotSize ? (
            <span className="rounded-pill px-2 py-0.5 text-micro font-medium text-nomi-accent bg-nomi-accent-soft">
              {shot.shotSize}
            </span>
          ) : null}
          {shot.mood ? (
            <span className="rounded-pill bg-nomi-ink-05 px-2 py-0.5 text-micro text-nomi-ink-60">{shot.mood}</span>
          ) : null}
          {shot.carriedOver ? (
            <span className="inline-flex items-center gap-1 rounded-pill bg-nomi-warning-soft px-1.5 py-0.5 text-micro text-nomi-warning">
              <IconCornerDownRight size={12} stroke={1.8} aria-hidden />
              {t('generationCommon.node.deconstruct.carriedOver')}
            </span>
          ) : null}
          <span className="ml-auto text-micro tabular-nums text-nomi-ink-40">
            {t('generationCommon.node.deconstruct.durationSeconds', { seconds: shot.durationSeconds.toFixed(1) })}
          </span>
        </div>

        {shot.visual ? <div className="mt-1.5 text-body-sm leading-normal text-nomi-ink-80">{shot.visual}</div> : null}

        <Field label={t('generationCommon.node.deconstruct.fieldOnScreenText')} value={shot.onScreenText} />
        <Field label={t('generationCommon.node.deconstruct.fieldDialogue')} value={shot.dialogue} />
        <Field label={t('generationCommon.node.deconstruct.fieldImagePrompt')} value={shot.imagePrompt} prompt />
        <Field label={t('generationCommon.node.deconstruct.fieldMotionPrompt')} value={shot.motionPrompt} prompt />

        {/* 诚实失败：这镜画面没读出来，对白仍可用 + 单独重拆（不假装成功、不静默）。 */}
        {failed ? (
          <div className="mt-2 flex items-center gap-2 rounded-nomi-sm bg-nomi-warning-soft px-2.5 py-1.5 text-body-sm text-nomi-ink-60">
            <IconAlertTriangle size={14} stroke={1.8} aria-hidden />
            <span className="min-w-0 flex-1">{t('generationCommon.node.deconstruct.visionFailed')}</span>
            <button
              type="button"
              className={cn(
                'shrink-0 rounded-pill border border-nomi-line bg-nomi-paper px-2.5 py-0.5 text-micro cursor-pointer',
                'text-nomi-ink hover:bg-nomi-ink-05 disabled:opacity-40 disabled:cursor-not-allowed',
              )}
              data-deconstruct-retry-shot={shot.index}
              disabled={retrying}
              onClick={onRetryShot}
            >
              {retrying
                ? t('generationCommon.node.deconstruct.retryingShot')
                : t('generationCommon.node.deconstruct.retryShot')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const DeconstructionShotRow = React.memo(DeconstructionShotRowImpl)
export default DeconstructionShotRow
