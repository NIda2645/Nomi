/**
 * [INPUT]: 依赖 react
 * [OUTPUT]: 对外提供 RefineLayoutContext / RefineLayout：精修用哪套布局（旧右栏双卡 / 「选中才出」）
 * [POS]: director/panels 的**样张期接缝**，不是开关。2026-10-04 用户拍板精修走方向 A「选中才出」，但要求先在设计实验室看样张、
 *        拍板后才把真实入口切过去（设计卡 docs/plan/2026-10-04-director-refine-select-to-show.md）。所以默认值仍是旧布局，
 *        只有设计实验室的取景台把它设成 'select-to-show'。产品代码里没有任何地方写这个值。
 *        拍板后同一 PR：EditorStage 直接渲染 DirectorRefineShell，删掉本文件、SidePanels、DirectorTopBar 与各组件的旧分支（P1）。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react'

export type RefineLayout = 'docked-cards' | 'select-to-show'

export const RefineLayoutContext = React.createContext<RefineLayout>('docked-cards')
