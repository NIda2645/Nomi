import React from 'react'
import { useTranslation } from 'react-i18next'
import type { ReactFlowInstance } from '@xyflow/react'
import { getDesktopBridge } from '../../../desktop/bridge'
import {
  subscribeBrowserAssetsImportToCanvas,
  type BrowserAssetCanvasImportItem,
} from '../../../ui/browser/overlay/globalAssetPopoverEvents'
import { toast } from '../../../ui/toast'
import { useWorkbenchStore } from '../../workbenchStore'
import { importBrowserAssetsToGenerationCanvas } from '../components/canvasStageDrop'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { FOCUS_GENERATION_NODE_EVENT, resolveNodeVisualSize } from '../nodes/nodeSizing'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { GenerationFlowEdge, GenerationFlowNode } from './generationCanvasReactFlowAdapter'

type HostEffectsArgs = {
  activeCategoryId: string
  flow: ReactFlowInstance<GenerationFlowNode, GenerationFlowEdge>
  hostRef: React.RefObject<HTMLDivElement>
  nodes: GenerationCanvasNode[]
  setStageSize: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>
  zoomRef: React.MutableRefObject<number>
}

export function useGenerationCanvasReactFlowHostEffects({
  activeCategoryId,
  flow,
  hostRef,
  nodes,
  setStageSize,
  zoomRef,
}: HostEffectsArgs): void {
  const { t } = useTranslation()
  const setActiveCategoryId = useWorkbenchStore((state) => state.setActiveCategoryId)
  const selectNode = useGenerationCanvasStore((state) => state.selectNode)
  const markReady = useGenerationCanvasStore((state) => state.markReady)
  const pendingFocusNodeRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    const handleFocusNode = (event: Event) => {
      const nodeId = (event as CustomEvent<{ nodeId?: unknown }>).detail?.nodeId
      if (typeof nodeId !== 'string' || !nodeId) return
      const target = useGenerationCanvasStore.getState().nodes.find((node) => node.id === nodeId)
      if (!target) {
        toast(t('generationCommon.node.sourceNoLongerExists'), 'warning')
        return
      }
      pendingFocusNodeRef.current = nodeId
      setActiveCategoryId(target.categoryId || 'shots')
      selectNode(nodeId)
    }
    window.addEventListener(FOCUS_GENERATION_NODE_EVENT, handleFocusNode)
    return () => window.removeEventListener(FOCUS_GENERATION_NODE_EVENT, handleFocusNode)
  }, [selectNode, setActiveCategoryId, t])

  React.useEffect(() => {
    const nodeId = pendingFocusNodeRef.current
    if (!nodeId) return
    const target = nodes.find((node) => node.id === nodeId)
    if (!target) return
    const size = resolveNodeVisualSize(target)
    pendingFocusNodeRef.current = null
    void flow.setCenter(target.position.x + size.width / 2, target.position.y + size.height / 2, {
      zoom: zoomRef.current,
      duration: 220,
    })
  }, [activeCategoryId, flow, nodes, zoomRef])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const updateSize = () => {
      const rect = host.getBoundingClientRect()
      setStageSize({ width: rect.width, height: rect.height })
    }
    updateSize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize)
    observer?.observe(host)
    return () => observer?.disconnect()
  }, [hostRef, setStageSize])

  React.useEffect(() => {
    markReady()
  }, [markReady])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const aliases: Array<[string, string]> = [
      ['.react-flow__viewport', 'generation-canvas-v2__canvas'],
      ['.react-flow__edges', 'generation-canvas-v2__edges'],
      ['.react-flow__nodes', 'generation-canvas-v2__nodes'],
    ]
    const applyAliases = () => {
      for (const [selector, className] of aliases) host.querySelector(selector)?.classList.add(className)
    }
    applyAliases()
    const observer = new MutationObserver(applyAliases)
    observer.observe(host, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [hostRef])
}

type BrowserAssetImportEffectsArgs = {
  activeCategoryId: string
  getInsertionPosition: () => { x: number; y: number }
  readOnly: boolean
}

export function useBrowserAssetImportEffects({
  activeCategoryId,
  getInsertionPosition,
  readOnly,
}: BrowserAssetImportEffectsArgs): void {
  const { t } = useTranslation()
  const handleImport = React.useCallback((assets: readonly BrowserAssetCanvasImportItem[]) => {
    if (readOnly) return
    const result = importBrowserAssetsToGenerationCanvas(assets, {
      basePosition: getInsertionPosition(),
      categoryId: activeCategoryId,
    })
    if (result.createdCount === 0) {
      toast(t('generationCommon.canvas.noImportableAssets'), 'info')
      return
    }
    toast(
      result.createdCount === 1
        ? t('generationCommon.canvas.importedOne')
        : t('generationCommon.canvas.importedMany', { count: result.createdCount }),
      'success',
    )
  }, [activeCategoryId, getInsertionPosition, readOnly, t])

  React.useEffect(() => subscribeBrowserAssetsImportToCanvas(handleImport), [handleImport])

  React.useEffect(() => {
    const bridge = getDesktopBridge()?.browser?.assetOverlay
    if (!bridge?.onImportToCanvas) return undefined
    return bridge.onImportToCanvas((payload) => {
      const assets = Array.isArray(payload?.assets) ? payload.assets as BrowserAssetCanvasImportItem[] : []
      handleImport(assets)
    })
  }, [handleImport])
}
