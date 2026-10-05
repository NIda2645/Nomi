// 设计实验室 · 节点快捷动作（批次 1 样张）· 浮条这一族。
//
// 除第一格（现役浮条，对照用）外都是 `component-only`：组件在 `src/` 里、生产里还没有调用点
// （本轮只到样张，不切真实入口）。`mirrors: 'none'` 就是在说这件事。
//
// 顺序有意义：`labStates.mjs` 按文件名排序解析本屏 `states/`，汇总口按同样顺序拼接。
import React from 'react'
import type { LabState } from '../../labScreen'
import { QuickToolbarStage } from '../nodeQuickActionsLabKit'

const SOURCE = 'docs/plan/2026-10-04-node-quick-actions-batch1.md §1 ★4 / §4'
const CURRENT_SOURCE = '现役 NodeImageEditToolbar（#969 收成一行）'

export const QUICK_ACTION_TOOLBAR_STATES: readonly LabState[] = [
  {
    id: 'qa-01-current',
    name: '现役 · 图片浮条（对照：抠图 / 裁切▾ / 变换▾ / 画板）',
    source: CURRENT_SOURCE,
    mirrors: 'src/workbench/generationCanvas/nodes/BaseGenerationNode.tsx:297',
    coverage: 'shell',
    render: () => <QuickToolbarStage variant="current" />,
  },
  {
    id: 'qa-02-toolbar',
    name: '主样张 · 默认：预设场景▾ / 抠图 / 改图▾ / 宫格▾ + 画板纯图标（文字钮 4 个，和现在一样多；抠图留一级是用户 10-05 拍板）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    render: () => <QuickToolbarStage variant="proposed" />,
  },
  {
    id: 'qa-03-presets-open',
    name: '预设场景展开 · 5 项（不写价格、不写价格说明）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    capture: 'viewport',
    render: () => <QuickToolbarStage variant="proposed" open="presets" />,
  },
  {
    id: 'qa-05-refine-open',
    name: '改图展开 · 生成新图（高清灰掉说原因 / 扩图）+ 本机处理不花钱（裁剪 / 旋转翻转）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    capture: 'viewport',
    render: () => <QuickToolbarStage variant="proposed" open="refine" />,
  },
  {
    id: 'qa-06-grid-picker',
    name: '宫格展开 · 等分 4/9/16/25 + 自定义点阵（悬停到 2 行 3 列）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    capture: 'viewport',
    render: () => <QuickToolbarStage variant="proposed" open="grid" hoverCell="2x3" />,
  },
  {
    id: 'qa-07-derived-grid-split',
    name: '九宫格派生出的节点 · 浮条直接有「切成 9 张」',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    render: () => <QuickToolbarStage variant="proposed" derivedGrid />,
  },
  {
    id: 'qa-09-narrow',
    name: '窄画布（520 宽）· 浮条按舞台宽折两行，不裁切',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    render: () => <QuickToolbarStage variant="proposed" stageWidth={520} />,
  },
  {
    id: 'qa-10-dark-presets',
    name: '暗色 · 预设场景展开',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <QuickToolbarStage variant="proposed" open="presets" />,
  },
]
