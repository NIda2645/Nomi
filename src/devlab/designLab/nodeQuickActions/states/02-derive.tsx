// 设计实验室 · 节点快捷动作（批次 1 样张）· 派生与接出这一族。
//
// 「用这个节点生成…」（点「+」圈 / 拖线松手同一个菜单）与右键「复制为变体」已接进画布；派生中 / 派生失败两格
// 渲染的是现役 `BaseGenerationNode`，状态来自真 store——派生出的节点和手动 ↑ 的节点长得一样，
// 这正是要钉住的：派生不新造一套节点状态。
import React from 'react'
import type { LabState } from '../../labScreen'
import { ContextMenuStage, DeriveMenuStage, DerivedStage } from '../nodeQuickActionsLabKit'

const SOURCE = 'docs/plan/2026-10-04-node-quick-actions-batch1.md §1 ★4 / §2'

export const QUICK_ACTION_DERIVE_STATES: readonly LabState[] = [
  {
    id: 'qa-11-derive-menu-image',
    name: '图片节点「+」→ 用这个节点生成…（接不上的灰掉，第二行写原因）',
    source: SOURCE,
    mirrors: 'src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlowOverlays.tsx:147',
    coverage: 'shell',
    capture: 'viewport',
    render: () => <DeriveMenuStage sourceKind="image" />,
  },
  {
    id: 'qa-12-derive-menu-video',
    name: '视频节点「+」→ 用这个节点生成…（判据与拖线松手同一份）',
    source: SOURCE,
    mirrors: 'src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlowOverlays.tsx:147',
    coverage: 'shell',
    capture: 'viewport',
    render: () => <DeriveMenuStage sourceKind="video" />,
  },
  {
    id: 'qa-13-context-duplicate',
    name: '右键 · 复制为变体（带上游连线，不带结果）',
    source: SOURCE,
    mirrors: 'src/workbench/generationCanvas/reactFlow/GenerationCanvasReactFlowOverlays.tsx:121',
    coverage: 'shell',
    capture: 'viewport',
    render: () => <ContextMenuStage />,
  },
  {
    id: 'qa-14-deriving',
    name: '派生节点在用户点 ↑ 之后 · 生成中（与手动 ↑ 同一套状态，源节点不变）',
    source: SOURCE,
    mirrors: 'src/workbench/generationCanvas/nodes/BaseGenerationNode.tsx:502',
    coverage: 'shell',
    render: () => <DerivedStage failed={false} />,
  },
  {
    id: 'qa-15-derive-failed',
    name: '派生节点生成失败 · 错误落在新节点上，源节点不变',
    source: SOURCE,
    mirrors: 'src/workbench/generationCanvas/nodes/BaseGenerationNode.tsx:350',
    coverage: 'shell',
    render: () => <DerivedStage failed />,
  },
]
