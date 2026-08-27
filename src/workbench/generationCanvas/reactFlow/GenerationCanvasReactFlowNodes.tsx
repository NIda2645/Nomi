import React from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  NodeResizer,
  Position,
  getBezierPath,
  useStore,
  useViewport,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../utils/cn'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { getGenerationNodeComponent } from '../nodes/renderRegistry'
import { getNodeSizeBounds, resolveNodeVisualSize } from '../nodes/nodeSizing'
import { emitCanvasGesture } from '../events/canvasEventEmitter'
import { availableEdgeModes } from '../components/edgeModeMenu'
import { LightweightGenerationNode } from '../components/LightweightGenerationNode'
import {
  retainLargeCanvasLightweightRendering,
  shouldRenderFullNodeContent,
  shouldUseLightweightNodeRenderingForSelection,
} from '../components/canvasNodeLevelOfDetail'
import type { GenerationFlowEdge, GenerationFlowNode } from './generationCanvasReactFlowAdapter'
import { GenerationFlowNodeScope } from './generationFlowNodeContext'

export function GenerationFlowNodeView({ data, selected }: NodeProps<GenerationFlowNode>): JSX.Element {
  const node = data.generationNode
  const collapsedGroupProxy = node.meta?.collapsedGroupProxy === true
  const NodeComponent = getGenerationNodeComponent(node.kind)
  const size = resolveNodeVisualSize(node)
  const bounds = getNodeSizeBounds(node.kind)
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const captureHistory = useGenerationCanvasStore((state) => state.captureHistory)
  const commitPersistedChange = useGenerationCanvasStore((state) => state.commitPersistedChange)
  const nodeCount = useGenerationCanvasStore((state) => state.nodes.length)
  const multiSelectionActive = useStore((state) => state.multiSelectionActive && data.primarySelection)
  const { zoom } = useViewport()
  const primarySelection = data.primarySelection && !multiSelectionActive
  const retainedLightweightRef = React.useRef(false)
  retainedLightweightRef.current = retainLargeCanvasLightweightRendering({
    retained: retainedLightweightRef.current,
    nodeCount,
    selected,
    primarySelection,
  })
  const lightweightMode = retainedLightweightRef.current || shouldUseLightweightNodeRenderingForSelection({
    nodeCount,
    zoom,
    selected,
    primarySelection,
  })

  return (
    <div
      className="generation-canvas-react-flow__node-shell"
      style={{ width: size.width, height: size.height, pointerEvents: collapsedGroupProxy ? 'none' : undefined }}
      aria-hidden={collapsedGroupProxy || undefined}
    >
      <NodeResizer
        isVisible={selected && !data.readOnly}
        minWidth={bounds.minWidth}
        minHeight={bounds.minHeight}
        maxWidth={bounds.maxWidth}
        maxHeight={bounds.maxHeight}
        color="var(--nomi-accent)"
        onResizeStart={() => captureHistory()}
        onResize={(_event, params) => {
          updateNode(node.id, {
            position: { x: params.x, y: params.y },
            size: { width: params.width, height: params.height },
            meta: { ...(node.meta || {}), userResized: true, previewHeight: params.height },
          }, { persist: false, emit: false, history: false })
        }}
        onResizeEnd={() => {
          const latest = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === node.id)
          if (latest) {
            emitCanvasGesture([{
              type: 'canvas.node.updated',
              payload: {
                nodeId: node.id,
                patch: { position: latest.position, size: latest.size, meta: latest.meta },
              },
            }])
          }
          commitPersistedChange()
        }}
      />
      {!data.readOnly ? (
        <>
          <Handle id="target-left" type="target" position={Position.Left} data-side="left" className="generation-canvas-react-flow__handle" />
          <Handle id="target-right" type="target" position={Position.Right} data-side="right" className="generation-canvas-react-flow__handle" />
        </>
      ) : null}
      {!collapsedGroupProxy ? (
        <GenerationFlowNodeScope>
          {shouldRenderFullNodeContent({ lightweightMode, selected: primarySelection, focusFlash: false }) ? (
            <NodeComponent node={node} selected={selected} readOnly={data.readOnly} />
          ) : (
            <LightweightGenerationNode
              node={node}
              appear={false}
              selected={selected}
              readOnly={data.readOnly}
            />
          )}
        </GenerationFlowNodeScope>
      ) : null}
      {!data.readOnly ? (
        <>
          <Handle id="source-left" type="source" position={Position.Left} data-side="left" className="generation-canvas-react-flow__handle" />
          <Handle id="source-right" type="source" position={Position.Right} data-side="right" className="generation-canvas-react-flow__handle" />
        </>
      ) : null}
    </div>
  )
}

