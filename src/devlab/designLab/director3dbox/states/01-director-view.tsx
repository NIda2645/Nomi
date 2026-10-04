// 设计实验室 · 导演视图（3D-BOX）· 三态 × 中英两轨。
//
// 每一格都是现役 DirectorEditor（开关开）+ 现役 Agent 面板，夹具只给数据与只读桥（见 director3dboxLabKit.tsx）。
// 三态对应样张 `director-3dbox-mockup`（布局 A + v2 镜头条）里要拍板的三个画面：
//   · 空工程的导演视图（还没有镜头）；
//   · 庭院对峙工程的导演视图，用户点了第 2 张镜头卡（播放头停在第 2 镜开头）；
//   · 同一工程切到「精修」（今天整套导演台原样）。
// 工程是 S1 oracle 计划 courtyard-standoff 经现役编译器编出来的：样张画的就是这一题（4 镜 · 12 秒）。
import React from 'react'
import type { LabState } from '../../labScreen'
import { Director3dBoxStage, courtyardFixture } from '../director3dboxLabKit'

const SOURCE = 'docs/plan/2026-10-04-director-3dbox-phase3a-shell.md · 导演视图 v2（样张 director-3dbox-mockup，布局 A + v2 镜头条）'

export const DIRECTOR_VIEW_STATES: readonly LabState[] = [
  {
    id: 'd3-empty-director-zh',
    name: '空工程 · 导演视图（中文）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxStage locale="zh-CN" project={null} />,
  },
  {
    id: 'd3-courtyard-director-zh',
    name: '庭院对峙 · 导演视图 · 点第 2 镜（中文）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxStage locale="zh-CN" project={courtyardFixture()} drive="shot-2" />,
  },
  {
    id: 'd3-courtyard-refine-zh',
    name: '庭院对峙 · 精修（中文）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxStage locale="zh-CN" project={courtyardFixture()} drive="shot-2-refine" />,
  },
  {
    id: 'd3-empty-director-en',
    name: '空工程 · 导演视图（英文）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxStage locale="en" project={null} />,
  },
  {
    id: 'd3-courtyard-director-en',
    name: '庭院对峙 · 导演视图 · 点第 2 镜（英文）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxStage locale="en" project={courtyardFixture()} drive="shot-2" />,
  },
  {
    id: 'd3-courtyard-refine-en',
    name: '庭院对峙 · 精修（英文）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxStage locale="en" project={courtyardFixture()} drive="shot-2-refine" />,
  },
]
