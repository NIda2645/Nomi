import React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconChevronDown, IconCopy, IconDownload, IconScissors, IconTrash } from '@tabler/icons-react'
import { WorkbenchButton, WorkbenchIconButton } from '../../../design'
import { cn } from '../../../utils/cn'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useAllProjectAssets } from '../../assets/useAllProjectAssets'
import AssetPicker from '../../assets/AssetPicker'
import AssetPickerPopover from '../../assets/AssetPickerPopover'
import type { AssetRef } from '../../assets/assetTypes'
import { getActiveWorkbenchProjectId } from '../../project/workbenchProjectSession'
import {
  appendClipNodeSource,
  clipNodeSourceFromAsset,
  readClipNodeMeta,
} from './clipNodeModel'
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
import { createExclusiveClipNodeUpload, importClipNodeAsset } from './clipNodeUpload'
import {
  clipNodeTimelineFromMeta,
  duplicateClipNode,
  moveClipNode,
  removeClipNode,
  resizeClipNode,
  splitClipNode,
} from './clipNodeSequence'
import { buildClipNodeOutputPatch } from './clipNodeOutput'
import { formatClipNodeDuration, resolveClipNodeVisualMode } from './clipNodeVisual'

type Props = { node: unknown; selected: boolean; readOnly?: boolean }