export function GenerationFlowEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<GenerationFlowEdge>): JSX.Element {
  const { t } = useTranslation()
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const edge = data?.generationEdge
  const readOnly = Boolean(data?.readOnly)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const updateEdgeMode = useGenerationCanvasStore((state) => state.updateEdgeMode)
  const disconnectEdge = useGenerationCanvasStore((state) => state.disconnectEdge)
  const source = data?.sourceNode
  const target = data?.targetNode
  const modes = source && target ? availableEdgeModes(source, target) : []
  const incident = Boolean(data?.incident)
  const mode = edge?.mode || 'reference'
  const aggregateLabel = data?.aggregateDirection
    ? t(`generationCommon.canvas.group.aggregate${data.aggregateDirection === 'input' ? 'Input' : 'Output'}`)
    : null
  const showLabel = !readOnly && (menuOpen || (mode !== 'reference' && (incident || selected)))

  return (
    <g
      className="generation-canvas-v2__edge"
      data-mode={mode}
      data-edge-id={id}
      data-aggregate-group={data?.aggregateGroupId}
      data-active={selected ? 'true' : undefined}
      data-incident={incident ? 'true' : undefined}
    >
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={30}
        className={cn('generation-canvas-v2__edge-path', selected ? 'generation-canvas-react-flow__edge--selected' : undefined)}
      />
      {!readOnly ? (
        <path
          className="generation-canvas-v2__edge-hit"
          d={path}
          fill="none"
          stroke="rgba(18, 24, 38, 0.001)"
          strokeWidth={30}
          role="button"
          tabIndex={0}
          aria-label={t('generationCommon.canvas.edge.select', {
            source: source?.title || edge?.source || '',
            target: target?.title || edge?.target || '',
          })}
          onPointerDown={(event) => {
            event.stopPropagation()
            setMenuOpen(true)
          }}
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setMenuOpen(true)
          }}
        />
      ) : null}
      <circle className="generation-canvas-v2__edge-dot" cx={targetX} cy={targetY} r={3.2} />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="generation-canvas-react-flow__edge-label generation-canvas-v2__edge-control"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            data-edge-id={id}
          >
            <button
              type="button"
              className="generation-canvas-react-flow__edge-label-button generation-canvas-v2__edge-tag-pill"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t('generationCommon.canvas.edge.changeMode', {
                mode: t(`generationCommon.canvas.edge.modes.${mode}`),
              })}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen((open) => !open)
              }}
            >
              {aggregateLabel || t(`generationCommon.canvas.edge.modes.${mode}`)}
            </button>
            {menuOpen ? (
              <div
                className="generation-canvas-react-flow__edge-menu"
                role="menu"
                aria-label={t('generationCommon.canvas.edge.modeMenu')}
              >
                {modes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === edge?.mode}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (edge) updateEdgeMode(edge.id, mode)
                      setMenuOpen(false)
                    }}
                  >
                    {t(`generationCommon.canvas.edge.modes.${mode}`)}
                  </button>
                ))}
                <button
                  type="button"
                  className="generation-canvas-react-flow__edge-menu-delete"
                  role={data?.aggregateDirection ? 'button' : 'menuitem'}
                  aria-label={data?.aggregateDirection
                    ? t('generationCommon.canvas.group.disconnectAggregate')
                    : t('generationCommon.canvas.edge.disconnect', {
                      source: source?.title || edge?.source || '',
                      target: target?.title || edge?.target || '',
                    })}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (edge) disconnectEdge(edge.id)
                    setMenuOpen(false)
                  }}
                >
                  {t('generationCommon.canvas.edge.disconnectAction')}
                </button>
              </div>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  )
}

export const nodeTypes = { generation: GenerationFlowNodeView }
export const edgeTypes = { generation: GenerationFlowEdgeView }
