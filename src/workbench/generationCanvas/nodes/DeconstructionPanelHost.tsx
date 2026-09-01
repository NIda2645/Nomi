// 拆解面板宿主：读 store 的「哪条源视频占着右槽」，为它渲染 NodeDeconstructionPanel。
//
// 面板本体 Portal 到 .workbench-generation__canvas 右缘停靠（宽度取那上面继承的
// --generation-assistant-target-width，与 AI 栏共用一个宽度真相源，R-C-4）。宿主只负责按 store 选中
// 正确的源视频节点并挂/卸面板——互斥切换（开 Agent / 起稿）会把 openNodeId 置空，面板随之卸载，
// 但拆解**状态留在 store 槽里不丢**（collapse ≠ unmount 的语义落在「结果槽」上，R-C-3）。
import React from 'react'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import NodeDeconstructionPanel from './NodeDeconstructionPanel'

export default function DeconstructionPanelHost(): JSX.Element | null {
  const openNodeId = useGenerationCanvasStore((state) => state.videoDeconstructionOpenNodeId)
  const node = useGenerationCanvasStore((state) =>
    openNodeId ? state.nodes.find((candidate) => candidate.id === openNodeId) : undefined,
  )
  // 占槽的源节点被删/找不到 → 收槽（面板不孤挂）。
  const close = useGenerationCanvasStore((state) => state.closeVideoDeconstruction)
  React.useEffect(() => {
    if (openNodeId && !node) close()
  }, [openNodeId, node, close])

  if (!openNodeId || !node) return null
  return <NodeDeconstructionPanel node={node} />
}
