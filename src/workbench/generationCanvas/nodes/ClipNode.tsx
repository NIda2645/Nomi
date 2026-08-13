import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconDownload, IconPlus, IconScissors } from '@tabler/icons-react'
import { WorkbenchButton } from '../../../design'
import { cn } from '../../../utils/cn'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useAllProjectAssets } from '../../assets/useAllProjectAssets'
import AssetPicker from '../../assets/AssetPicker'
import AssetPickerPopover from '../../assets/AssetPickerPopover'
import { getActiveWorkbenchProjectId } from '../../project/workbenchProjectSession'
import { importWorkbenchLocalAssetFile } from '../../api/assetUploadApi'
import {
  appendClipNodeSource,
  clipNodeSourceFromAsset,
  readClipNodeMeta,
} from './clipNodeModel'
import type { AssetRef } from '../../assets/assetTypes'
import { MagneticConnectionHandle } from './NodeConnectionHandles'
import { completeNodeConnection } from './completeNodeConnection'
import type { ConnectionAnchorSide } from '../store/canvasStoreTypes'
import { getNodeSizeBounds, resolveNodeVisualSize } from './nodeSizing'
import { useNodeDragResize } from './useNodeDragResize'
import { exportTimelineToMp4 } from '../../export/exportApi'
import { toast } from '../../../ui/toast'
import { buildWorkspaceFileUrl } from '../../explorer/workspaceFileDrag'
import ClipNodePreview from './ClipNodePreview'
import ClipNodeTimeline from './ClipNodeTimeline'
import {
  clipNodeTimelineFromMeta,
  duplicateClipNode,
  moveClipNode,
  removeClipNode,
  resizeClipNode,
  splitClipNode,
} from './clipNodeSequence'
import { buildClipNodeOutputPatch } from './clipNodeOutput'

type Props = { node: unknown; selected: boolean; readOnly?: boolean }

