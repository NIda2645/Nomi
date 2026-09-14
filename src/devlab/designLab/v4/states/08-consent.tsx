// 设计实验室 · Agent 面板 v4 · 「帮 Nomi 变好」首次询问卡（样张 A，用户 09-15 已拍板）+ 一键反馈卡（样张 B）。
//
// 这两格是 `component-only`，不是 `shell`，理由各自不同、都写清：
//   · 询问卡的触发条件是「这台机器上还没问过」（localStorage），而 `ShellStage` 每次都跑在
//     同一个实验室 origin 上——要么它永远出现（把三格空态挡掉），要么永远不出现。
//     所以这一格用 `forceVisible` 直接把它摆出来取景，**同时**在 `agentPanelV4LabHost.tsx`
//     里把标记置成「已问过」，让那三格空态保持原样。
//   · 反馈卡的三个态（待发 / 已发 / 离线排队）由主进程的发送结果决定，而实验室没有桌面桥。
//     这里给的是「桥不在」的那一档真实长相：发送钮**禁用且 title 说清为什么**（设计系统 C1），
//     这正是它在浏览器实验室里应该的样子，不是编出来的。
//
// 提醒（`lab-fixtures-must-mirror-real-callsites` 那条教训）：这两格里渲染的都是**生产组件**，
// props 只有一个 `forceVisible`/`request`，没有第二份编出来的数据。
import React from 'react'
import type { LabState } from '../../labScreen'
import { V4ConsentCard } from '../../../../workbench/ai/v4/AgentPanelV4Consent'
import { FeedbackReportCard } from '../../../../ui/community/FeedbackReportCard'
import { V4_PANEL_WIDTH } from '../agentPanelV4LabKit'

function Panel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="bg-nomi-canvas p-3" style={{ width: V4_PANEL_WIDTH }}>
      {children}
    </div>
  )
}

export const V4_CONSENT_STATES: readonly LabState[] = [
  {
    id: 'v4-consent-first-ask',
    name: '首次询问卡 · 两个钮同等大小（没有「稍后再说」、没有隐私长文链接）',
    source: '样张 A（scratchpad/feedback-loop/feedback-loop-proposal-v2.svg）· 现役 AgentPanelV4Consent.tsx',
    coverage: 'component-only',
    span: 2,
    render: () => <Panel><V4ConsentCard forceVisible /></Panel>,
  },
  {
    id: 'v4-feedback-report-idle',
    name: '一键反馈 · 待发（一行自动摘要 · 内容默认不勾 · 留言可空 · 无桥时发送禁用并说明）',
    source: '样张 B（同上）· 现役 FeedbackReportCard.tsx',
    coverage: 'component-only',
    span: 2,
    render: () => (
      <Panel>
        <FeedbackReportCard
          request={{
            intent: 'problem',
            surface: 'model-validation',
            stage: 'model',
            errorKind: 'adapter_probe_not_found',
            summary: '模型验证失败：接口地址返回 404',
            provider: 'apimart',
            model: 'gpt-5.5',
          }}
        />
      </Panel>
    ),
  },
]
