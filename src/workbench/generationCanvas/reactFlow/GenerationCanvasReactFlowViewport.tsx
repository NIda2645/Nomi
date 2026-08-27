import React from 'react'
import {
  ReactFlow,
  ViewportPortal,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesChange,
  type Viewport,
} from '@xyflow/react'
import { CanvasSelectionToolbar } from '../components/CanvasSelectionToolbar'
import { GroupFrameList } from '../components/GroupFrame'
import type { getSelectedBounds } from '../components/generationCanvasGeometry'
import type { useCanvasProductionActions } from '../components/useCanvasProductionActions'
import type { GenerationFlowEdge, GenerationFlowNode } from './generationCanvasReactFlowAdapter'
import { canvasViewportFromFlow } from './generationCanvasReactFlowAdapter'
import { edgeTypes, nodeTypes } from './GenerationCanvasReactFlowNodes'

type GenerationCanvasReactFlowViewportProps = {
  flowNodes: GenerationFlowNode[]
  flowEdges: GenerationFlowEdge[]
  viewport: Viewport
  readOnly: boolean
  onNodesChange: OnNodesChange<GenerationFlowNode>
  onNodeDragStart: OnNodeDrag<GenerationFlowNode>
  onNodeDragStop: OnNodeDrag<GenerationFlowNode>
  onSelectionEnd: () => void
  onEdgeClick: (event: React.MouseEvent, edge: GenerationFlowEdge) => void
  onEdgesDelete: OnEdgesDelete<GenerationFlowEdge>
  onNodeContextMenu: (event: React.MouseEvent, node: GenerationFlowNode) => void
  onPaneContextMenu: (event: MouseEvent | React.MouseEvent) => void
  onPaneClick: () => void
  onConnect: OnConnect
  onConnectStart: OnConnectStart
  onConnectEnd: OnConnectEnd
  canvasPointerStartRef: React.MutableRefObject<{ x: number; y: number } | null>
  canvasPanMovedRef: React.MutableRefObject<boolean>
  setCanvasDragging: (element: HTMLElement | null, dragging: boolean) => void
  hostRef: React.RefObject<HTMLDivElement>
  setLiveViewport: React.Dispatch<React.SetStateAction<Viewport>>
  activeCategoryId: string
  rememberCategoryViewport: (categoryId: string, viewport: { zoom: number; offset: { x: number; y: number } }) => void
  groupBoxes: React.ComponentProps<typeof GroupFrameList>['boxes']
  onGroupFramePointerDown: React.ComponentProps<typeof GroupFrameList>['onPointerDown']
  pendingConnection: boolean
  pendingConnectionSide: React.ComponentProps<typeof GroupFrameList>['pendingConnectionSide']
  onConnectToGroup: React.ComponentProps<typeof GroupFrameList>['onConnectToGroup']
  selectedBounds: ReturnType<typeof getSelectedBounds>
  selectedNodeIds: readonly string[]
  selectedGroupIds: readonly string[]
  production: ReturnType<typeof useCanvasProductionActions>
  contactSheetCount: number
  onGroupSelectedNodes: () => void
  onUngroupSelectedNodes: () => void
  onBuildContactSheet: () => void
  onClearSelection: () => void
}

export function GenerationCanvasReactFlowViewport({
  flowNodes,
  flowEdges,
  viewport,
  readOnly,
  onNodesChange,
  onNodeDragStart,
  onNodeDragStop,
  onSelectionEnd,
  onEdgeClick,
  onEdgesDelete,
  onNodeContextMenu,
  onPaneContextMenu,
  onPaneClick,
  onConnect,
  onConnectStart,
  onConnectEnd,
  canvasPointerStartRef,
  canvasPanMovedRef,
  setCanvasDragging,
  hostRef,
  setLiveViewport,
  activeCategoryId,
  rememberCategoryViewport,
  groupBoxes,
  onGroupFramePointerDown,
  pendingConnection,
  pendingConnectionSide,
  onConnectToGroup,
  selectedBounds,
  selectedNodeIds,
  selectedGroupIds,
  production,
  contactSheetCount,
  onGroupSelectedNodes,
  onUngroupSelectedNodes,
  onBuildContactSheet,
  onClearSelection,
}: GenerationCanvasReactFlowViewportProps): JSX.Element {
  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultViewport={viewport}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable={!readOnly}
      elevateNodesOnSelect={false}
      panOnDrag={[0, 1]}
      autoPanOnConnect={false}
      selectionKeyCode="Shift"
      multiSelectionKeyCode="Shift"
      noPanClassName="generation-canvas-react-flow__no-pan"
      onlyRenderVisibleElements
      deleteKeyCode={null}
      fitView={false}
      onNodesChange={onNodesChange}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      onSelectionEnd={onSelectionEnd}
      onEdgeClick={onEdgeClick}
      onEdgesDelete={onEdgesDelete}
      onNodeContextMenu={onNodeContextMenu}
      onPaneContextMenu={onPaneContextMenu}
      onPaneClick={onPaneClick}
      onConnect={onConnect}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      onMoveStart={() => {
        if (!canvasPointerStartRef.current) canvasPanMovedRef.current = false
      }}
      onMove={() => {
        if (!canvasPanMovedRef.current) return
        setCanvasDragging(hostRef.current, true)
      }}
      onMoveEnd={(_event, nextViewport) => {
        if (canvasPanMovedRef.current) setCanvasDragging(hostRef.current, false)
        canvasPanMovedRef.current = false
        setLiveViewport(nextViewport)
        rememberCategoryViewport(activeCategoryId, canvasViewportFromFlow(nextViewport))
      }}
      proOptions={{ hideAttribution: true }}
    >
      <ViewportPortal>
        <GroupFrameList
          boxes={groupBoxes}
          onPointerDown={onGroupFramePointerDown}
          pendingConnection={pendingConnection}
          pendingConnectionSide={pendingConnectionSide}
          onConnectToGroup={onConnectToGroup}
          readOnly={readOnly}
        />
      </ViewportPortal>
      <ViewportPortal>
        {selectedBounds && selectedNodeIds.length > 1 && !readOnly ? (
          <CanvasSelectionToolbar
            selectedCount={selectedNodeIds.length}
            selectedGroupCount={selectedGroupIds.length}
            transform={`translate(${Math.round(selectedBounds.minX + selectedBounds.width / 2)}px, ${Math.round(selectedBounds.minY - 16 - 58)}px) translateX(-50%)`}
            eligibleCount={production.eligibleIds.length}
            executionGroups={production.executionGroups}
            concurrency={production.concurrency}
            contactSheetCount={contactSheetCount}
            onConcurrencyChange={production.setConcurrency}
            onGenerate={production.generate}
            onApplyModel={production.applyModel}
            onGroupSelectedNodes={onGroupSelectedNodes}
            onUngroupSelectedNodes={onUngroupSelectedNodes}
            onBuildContactSheet={onBuildContactSheet}
            onClearSelection={onClearSelection}
          />
        ) : null}
      </ViewportPortal>
    </ReactFlow>
  )
}