export default function ClipNode({ node: rawNode, selected, readOnly = false }: Props): JSX.Element {
  const { t } = useTranslation()
  const node = rawNode as GenerationCanvasNode
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const addNode = useGenerationCanvasStore((state) => state.addNode)
  const connectNodes = useGenerationCanvasStore((state) => state.connectNodes)
  const selectNode = useGenerationCanvasStore((state) => state.selectNode)
  const captureHistory = useGenerationCanvasStore((state) => state.captureHistory)
  const commitPersistedChange = useGenerationCanvasStore((state) => state.commitPersistedChange)
  const moveNode = useGenerationCanvasStore((state) => state.moveNode)
  const moveSelectedNodes = useGenerationCanvasStore((state) => state.moveSelectedNodes)
  const isMultiSelectActive = useGenerationCanvasStore((state) => selected && state.selectedNodeIds.length > 1)
  const startConnection = useGenerationCanvasStore((state) => state.startConnection)
  const pendingSourceId = useGenerationCanvasStore((state) => state.pendingConnectionSourceId)
  const pendingSourceSide = useGenerationCanvasStore((state) => state.pendingConnectionSourceSide)
  const upstreamMedia = useGenerationCanvasStore((state) => state.edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => state.nodes.find((candidate) => candidate.id === edge.source))
    .filter((candidate): candidate is GenerationCanvasNode => Boolean(candidate?.result?.url && (candidate.result.type === 'image' || candidate.result.type === 'video'))))
  const { refresh } = useAllProjectAssets()
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [splitMode, setSplitMode] = React.useState(false)
  const [playing, setPlaying] = React.useState(false)
  const [exporting, setExporting] = React.useState<'current' | 'all' | null>(null)
  const [creatingVideoNode, setCreatingVideoNode] = React.useState(false)
  const visualSize = resolveNodeVisualSize(node)
  const sizeBounds = getNodeSizeBounds(node.kind)
  const { handlePointerDown, handlePointerMove, handlePointerUp } = useNodeDragResize({
    node,
    selected,
    readOnly,
    isMultiSelectActive,
    sizeBounds,
    visualSize,
    selectNode,
    captureHistory,
    moveNode,
    moveSelectedNodes,
    updateNode,
    commitPersistedChange,
  })
  const meta = React.useMemo(() => readClipNodeMeta(node.meta), [node.meta])
  const timeline = React.useMemo(() => clipNodeTimelineFromMeta(meta), [meta])
  const timelineClips = timeline.tracks[0]?.clips ?? []
  const selectedClipId = meta.selectedClipId ? `clip-${meta.selectedClipId}` : timelineClips[0]?.id
  const activeClip = timelineClips.find((clip) => clip.id === selectedClipId)
  const upstreamMediaKey = upstreamMedia.map((source) => source.id).join('|')

  const persist = React.useCallback((next: ReturnType<typeof readClipNodeMeta>) => {
    updateNode(node.id, { meta: { ...(node.meta ?? {}), clip: next } })
  }, [node.id, node.meta, updateNode])

  React.useEffect(() => {
    if (!upstreamMediaKey) return
    const known = new Set([
      ...meta.clips.map((clip) => clip.sourceNodeId ?? clip.id),
      ...(meta.excludedSourceNodeIds ?? []),
    ])
    const additions = upstreamMedia
      .filter((source) => !known.has(source.id))
      .map((source) => ({
        id: source.id,
        sourceNodeId: source.id,
        type: source.result!.type as 'image' | 'video',
        label: source.title || source.result!.type,
        url: source.result!.url!,
        ...(source.result!.thumbnailUrl ? { thumbnailUrl: source.result!.thumbnailUrl } : {}),
        durationSeconds: source.result!.durationSeconds ?? 6,
        trimStart: 0,
        trimEnd: source.result!.durationSeconds ?? 6,
      }))
    if (!additions.length) return
    persist({
      ...meta,
      sourceNodeIds: [...meta.sourceNodeIds, ...additions.map((source) => source.id)],
      clips: [...meta.clips, ...additions],
      selectedClipId: additions[additions.length - 1].id,
    })
  }, [meta, persist, upstreamMedia, upstreamMediaKey])

  const handleConnectionStart = (event: React.PointerEvent<HTMLElement>, side: ConnectionAnchorSide): void => {
    event.stopPropagation()
    startConnection(node.id, side)
  }

  const addAsset = React.useCallback((asset: AssetRef) => {
    const source = clipNodeSourceFromAsset(asset)
    if (!source) return
    persist(appendClipNodeSource(meta, source))
    setPickerOpen(false)
  }, [meta, persist])

  const upload = React.useCallback(async (file: File) => {
    const projectId = getActiveWorkbenchProjectId()
    if (!projectId) return
    const uploaded = await importWorkbenchLocalAssetFile(file, file.name, { projectId })
    const asset: AssetRef = {
      id: uploaded.id,
      name: uploaded.name,
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      renderUrl: String(uploaded.data.url || ''),
      source: 'project',
      origin: { source: 'project', projectId, relativePath: String(uploaded.data.relativePath || uploaded.name) },
    }
    addAsset(asset)
    refresh()
  }, [addAsset, refresh])

  const selectClip = React.useCallback((clipId: string) => {
    persist({ ...meta, selectedClipId: clipId.replace(/^clip-/, '') })
    setPlaying(false)
  }, [meta, persist])

  const handleMoveClip = React.useCallback((clipId: string, startFrame: number) => {
    persist(moveClipNode(meta, clipId, startFrame))
  }, [meta, persist])

  const handleResizeClip = React.useCallback((clipId: string, edge: 'left' | 'right', deltaFrame: number) => {
    persist(resizeClipNode(meta, clipId, edge, deltaFrame))
  }, [meta, persist])

  const handleSplitClip = React.useCallback((clipId: string, frame: number) => {
    const next = splitClipNode(meta, clipId, frame)
    const splitSource = next.clips.find((clip) => clip.id.endsWith('-split'))
    persist({ ...next, selectedClipId: splitSource?.id ?? meta.selectedClipId })
    setSplitMode(false)
  }, [meta, persist])

  const handleRemoveClip = React.useCallback((clipId: string) => {
    const next = removeClipNode(meta, clipId)
    persist(next)
    setPlaying(false)
  }, [meta, persist])

  const handleDuplicateClip = React.useCallback((clipId: string) => {
    persist(duplicateClipNode(meta, clipId))
  }, [meta, persist])

  const singleClipTimeline = React.useMemo(() => {
    if (!activeClip) return null
    const track = timeline.tracks[0]
    if (!track) return null
    const visibleFrames = Math.max(1, activeClip.endFrame - activeClip.startFrame)
    return {
      ...timeline,
      playheadFrame: 0,
      tracks: [{ ...track, clips: [{ ...activeClip, startFrame: 0, endFrame: visibleFrames }] }],
    }
  }, [activeClip, timeline])

  const handleExport = async (scope: 'current' | 'all'): Promise<void> => {
    const projectId = getActiveWorkbenchProjectId()
    const exportTimeline = scope === 'current' ? singleClipTimeline : timeline
    if (!projectId || !exportTimeline || exportTimeline.tracks[0]?.clips.length === 0 || exporting) return
    setExporting(scope)
    try {
      const result = await exportTimelineToMp4({
        timeline: exportTimeline,
        aspectRatio: '16:9',
        projectId,
        resolution: '1080p',
        quality: 'standard',
        outputName: scope === 'current' ? 'nomi-clip' : 'nomi-cut',
      })
      toast(t('generationCommon.clipNode.exportComplete', { path: result.relativePath }), 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('generationCommon.clipNode.exportFailed'), 'error')
    } finally {
      setExporting(null)
    }
  }

  const handleCreateVideoNode = async (): Promise<void> => {
    const projectId = getActiveWorkbenchProjectId()
    if (!projectId || timelineClips.length === 0 || creatingVideoNode) return
    setCreatingVideoNode(true)
    try {
      const result = await exportTimelineToMp4({
        timeline,
        aspectRatio: '16:9',
        projectId,
        resolution: '1080p',
        quality: 'standard',
        outputName: 'nomi-clip-node',
      })
      const durationSeconds = Math.max(0.1, (timelineClips.at(-1)?.endFrame ?? 1) / (timeline.fps || 30))
      const outputNode = addNode({
        kind: 'video',
        title: t('generationCommon.clipNode.outputNodeTitle'),
        position: { x: node.position.x + visualSize.width + 80, y: node.position.y },
        categoryId: node.categoryId,
        select: true,
      })
      updateNode(outputNode.id, buildClipNodeOutputPatch({
        sourceClipNodeId: node.id,
        outputUrl: buildWorkspaceFileUrl(projectId, result.relativePath),
        relativePath: result.relativePath,
        durationSeconds,
      }))
      connectNodes(node.id, outputNode.id)
      toast(t('generationCommon.clipNode.exportComplete', { path: result.relativePath }), 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('generationCommon.clipNode.exportFailed'), 'error')
    } finally {
      setCreatingVideoNode(false)
    }
  }

  return (
    <article
      className={cn('generation-canvas-v2-node absolute block cursor-grab select-none touch-none overflow-visible', selected ? 'z-50' : '')}
      style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)`, width: visualSize.width, height: visualSize.height }}
      data-node-id={node.id}
      data-kind={node.kind}
      data-selected={selected ? 'true' : 'false'}
      data-clip-node="true"
      onWheel={(event) => event.stopPropagation()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {!readOnly ? <>
        <MagneticConnectionHandle side="left" active={pendingSourceId === node.id || pendingSourceSide === 'left'} pendingTarget={Boolean(pendingSourceId && pendingSourceId !== node.id)} onStart={handleConnectionStart} onComplete={(event) => { event.stopPropagation(); completeNodeConnection(node.id) }} />
        <MagneticConnectionHandle side="right" active={pendingSourceId === node.id || pendingSourceSide === 'right'} pendingTarget={Boolean(pendingSourceId && pendingSourceId !== node.id)} onStart={handleConnectionStart} onComplete={(event) => { event.stopPropagation(); completeNodeConnection(node.id) }} />
      </> : null}
      <div className={cn('generation-canvas-v2-node__preview flex h-full w-full flex-col overflow-hidden rounded-nomi border bg-nomi-paper shadow-nomi-md', selected ? 'ring-2 ring-nomi-accent' : 'ring-1 ring-inset ring-nomi-line')}>
        <header className="flex shrink-0 items-center gap-2 border-b border-nomi-line px-3 py-2" onPointerDown={(event) => event.stopPropagation()}>
          <IconScissors size={15} className="text-nomi-accent" />
          <span className="flex-1 truncate text-body-sm font-semibold text-nomi-ink">{t('generationCommon.clipNode.timeline')}</span>
          <span className="text-micro text-nomi-ink-50">{t('generationCommon.clipNode.count', { count: timelineClips.length })}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
          <div onPointerDown={(event) => event.stopPropagation()}>
            <ClipNodePreview clip={activeClip} playing={playing} onTogglePlaying={() => setPlaying((value) => !value)} />
          </div>
          <div className="mt-3" onPointerDown={(event) => event.stopPropagation()}>
            <ClipNodeTimeline
              timeline={timeline}
              selectedClipId={selectedClipId}
              splitMode={splitMode}
              onSelectClip={selectClip}
              onMoveClip={handleMoveClip}
              onResizeClip={handleResizeClip}
              onSplitClip={handleSplitClip}
              onRemoveClip={handleRemoveClip}
              onDuplicateClip={handleDuplicateClip}
              onToggleSplitMode={() => setSplitMode((value) => !value)}
            />
          </div>
          {!readOnly ? <WorkbenchButton variant="default" size="sm" className="mt-3 w-full" onClick={() => setPickerOpen(true)}><IconPlus size={14} />{t('generationCommon.clipNode.add')}</WorkbenchButton> : null}
          {!readOnly ? <div className="mt-3 grid grid-cols-2 gap-2">
            <WorkbenchButton variant="default" size="sm" disabled={!activeClip || Boolean(exporting) || !getActiveWorkbenchProjectId()} onClick={() => void handleExport('current')}>
              <IconDownload size={14} />{exporting === 'current' ? t('generationCommon.clipNode.exporting') : t('generationCommon.clipNode.exportCurrent')}
            </WorkbenchButton>
            <WorkbenchButton variant="primary" size="sm" disabled={timelineClips.length === 0 || Boolean(exporting) || !getActiveWorkbenchProjectId()} onClick={() => void handleExport('all')}>
              <IconDownload size={14} />{exporting === 'all' ? t('generationCommon.clipNode.exporting') : t('generationCommon.clipNode.exportAll')}
            </WorkbenchButton>
          </div> : null}
          {!readOnly ? <WorkbenchButton variant="primary" size="sm" className="mt-2 w-full" disabled={timelineClips.length === 0 || Boolean(exporting) || creatingVideoNode || !getActiveWorkbenchProjectId()} onClick={() => void handleCreateVideoNode()}>
            <IconScissors size={14} />{creatingVideoNode ? t('generationCommon.clipNode.creatingVideoNode') : t('generationCommon.clipNode.createVideoNode')}
          </WorkbenchButton> : null}
          {!readOnly ? <p className="mt-1 text-center text-micro text-nomi-ink-40">{t('generationCommon.clipNode.createVideoNodeHint')}</p> : null}
          <p className="mt-2 text-center text-micro text-nomi-ink-40">{t('generationCommon.clipNode.exportHint')}</p>
        </div>
        {pickerOpen ? <AssetPickerPopover onClose={() => setPickerOpen(false)}><AssetPicker projectId={getActiveWorkbenchProjectId()} accept={['image', 'video']} onPick={addAsset} onUpload={(file) => void upload(file)} /></AssetPickerPopover> : null}
      </div>
    </article>
  )
}
