// P4 S5+S6 — 多镜节点的画布叠加层（占位三态 + 版本条）合一挂载点。两者都只对多镜节点（meta.productionRunId）
// 生效、非多镜节点内部早退零开销，且渲染时机互斥（占位=还没回填 result；版本条=已有 result 且 history≥2）。收进
// 一个组件由 BaseGenerationNode 单次挂载，既守 800 行门岗（R9），也让「多镜节点画布叠加」有一个明确的家（P1）。
import React from 'react'

import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { ProductionShotPlaceholder } from './ProductionShotPlaceholder'
import { ShotVersionStrip } from './ShotVersionStrip'

export function ProductionShotOverlays({ node, selected }: { node: GenerationCanvasNode; selected: boolean }): JSX.Element {
  return (
    <>
      <ProductionShotPlaceholder node={node} />{/* S5 占位三态：排队/生成/已停/失败 */}
      <ShotVersionStrip node={node} selected={selected} />{/* S6 版本条：history≥2 + 选中才出（L2） */}
    </>
  )
}
