import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useDirectorStore } from './DirectorEditorContext'
import type { DirectorHotkeyScope } from './model/hotkeys'
import { sampleDirectorProject, recognizeCameraMotion, type EvalShotSize } from './model/directorEvalMeasurement'
import { CAMERA_MOVE_LABEL, CAMERA_MOVE_LABEL_EN } from './agent/cameraMoveVocab'
import type { BoxDrawApi } from './scene/creation/useBoxDraw'
import type { CharacterPlacementApi } from './scene/creation/useCharacterPlacement'
import type { DirectorViewportTheme } from './scene/sceneTheme'
import type { ViewSettings } from './scene/viewSettings'
import type { DirectorProject } from './model/directorTypes'
import { DirectorViewport } from './panels/viewport/DirectorViewport'
import { WorkbenchIconButton } from '../../../../design'
import { IconArrowBackUp, IconArrowForwardUp, IconArrowLeft, IconChevronDown, IconRefresh } from '../../../../vendor/tablerIcons'

export type DirectorViewMode = 'director' | 'refine'

type Props = {
  scopeRef: React.MutableRefObject<DirectorHotkeyScope>
  placement: CharacterPlacementApi
  boxDraw: BoxDrawApi
  cancelCreationRef: React.MutableRefObject<(() => void) | null>
  theme: DirectorViewportTheme
  viewSettings: ViewSettings
  onExit: () => void
  onResetView: () => void
  onViewModeChange: (mode: DirectorViewMode) => void
  onProduce: () => void
}

type ShotSummary = { start: number; end: number; cameraId: string | null; shotSize: EvalShotSize | null; move: string }

const shotSizeEn: Record<EvalShotSize, string> = {
  远景: 'Far', 全景: 'Wide', 中景: 'Medium', 中近景: 'Medium close',
  近景: 'Close', 特写: 'Close-up', 大特写: 'Extreme close-up',
}
function summaries(project: DirectorProject, locale: string): ShotSummary[] {
  const measurements = sampleDirectorProject(project, { fps: 4 })
  const boundaries = [0, ...measurements.cuts, measurements.duration]
    .filter((value, index, values) => value >= 0 && value <= measurements.duration && values.indexOf(value) === index)
    .sort((a, b) => a - b)
  if (boundaries.length < 2) return []
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]
    const frame = measurements.frames.find((candidate) => candidate.time >= (start + end) / 2) ?? measurements.frames[0]
    const subjectId = Object.keys(frame?.objects ?? {})[0]
    const shotSize = subjectId ? frame?.objects[subjectId]?.shotSize ?? null : null
    const motion = subjectId ? recognizeCameraMotion(measurements, subjectId, { start, end }).move : 'static'
    return {
      start,
      end,
      cameraId: frame?.cameraId ?? null,
      shotSize,
      move: locale.startsWith('en')
        ? (CAMERA_MOVE_LABEL_EN[motion] ?? motion)
        : (CAMERA_MOVE_LABEL[motion] ?? motion),
    }
  })
}

