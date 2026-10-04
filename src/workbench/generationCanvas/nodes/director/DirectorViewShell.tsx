/**
 * [INPUT]: 依赖 react、react-i18next、./DirectorEditorContext、./model/directorShotSummaries、./panels/viewport/DirectorViewport、
 *          ./panels/topbar/DirectorTopBar 的 Cluster、./panels/shotStrip/{DirectorShotStrip, shotLabels}、../../../../design、../../../../vendor/tablerIcons
 * [OUTPUT]: 对外提供 DirectorViewShell 与 DirectorViewMode：3D-BOX 开关开时的默认面「导演视图」
 * [POS]: 导演视图 = 顶栏三区（左：返回 + 「工程名 · 镜头 N」｜中：导演 / 精修｜右：撤销 / 重做 + 出成片 ▾）+ 视口（小窗左下）+ 镜头条。
 *        「镜头 N」、小窗标题、镜头条高亮三处都从同一个播放头 derive（directorShotSummaries），不另存「当前镜」。
 *        重置视角不在这里：它属于精修顶栏「视图」簇（一功能一个家，§1.5.2），快捷键照常可用。
 *        进场时自由相机落到 directorOverviewPose 的「看全场」位姿一次，之后随用户转动。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useDirectorStore, useDirectorStoreApi } from './DirectorEditorContext'
import type { DirectorHotkeyScope } from './model/hotkeys'
import { activeShotIndexAt, summarizeDirectorShots } from './model/directorShotSummaries'
import { directorOverviewPose } from './model/directorOverviewPose'
import { useViewportApi } from './scene/ViewportApiContext'
import type { BoxDrawApi } from './scene/creation/useBoxDraw'
import type { CharacterPlacementApi } from './scene/creation/useCharacterPlacement'
import type { DirectorViewportTheme } from './scene/sceneTheme'
import type { ViewSettings } from './scene/viewSettings'
import { DirectorViewport } from './panels/viewport/DirectorViewport'
import { Cluster } from './panels/topbar/DirectorTopBar'
import { DirectorShotStrip } from './panels/shotStrip/DirectorShotStrip'
import { useShotLabels } from './panels/shotStrip/shotLabels'
import { WorkbenchIconButton } from '../../../../design'
import { IconArrowBackUp, IconArrowForwardUp, IconArrowLeft, IconChevronDown } from '../../../../vendor/tablerIcons'

export type DirectorViewMode = 'director' | 'refine'

type Props = {
  nodeTitle: string
  scopeRef: React.MutableRefObject<DirectorHotkeyScope>
  placement: CharacterPlacementApi
  boxDraw: BoxDrawApi
  cancelCreationRef: React.MutableRefObject<(() => void) | null>
  theme: DirectorViewportTheme
  viewSettings: ViewSettings
  onExit: () => void
  onViewModeChange: (mode: DirectorViewMode) => void
  onProduce: () => void
}

const OVERVIEW_WAIT_FRAMES = 600

/** 进导演视图时自由相机落到「看全场」位姿一次（之后随用户转动）：画布里的 ViewCamera 晚于外壳挂上，等它登记了视口 API 再套。 */
function useOverviewOnEnter(): void {
  const apiRef = useViewportApi()
  const store = useDirectorStoreApi()
  React.useEffect(() => {
    let frame = 0
    let handle = 0
    const tick = () => {
      const api = apiRef.current
      if (api) {
        const pose = directorOverviewPose(store.getState().activeScene())
        if (pose) api.applyViewPose(pose)
        return
      }
      frame += 1
      if (frame < OVERVIEW_WAIT_FRAMES) handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [apiRef, store])
}

export function DirectorViewShell({ nodeTitle, scopeRef, placement, boxDraw, cancelCreationRef, theme, viewSettings, onExit, onViewModeChange, onProduce }: Props): JSX.Element {
  const { t } = useTranslation()
  const labels = useShotLabels()
  useOverviewOnEnter()
  const project = useDirectorStore((state) => state.project)
  const currentTime = useDirectorStore((state) => state.timeline.currentTime)
  const canUndo = useDirectorStore((state) => state.undoStack.length > 0)
  const canRedo = useDirectorStore((state) => state.redoStack.length > 0)
  const undo = useDirectorStore((state) => state.undo)
  const redo = useDirectorStore((state) => state.redo)
  const shots = React.useMemo(() => summarizeDirectorShots(project), [project])
  const activeIndex = activeShotIndexAt(shots, currentTime)
  const activeShot = activeIndex >= 0 ? shots[activeIndex] : null
  const title = nodeTitle || t('director.view.title')

  return <div className="relative flex h-full min-h-0 flex-col bg-nomi-bg text-nomi-ink" data-testid="director-3dbox-view" data-director-view="director">
    {/* 三列网格：中列 auto 才真正落在视口正中（与精修顶栏同一判据），左右两簇各自贴边 */}
    <div className="pointer-events-none absolute inset-x-3 top-3 z-20 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3" data-testid="director-view-topbar">
      <Cluster label={t('director.editor.aria')} testId="director-view-back-cluster" className="min-w-0 justify-self-start">
        <WorkbenchIconButton size="sm" icon={<IconArrowLeft size={16} stroke={1.9} />} label={t('director.editor.exit')} onClick={onExit} />
        <span className="min-w-0 truncate px-2 text-body-sm font-semibold" data-testid="director-view-title">
          {activeShot ? t('director.view.titleWithShot', { title, index: activeIndex + 1 }) : title}
        </span>
      </Cluster>
      <Cluster label={t('director.topbar.viewModeAria')} testId="director-view-header">
        <button type="button" className="rounded-nomi-sm bg-nomi-accent-soft px-3 py-1 text-caption text-nomi-accent" aria-pressed="true">{t('director.topbar.directorView')}</button>
        <button type="button" className="rounded-nomi-sm px-3 py-1 text-caption text-nomi-ink-60 hover:text-nomi-ink" aria-pressed="false" onClick={() => onViewModeChange('refine')}>{t('director.topbar.refineView')}</button>
      </Cluster>
      <div className="flex items-start gap-3 justify-self-end">
        <Cluster label={t('director.view.historyAria')} testId="director-view-history-cluster">
          <WorkbenchIconButton size="sm" icon={<IconArrowBackUp size={16} stroke={1.9} />} label={t('director.view.undo')} disabled={!canUndo} onClick={undo} />
          <WorkbenchIconButton size="sm" icon={<IconArrowForwardUp size={16} stroke={1.9} />} label={t('director.view.redo')} disabled={!canRedo} onClick={redo} />
        </Cluster>
        <div className="pointer-events-auto inline-flex shrink-0 rounded-nomi-lg border border-nomi-accent bg-nomi-accent text-body-sm font-semibold text-white shadow-nomi-md disabled:cursor-not-allowed disabled:opacity-60" role="group" aria-label={t('director.view.produce')} data-testid="director-produce-placeholder" title={`${t('director.view.produceDescription')} · ${t('director.view.producePlaceholder')}`}>
          <button type="button" className="min-w-0 whitespace-nowrap px-3 py-2" disabled onClick={onProduce}>{t('director.view.produce')}</button>
          <button type="button" className="grid shrink-0 place-items-center border-l border-white/25 px-2" disabled aria-label={t('director.view.produceMenu')}><IconChevronDown size={15} stroke={2} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
    <div className="relative min-h-0 flex-1">
      <DirectorViewport
        theme={theme}
        viewSettings={viewSettings}
        scopeRef={scopeRef}
        placement={placement}
        boxDraw={boxDraw}
        cancelCreationRef={cancelCreationRef}
        showAiSceneBar={false}
        presentation={{ kind: 'director', nowPlaying: activeShot ? labels.pip(activeShot, activeIndex) : null }}
      />
    </div>
    <DirectorShotStrip shots={shots} activeIndex={activeIndex} />
  </div>
}
