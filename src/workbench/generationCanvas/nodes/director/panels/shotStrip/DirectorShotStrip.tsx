/**
 * [INPUT]: 依赖 react、react-i18next、../../../../../../design 的 WorkbenchIconButton、../../../../../../vendor/tablerIcons、../../../../../../utils/cn、
 *          ../../DirectorEditorContext、../../model/directorShotSummaries、../../timeline/timelineCommands（seekTo / togglePlay）、./shotLabels
 * [OUTPUT]: 对外提供 DirectorShotStrip：导演视图底部的镜头条 = 播放行（播放 / 暂停 · 04.9 / 12.0s · N 个镜头实测说明）+ 按时长等比的镜头卡 + 穿过卡片的播放指针
 * [POS]: 导演视图（3D-BOX v2）的镜头条（样张 director-3dbox-mockup「v2 + 镜头条」）：只读——卡上景别 / 运镜 / 时间窗全是实测值；
 *        点卡 = 播放头跳到该镜开头（与小窗、顶栏标题同吃播放头，不另存「当前镜」）。问题徽标与选中联动属 3b / 3c，不在这里。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { WorkbenchIconButton } from '../../../../../../design'
import { IconPlayerPause, IconPlayerPlayFilled } from '../../../../../../vendor/tablerIcons'
import { cn } from '../../../../../../utils/cn'
import { useDirectorStore, useDirectorStoreApi } from '../../DirectorEditorContext'
import { formatPlayheadSeconds, type DirectorShotSummary } from '../../model/directorShotSummaries'
import { seekTo, togglePlay } from '../../timeline/timelineCommands'
import { useShotLabels } from './shotLabels'

export function DirectorShotStrip({ shots, activeIndex }: { shots: readonly DirectorShotSummary[]; activeIndex: number }): JSX.Element {
  const { t } = useTranslation()
  const store = useDirectorStoreApi()
  const labels = useShotLabels()
  const currentTime = useDirectorStore((state) => state.timeline.currentTime)
  const isPlaying = useDirectorStore((state) => state.timeline.isPlaying)
  const total = shots.at(-1)?.end ?? 0

  return (
    <section className="shrink-0 border-t border-nomi-line-soft bg-nomi-paper px-3 pb-2.5 pt-2" aria-label={t('director.view.shotsAria')} data-testid="director-shot-strip">
      {shots.length ? (
        <div className="mb-1.5 flex items-center gap-2 text-caption text-nomi-ink-60" data-testid="director-shot-playbar">
          <WorkbenchIconButton
            size="sm"
            icon={isPlaying ? <IconPlayerPause size={14} stroke={2} /> : <IconPlayerPlayFilled size={14} stroke={2} />}
            label={isPlaying ? t('director.timeline.pause') : t('director.timeline.play')}
            onClick={() => togglePlay(store)}
          />
          <span className="font-nomi-mono tabular-nums text-nomi-ink-80" data-testid="director-shot-time">{t('director.view.playheadReadout', { current: formatPlayheadSeconds(currentTime), total: formatPlayheadSeconds(total) })}</span>
          <span className="min-w-0 truncate">· {t('director.view.playbackSummary', { count: shots.length })}</span>
        </div>
      ) : null}
      <div className="flex min-h-[64px] gap-1">
        {shots.length ? shots.map((shot, index) => {
          const active = index === activeIndex
          const fraction = active ? Math.min(1, Math.max(0, (currentTime - shot.start) / Math.max(1e-6, shot.end - shot.start))) : null
          return (
            <button
              key={`${shot.start}-${shot.end}`}
              type="button"
              // 卡宽按时长等比（样张 flex:4 / flex:2）：长镜头占得多，一眼看出节奏
              style={{ flexGrow: Math.max(0.01, shot.end - shot.start), flexBasis: 0 }}
              className={cn(
                'relative min-w-0 rounded-nomi-sm border px-2 py-1.5 text-left transition-colors',
                active ? 'border-nomi-accent bg-nomi-accent-soft' : 'border-nomi-line bg-nomi-ink-05 hover:border-nomi-ink-30',
              )}
              aria-pressed={active}
              onClick={() => seekTo(store, shot.start)}
              data-testid={`director-shot-${index + 1}`}
            >
              <div className="truncate font-nomi-mono text-micro text-nomi-ink-40">{index + 1} · {t('director.view.shotWindow', { start: shot.start.toFixed(1), end: shot.end.toFixed(1) })}</div>
              <div className="truncate text-body-sm text-nomi-ink">{labels.headline(shot)}</div>
              <div className="truncate text-micro text-nomi-ink-40">{labels.actions(shot)}</div>
              {fraction !== null ? (
                // 播放指针穿过当前卡：落在卡内的比例 = 播放头在这一镜里走了多少，不用按整条宽度折算间隙
                <span className="pointer-events-none absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 rounded-full bg-nomi-accent" style={{ left: `${fraction * 100}%` }} data-testid="director-shot-playhead" aria-hidden />
              ) : null}
            </button>
          )
        }) : <div className="grid w-full place-items-center rounded-nomi-sm border border-dashed border-nomi-line-soft text-caption text-nomi-ink-60">{t('director.view.empty')}</div>}
      </div>
    </section>
  )
}
