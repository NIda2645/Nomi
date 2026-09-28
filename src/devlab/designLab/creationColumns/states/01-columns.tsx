import React from 'react'
import type { LabState } from '../../labScreen'
import { CreationColumnsStage } from '../CreationColumnsStage'

const SOURCE = 'docs/design/2026-09-10-creation-workspace-columns.md'
const DRAWER_SOURCE = 'docs/design/2026-09-17-creation-left-column-drawer-a1.md'
export const CREATION_COLUMNS_STATES: readonly LabState[] = [
  {
    id: 'columns-current',
    name: '生产 · 真实创作外壳',
    source: SOURCE,
    coverage: 'shell',
    render: () => <CreationColumnsStage />,
  },
  {
    id: 'columns-specimen',
    name: '已实施 · 统一外框',
    source: SOURCE,
    coverage: 'shell',
    render: () => <CreationColumnsStage specimen />,
  },
  {
    id: 'columns-specimen-dark',
    name: '已实施 · 暗色',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => <CreationColumnsStage specimen />,
  },
  {
    id: 'columns-collapsed',
    name: 'A-1 · 创作面收起「创作内容」',
    source: DRAWER_SOURCE,
    coverage: 'shell',
    render: () => <CreationColumnsStage specimen treeCollapsed />,
  },
  {
    id: 'columns-collapsed-dark',
    name: 'A-1 · 收起态 · 暗色',
    source: DRAWER_SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    render: () => <CreationColumnsStage specimen treeCollapsed />,
  },
  {
    id: 'columns-storyboard-tree',
    name: 'A-1 · 分镜面左栏 = 同一张圆角卡片',
    source: DRAWER_SOURCE,
    coverage: 'shell',
    render: () => <CreationColumnsStage specimen mode="storyboard" treeCollapsed={false} />,
  },
]