export default function ClipNode({ node: rawNode, selected, readOnly = false }: Props): JSX.Element {
  const { t } = useTranslation()
  const node = rawNode as GenerationCanvasNode
  const canvasNodes = useGenerationCanvasStore((state) => state.nodes)
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const addNode = useGenerationCanvasStore((state) => state.addNode)
  const connectNodes = useGenerationCanvasStore((state) => state.connectNodes)
  const selectNode = useGenerationCanvasStore((state) => state.selectNode)
  const captureHistory = useGenerationCanvasStore((state) => state.captureHistory)
  const commitPersistedChange = useGenerationCanvasStore((state) => state.commitPersistedChange)
  const moveNode = useGenerationCanvasStore((state) => state.moveNode)
  const moveSelectedNodes = useGenerationCanvasStore((state) => state.moveSelectedNodes)
  const canvasZoom = useGenerationCanvasStore((state) => state.canvasZoom)
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
  const [playheadFrame, setPlayheadFrame] = React.useState(0)
  const [playing, setPlaying] = React.useState(false)
  const [exporting, setExporting] = React.useState<'current' | 'all' | null>(null)
  const [creatingVideoNode, setCreatingVideoNode] = React.useState(false)
  const [editingOpen, setEditingOpen] = React.useState(false)
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const [retryUploadFile, setRetryUploadFile] = React.useState<File | null>(null)
  const uploadExclusiveRef = React.useRef(createExclusiveClipNodeUpload())
  const articleRef = React.useRef<HTMLElement | null>(null)
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null)
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
  const timelineForView = React.useMemo(
    () => ({ ...timeline, playheadFrame: Math.min(playheadFrame, timeline.tracks[0]?.clips.at(-1)?.endFrame ?? 0) }),
    [playheadFrame, timeline],
  )
  const timelineClips = React.useMemo(() => timeline.tracks[0]?.clips ?? [], [timeline])
  const selectedClipId = meta.selectedClipId ? `clip-${meta.selectedClipId}` : undefined
  const activeClip = timelineClips.find((clip) => clip.id === selectedClipId)
  const visualMode = resolveClipNodeVisualMode({ hasClips: timelineClips.length > 0, editingOpen, selectedClip: Boolean(activeClip) })
  const durationFrames = timelineClips.reduce((max, clip) => Math.max(max, clip.endFrame), 0)
  const upstreamMediaKey = upstreamMedia.map((source) => source.id).join('|')

  React.useEffect(() => {
    if (selected) return
    setEditingOpen(false)
    setExportMenuOpen(false)
    setSplitMode(false)
    setPlaying(false)
  }, [selected])

  React.useEffect(() => {
    const endFrame = timeline.tracks[0]?.clips.at(-1)?.endFrame ?? 0
    setPlayheadFrame((current) => Math.min(current, endFrame))
  }, [timeline])

  React.useLayoutEffect(() => {
    if (!editingOpen || !articleRef.current) return
    const updateAnchor = () => setAnchorRect(articleRef.current?.getBoundingClientRect() ?? null)
    updateAnchor()
    window.addEventListener('resize', updateAnchor)
    window.addEventListener('scroll', updateAnchor, true)
    return () => {
      window.removeEventListener('resize', updateAnchor)
      window.removeEventListener('scroll', updateAnchor, true)
    }
  }, [canvasZoom, editingOpen, exportMenuOpen, node.position.x, node.position.y, visualSize.width, visualSize.height])

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
    setUploadError(null)
    setRetryUploadFile(null)
    setEditingOpen(false)
  }, [meta, persist])

  const upload = React.useCallback(async (file: File) => {
    await uploadExclusiveRef.current(async () => {
      const projectId = getActiveWorkbenchProjectId()
      setRetryUploadFile(file)
      setUploadError(null)
      if (!projectId) {
        setUploadError(t('generationCommon.clipNode.uploadFailed'))
        return
      }
      setUploading(true)
      try {
        const result = await importClipNodeAsset(file, projectId)
        if (result.error || !result.asset) {
          setUploadError(t('generationCommon.clipNode.uploadFailed'))
          return
        }
        addAsset(result.asset)
        setRetryUploadFile(null)
        refresh()
      } finally {
        setUploading(false)
      }
    })
  }, [addAsset, refresh, t])

  const closePicker = React.useCallback(() => {
    if (uploading) return
    setPickerOpen(false)
    setUploadError(null)
    setRetryUploadFile(null)
  }, [uploading])

  const selectClip = React.useCallback((clipId: string) => {
    const nextClip = timelineClips.find((clip) => clip.id === clipId)
    persist({ ...meta, selectedClipId: clipId.replace(/^clip-/, '') })
    setPlayheadFrame(nextClip?.startFrame ?? 0)
    setPlaying(false)
    setEditingOpen(true)
    setExportMenuOpen(false)
  }, [meta, persist, timelineClips])

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
    setEditingOpen(false)
    setExportMenuOpen(false)
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
      if (scope === 'current') {
        const result = await exportTimelineToMp4({
          timeline: exportTimeline,
          aspectRatio: '16:9',
          projectId,
          resolution: '1080p',
          quality: 'standard',
          outputName: 'nomi-clip',
        })
        toast(t('generationCommon.clipNode.exportComplete', { path: result.relativePath }), 'success')
        return
      }

      const merged = await exportTimelineToMp4({
        timeline: exportTimeline,
        aspectRatio: '16:9',
        projectId,
        resolution: '1080p',
        quality: 'standard',
        outputName: 'nomi-cut',
      })
      const clips = exportTimeline.tracks[0]?.clips ?? []
      for (const [index, clip] of clips.entries()) {
        const visibleFrames = Math.max(1, clip.endFrame - clip.startFrame)
        const clipTimeline = {
          ...exportTimeline,
          playheadFrame: 0,
          tracks: [{
            ...exportTimeline.tracks[0]!,
            clips: [{ ...clip, startFrame: 0, endFrame: visibleFrames }],
          }, ...exportTimeline.tracks.slice(1)],
        }
        const segment = await exportTimelineToMp4({
          timeline: clipTimeline,
          aspectRatio: '16:9',
          projectId,
          resolution: '1080p',
          quality: 'standard',
          outputName: `nomi-clip-${String(index + 1).padStart(2, '0')}`,
        })
        const existing = canvasNodes.find((candidate) => (
          candidate.kind === 'video'
          && candidate.meta?.sourceClipNodeId === node.id
          && candidate.meta?.sourceClipId === clip.id
        ))
        const outputPatch = buildClipNodeOutputPatch({
          sourceClipNodeId: node.id,
          sourceClipId: clip.id,
          outputUrl: buildWorkspaceFileUrl(projectId, segment.relativePath),
          relativePath: segment.relativePath,
          durationSeconds: visibleFrames / Math.max(1, exportTimeline.fps),
        })
        const outputNode = existing ?? addNode({
          kind: 'video',
          title: t('generationCommon.clipNode.outputClipTitle', { index: index + 1 }),
          position: {
            x: node.position.x + visualSize.width + 80,
            y: node.position.y + index * 180,
          },
          categoryId: node.categoryId,
          select: false,
        })
        updateNode(outputNode.id, outputPatch)
        connectNodes(node.id, outputNode.id)
      }
      toast(t('generationCommon.clipNode.exportAllComplete', { count: clips.length, path: merged.relativePath }), 'success')
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

  const closeEditing = (): void => {
    setEditingOpen(false)
    setExportMenuOpen(false)
    setSplitMode(false)
  }

  const floatingLayerStyle = React.useMemo<React.CSSProperties | null>(() => {
    if (!anchorRect || typeof window === 'undefined') return null
    const width = 550
    const height = 250
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, anchorRect.left + anchorRect.width / 2 - width / 2))
    const top = anchorRect.top >= height + 20
      ? anchorRect.top - height - 12
      : Math.min(window.innerHeight - height - 12, anchorRect.bottom + 12)
    return { position: 'fixed', left, top: Math.max(12, top), zIndex: 1000 }
  }, [anchorRect])

  const exportLayerStyle = React.useMemo<React.CSSProperties | null>(() => {
    if (!anchorRect || typeof window === 'undefined') return null
    const width = 320
    const height = 220
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, anchorRect.right - width))
    const top = anchorRect.bottom + height + 12 <= window.innerHeight
      ? anchorRect.bottom + 12
      : Math.max(12, anchorRect.top - height - 12)
    return { position: 'fixed', left, top, zIndex: 1001 }
  }, [anchorRect])

  return (
    <article
      ref={articleRef}
      className={cn('generation-canvas-v2-node absolute block cursor-grab select-none touch-none overflow-visible', selected ? 'z-50' : '')}
      style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)`, width: visualSize.width, height: visualSize.height }}
      data-node-id={node.id}
      data-kind={node.kind}
      data-selected={selected ? 'true' : 'false'}
      data-clip-node="true"
      data-clip-mode={visualMode}
      onWheel={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeEditing()
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {!readOnly ? <>
        <MagneticConnectionHandle side="left" active={pendingSourceId === node.id || pendingSourceSide === 'left'} pendingTarget={Boolean(pendingSourceId && pendingSourceId !== node.id)} onStart={handleConnectionStart} onComplete={(event) => { event.stopPropagation(); completeNodeConnection(node.id) }} />
        <MagneticConnectionHandle side="right" active={pendingSourceId === node.id || pendingSourceSide === 'right'} pendingTarget={Boolean(pendingSourceId && pendingSourceId !== node.id)} onStart={handleConnectionStart} onComplete={(event) => { event.stopPropagation(); completeNodeConnection(node.id) }} />
      </> : null}

      {visualMode === 'editing' && activeClip && floatingLayerStyle ? createPortal(
        <div style={floatingLayerStyle} className="flex items-end gap-2 rounded-nomi border border-nomi-line bg-nomi-paper p-2 text-nomi-ink shadow-nomi-lg" onPointerDown={(event) => event.stopPropagation()}>
          <ClipNodePreview clip={activeClip} playing={playing} onTogglePlaying={() => setPlaying((value) => !value)} className="w-80" />
          <div className="grid w-40 gap-1.5">
            <div className="px-1 text-micro font-medium text-nomi-ink/60">{t('generationCommon.clipNode.selectedScope')}</div>
            <WorkbenchButton
              variant="default"
              size="sm"
              className={cn('w-full justify-start', splitMode ? 'border-nomi-accent text-nomi-accent' : '')}
              aria-pressed={splitMode}
              onClick={() => setSplitMode((value) => !value)}
            >
              <IconScissors size={14} />{t('generationCommon.clipNode.split')}
            </WorkbenchButton>
            <div className="grid grid-cols-2 gap-1.5">
              <WorkbenchIconButton label={t('generationCommon.clipNode.duplicate')} icon={<IconCopy size={14} />} onClick={() => handleDuplicateClip(activeClip.id)} className="border border-nomi-line bg-nomi-bg text-nomi-ink hover:bg-nomi-accent-soft hover:text-nomi-accent" />
              <WorkbenchIconButton label={t('generationCommon.clipNode.remove')} icon={<IconTrash size={14} />} onClick={() => handleRemoveClip(activeClip.id)} className="border border-nomi-line bg-nomi-bg text-nomi-ink hover:bg-nomi-danger-soft hover:text-nomi-danger" />
            </div>
            {!readOnly ? (
              <WorkbenchButton
                variant="default"
                size="sm"
                className="w-full justify-start"
                onClick={() => setExportMenuOpen((value) => !value)}
                aria-expanded={exportMenuOpen}
              >
                <IconDownload size={14} />{t('generationCommon.clipNode.export')}<IconChevronDown size={13} className="ml-auto" />
              </WorkbenchButton>
            ) : null}
          </div>
        </div>, document.body,
      ) : null}

      <div
        className={cn('generation-canvas-v2-node__preview flex h-full w-full flex-col overflow-hidden rounded-nomi border bg-nomi-paper shadow-nomi-md', selected ? 'ring-2 ring-nomi-accent' : 'ring-1 ring-inset ring-nomi-line')}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeEditing()
        }}
      >
        <header className="flex h-8 shrink-0 items-center gap-2 px-3" onPointerDown={(event) => event.stopPropagation()}>
          <IconScissors size={15} className="text-nomi-accent" />
          <span className="truncate text-body-sm font-semibold text-nomi-ink">{t('generationCommon.clipNode.axis')}</span>
          <span className="ml-auto text-micro text-nomi-ink/60">{t('generationCommon.clipNode.count', { count: timelineClips.length })}</span>
          <span className="text-micro text-nomi-ink/45">·</span>
          <span className="text-micro text-nomi-ink/60">{t('generationCommon.clipNode.totalDuration', { duration: formatClipNodeDuration(durationFrames, timeline.fps) })}</span>
        </header>
        <div className="min-h-0 flex-1 px-2 pb-2" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
          <ClipNodeTimeline
            timeline={timelineForView}
            selectedClipId={visualMode === 'editing' ? selectedClipId : undefined}
            splitMode={splitMode}
            onSelectClip={selectClip}
            onMoveClip={handleMoveClip}
            onResizeClip={handleResizeClip}
            onSplitClip={handleSplitClip}
            onScrubPlayhead={setPlayheadFrame}
            onAddMaterial={readOnly ? undefined : () => { setUploadError(null); setRetryUploadFile(null); setPickerOpen(true) }}
            onBlankAxis={closeEditing}
          />
        </div>
      </div>

      {exportMenuOpen && visualMode === 'editing' && !readOnly && exportLayerStyle ? createPortal(
        <div style={exportLayerStyle} className="w-80 rounded-nomi border border-nomi-line bg-nomi-paper p-2 text-nomi-ink shadow-nomi-lg" role="menu" onPointerDown={(event) => event.stopPropagation()}>
          <div className="px-2 pb-1 text-micro font-medium text-nomi-ink/60">{t('generationCommon.clipNode.exportOptions')}</div>
          <WorkbenchButton variant="default" size="sm" className="h-auto w-full justify-start gap-2 py-2 text-left" disabled={!activeClip || Boolean(exporting) || !getActiveWorkbenchProjectId()} onClick={() => void handleExport('current')}>
            <IconDownload size={14} />
            <span className="grid text-left"><span>{exporting === 'current' ? t('generationCommon.clipNode.exporting') : t('generationCommon.clipNode.exportCurrent')}</span><span className="text-micro font-normal text-nomi-ink-50">{t('generationCommon.clipNode.exportCurrentHint')}</span></span>
          </WorkbenchButton>
          <WorkbenchButton variant="default" size="sm" className="mt-1 h-auto w-full justify-start gap-2 py-2 text-left" disabled={timelineClips.length === 0 || Boolean(exporting) || !getActiveWorkbenchProjectId()} onClick={() => void handleExport('all')}>
            <IconDownload size={14} />
            <span className="grid text-left"><span>{exporting === 'all' ? t('generationCommon.clipNode.exporting') : t('generationCommon.clipNode.exportAll')}</span><span className="text-micro font-normal text-nomi-ink-50">{t('generationCommon.clipNode.exportAllHint')}</span></span>
          </WorkbenchButton>
          <WorkbenchButton variant="primary" size="sm" className="mt-1 h-auto w-full justify-start gap-2 py-2 text-left" disabled={timelineClips.length === 0 || Boolean(exporting) || creatingVideoNode || !getActiveWorkbenchProjectId()} onClick={() => void handleCreateVideoNode()}>
            <IconScissors size={14} />
            <span className="grid text-left"><span>{creatingVideoNode ? t('generationCommon.clipNode.creatingVideoNode') : t('generationCommon.clipNode.createVideoNode')}</span><span className="text-micro font-normal text-nomi-paper/65">{t('generationCommon.clipNode.createVideoNodeHint')}</span></span>
          </WorkbenchButton>
        </div>, document.body,
      ) : null}

      {pickerOpen ? (
        <AssetPickerPopover onClose={closePicker}>
          <div className="grid gap-1.5">
            <AssetPicker
              projectId={getActiveWorkbenchProjectId()}
              accept={['image', 'video']}
              onPick={addAsset}
              onUpload={(file) => void upload(file)}
              uploading={uploading}
            />
            {uploadError ? (
              <div role="alert" className="flex items-center gap-2 rounded-nomi-sm border border-nomi-danger/40 bg-nomi-danger-soft px-2 py-1.5 text-micro text-nomi-danger">
                <span className="min-w-0 flex-1">{uploadError}</span>
                <WorkbenchButton
                  variant="default"
                  size="sm"
                  className="shrink-0 border-nomi-danger/40 text-nomi-danger hover:bg-nomi-danger-soft"
                  disabled={!retryUploadFile || uploading}
                  onClick={() => { if (retryUploadFile) void upload(retryUploadFile) }}
                >
                  {t('generationCommon.clipNode.retryUpload')}
                </WorkbenchButton>
              </div>
            ) : null}
          </div>
        </AssetPickerPopover>
      ) : null}
    </article>
  )
}