export function DirectorViewShell({ scopeRef, placement, boxDraw, cancelCreationRef, theme, viewSettings, onExit, onResetView, onViewModeChange, onProduce }: Props): JSX.Element {
  const { t, i18n } = useTranslation()
  const project = useDirectorStore((state) => state.project)
  const setPreviewCamera = useDirectorStore((state) => state.setPreviewCamera)
  const shots = React.useMemo(() => summaries(project, i18n.language), [i18n.language, project])
  const currentPreview = useDirectorStore((state) => state.previewCameraId)
  const canUndo = useDirectorStore((state) => state.undoStack.length > 0)
  const canRedo = useDirectorStore((state) => state.redoStack.length > 0)
  const undo = useDirectorStore((state) => state.undo)
  const redo = useDirectorStore((state) => state.redo)

  return <div className="relative flex h-full min-h-0 flex-col bg-nomi-bg text-nomi-ink" data-testid="director-3dbox-view" data-director-view="director">
    <div className="pointer-events-none absolute inset-x-3 top-3 z-20 grid grid-cols-[auto_auto_auto_auto] items-start gap-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-nomi-lg border border-nomi-line bg-nomi-paper/95 p-1 shadow-nomi-md backdrop-blur" data-testid="director-view-back-cluster">
        <WorkbenchIconButton size="sm" icon={<IconArrowLeft size={16} stroke={1.9} />} label={t('director.editor.exit')} onClick={onExit} />
        <span className="px-2 text-body-sm font-semibold">{t('director.view.title')}</span>
      </div>
      <div className="pointer-events-auto flex items-center gap-2 rounded-nomi-lg border border-nomi-line bg-nomi-paper/95 p-1 shadow-nomi-md backdrop-blur" data-testid="director-view-header">
        <WorkbenchIconButton size="sm" icon={<IconRefresh size={16} stroke={1.9} />} label={t('director.topbar.resetCamera')} onClick={onResetView} />
        <div className="flex items-center rounded-nomi-sm border border-nomi-line-soft p-0.5" role="group" aria-label={t('director.topbar.viewModeAria')}>
          <button type="button" className="rounded-nomi-sm bg-nomi-accent-soft px-2 py-1 text-caption text-nomi-accent" aria-pressed="true">{t('director.topbar.directorView')}</button>
          <button type="button" className="rounded-nomi-sm px-2 py-1 text-caption text-nomi-ink-60 hover:text-nomi-ink" aria-pressed="false" onClick={() => onViewModeChange('refine')}>{t('director.topbar.refineView')}</button>
        </div>
      </div>
      <div className="pointer-events-auto flex items-center gap-1 rounded-nomi-lg border border-nomi-line bg-nomi-paper/95 p-1 shadow-nomi-md backdrop-blur" data-testid="director-view-history-cluster">
        <WorkbenchIconButton size="sm" icon={<IconArrowBackUp size={16} stroke={1.9} />} label={t('director.view.undo')} disabled={!canUndo} onClick={undo} />
        <WorkbenchIconButton size="sm" icon={<IconArrowForwardUp size={16} stroke={1.9} />} label={t('director.view.redo')} disabled={!canRedo} onClick={redo} />
      </div>
      <div className="pointer-events-auto inline-flex shrink-0 rounded-nomi-lg border border-nomi-accent bg-nomi-accent text-body-sm font-semibold text-white shadow-nomi-md disabled:cursor-not-allowed disabled:opacity-60" role="group" aria-label={t('director.view.produce')} data-testid="director-produce-placeholder" title={t('director.view.producePlaceholder')}>
        <button type="button" className="min-w-0 whitespace-nowrap px-3 py-2" disabled onClick={onProduce}>{t('director.view.produce')}</button>
        <button type="button" className="grid shrink-0 place-items-center border-l border-white/25 px-2" disabled aria-label={t('director.view.produceMenu')}><IconChevronDown size={15} stroke={2} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="relative min-h-0 flex-1">
      <DirectorViewport theme={theme} viewSettings={viewSettings} scopeRef={scopeRef} placement={placement} boxDraw={boxDraw} cancelCreationRef={cancelCreationRef} showAiSceneBar={false} />
    </div>
    <section className="shrink-0 border-t border-nomi-line bg-nomi-paper/95 px-3 py-2" aria-label={t('director.view.shotsAria')} data-testid="director-shot-strip">
      <div className="mb-1 grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 text-caption text-nomi-ink-60"><span className="font-semibold text-nomi-ink">{t('director.view.shots')}</span><span>· {t('director.view.measured')}</span><span aria-hidden /> <span className="font-nomi-mono">{shots.length ? t('director.view.durationValue', { seconds: shots.at(-1)!.end.toFixed(1) }) : t('director.view.durationEmpty')}</span></div>
      <div className="flex min-h-[76px] gap-1.5 overflow-x-auto">
        {shots.length ? shots.map((shot, index) => {
          const button = <button
            key={`${shot.start}-${shot.end}`}
            type="button"
            className={`min-w-[150px] flex-1 rounded-nomi border px-2 py-1.5 text-left transition-colors ${shot.cameraId === currentPreview ? 'border-nomi-accent bg-nomi-accent-soft' : 'border-nomi-line-soft bg-nomi-bg hover:border-nomi-ink-30'}`}
            aria-pressed={shot.cameraId === currentPreview}
            disabled={!shot.cameraId}
            title={!shot.cameraId ? t('director.view.noCamera') : undefined}
            onClick={() => { if (shot.cameraId) setPreviewCamera(shot.cameraId) }}
            data-testid={`director-shot-${index + 1}`}
          >
            <div className="font-nomi-mono text-micro text-nomi-ink-60">{index + 1} · {t('director.view.shotWindow', { start: shot.start.toFixed(1), end: shot.end.toFixed(1) })}</div>
            <div className="mt-1 text-body-sm font-medium">{shot.shotSize ? (i18n.language.startsWith('en') ? shotSizeEn[shot.shotSize] : shot.shotSize) : t('director.view.unknown')}</div>
            <div className="text-caption text-nomi-ink-60">{shot.move}</div>
          </button>
          return shot.cameraId ? button : <span key={`${shot.start}-${shot.end}-disabled`} title={t('director.view.noCamera')} style={{ display: 'contents' }}>{button}</span>
        }) : <div className="grid w-full place-items-center rounded-nomi border border-dashed border-nomi-line-soft text-caption text-nomi-ink-60">{t('director.view.empty')}</div>}
      </div>
    </section>
  </div>
}
