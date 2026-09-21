// 设计实验室 · Agent 面板 v4 · **整块面板**的板（Flow 创作 / 生成 / 预览 + Rendering + Dark + Collapsed）
//
// 只有这几张板在定稿里真的画了一整块面板，所以只有这几个状态渲整块。
// Main / Feasible / Sources / Process 四张板是**说明板**（文字卡、可行性表、来源对照表、时刻表），
// 没有可对账的界面件——它们的界面内容已经拆进 Vocabulary / Composer 两组的单件状态里，
// 不为它们再造一个「整块面板」状态充数。
import React from 'react'
import { IconBrowser, IconSettings } from '../../../../vendor/tablerIcons'
import { AgentPanelV4Panel } from '../../../../workbench/ai/v4/AgentPanelV4Panel'
import { AgentPanelV4Composer } from '../../../../workbench/ai/v4/AgentPanelV4Composer'
import { V4Intervention } from '../../../../workbench/ai/v4/AgentPanelV4Cards'
import { AgentTopbarChip } from '../../../../ui/app-shell/AgentTopbarChip'
import { agentTopbarChipBadge } from '../../../../ui/app-shell/agentTopbarChipBadge'
import { TooltipProvider } from '../../../../design'
import { dockStatusLabel } from '../../../../workbench/ai/v4/agentPanelV4DockStatus'
import { useV4Labels } from '../../../../workbench/ai/v4/agentPanelV4Labels'
import { useV4Fixtures, V4_LAB_SLOT_HANDLERS } from '../agentPanelV4LabKit'
import type { LabState } from '../../labScreen'

function FlowCreation(): JSX.Element {
  const fx = useV4Fixtures()
  return (
    <AgentPanelV4Panel
      slotHandlers={V4_LAB_SLOT_HANDLERS}
      flow={fx.flows.creation}
      slot={fx.slots.plan}
      context={{ ...fx.context, used: 36000 }}
      composer={{ skillSelected: true }}
      height={860}
    />
  )
}

function FlowGeneration(): JSX.Element {
  const fx = useV4Fixtures()
  return (
    <AgentPanelV4Panel
      slotHandlers={V4_LAB_SLOT_HANDLERS}
      flow={fx.flows.generation}
      slot={fx.slots.spendOneClip}
      context={{ ...fx.context, used: 68000 }}
      composer={{ mode: 'running' }}
      height={860}
    />
  )
}

function FlowPreview(): JSX.Element {
  const fx = useV4Fixtures()
  return (
    <AgentPanelV4Panel
      slotHandlers={V4_LAB_SLOT_HANDLERS}
      flow={fx.flows.preview}
      slot={fx.slots.threeEdits}
      context={{ ...fx.context, used: 82000 }}
      height={860}
    />
  )
}

function RenderingPanel(): JSX.Element {
  const fx = useV4Fixtures()
  return <AgentPanelV4Panel slotHandlers={V4_LAB_SLOT_HANDLERS} flow={fx.flows.rendering} context={{ ...fx.context, used: 44000 }} height={640} />
}

function DarkPanel(): JSX.Element {
  const fx = useV4Fixtures()
  return (
    <AgentPanelV4Panel
      slotHandlers={V4_LAB_SLOT_HANDLERS}
      flow={fx.flows.dark}
      slot={fx.slots.reversible}
      context={{ ...fx.context, used: 82000 }}
      height={800}
      darkMode
    />
  )
}

/**
 * 收起整场景（定稿 Collapsed 板 + 09-01 定稿 §11.2 收起态）。
 *
 * 两件事同屏才说得清收起是什么：**顶栏**那一格冒出角标（面板去哪儿了），
 * **画面下沿**留着同一个 composer 和介入槽（对话并没有被中断）。中间那一大片是还给内容的屏幕。
 *
 * 角标挂 `needs-confirm` 且数字 = 1：下沿正浮着一条介入槽等人点，顶栏那格报的必须是同一条。
 * 两处对不上，收起态就是在撒谎。
 */
function CollapsedScene(): JSX.Element {
  const fx = useV4Fixtures()
  const labels = useV4Labels()
  const tooltip = `${labels.dock.open} · ${dockStatusLabel('needs-confirm', 1, labels.dock)}`
  return (
    <TooltipProvider delayDuration={250} disableHoverableContent>
      <div className="flex flex-col bg-nomi-ink-05" style={{ width: 620, height: 360 }}>
        {/* 顶栏右簇的那一段：浏览器 │ 角标 │ 设置。落点就是这一格，四个面都一样。 */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 border-b border-nomi-line-soft bg-nomi-paper px-2.5 py-1.5">
          <span className="grid size-[30px] place-items-center rounded-[var(--nomi-radius-sm)] text-[var(--nomi-ink-80)]" aria-hidden="true">
            <IconBrowser size={15} stroke={1.8} />
          </span>
          <span className="h-[18px] w-px bg-workbench-border" aria-hidden="true" />
          <AgentTopbarChip
            reason="resident-collapsed"
            label="Nomi"
            tooltip={tooltip}
            status="needs-confirm"
            badge={agentTopbarChipBadge(1, 1)}
            onOpen={() => undefined}
          />
          <span className="h-[18px] w-px bg-workbench-border" aria-hidden="true" />
          <span className="grid size-[30px] place-items-center rounded-[var(--nomi-radius-sm)] text-[var(--nomi-ink-80)]" aria-hidden="true">
            <IconSettings size={15} stroke={1.8} />
          </span>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-end gap-2 p-3">
          <V4Intervention {...V4_LAB_SLOT_HANDLERS} data={fx.slots.reversible} labels={labels.intervention} />
          <AgentPanelV4Composer
            panelHeight={360}
            dock
            mode="idle"
            permission="step"
            value={fx.t('agentPanelV4.fixtureUserTrim')}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

/**
 * **反问卡放进真面板里**（2026-09-21 用户问「有弄我们的设计系统不？会不会格格不入？」）。
 *
 * 单件取景框里那张卡是浅色底、孤零零一格，看不出它和邻居合不合得来。这两格把它放回
 * 它真正出现的位置——上面是对话流、下面是 composer、外面是面板壳——并且**和付费确认卡
 * 用同一个取景**，好让两张卡的外框/圆角/内边距/按钮族能并排对账。
 *
 * 用现成夹具就够：这里要看的是**外观在不在一个家族里**，不是模型答得对不对。
 */
function PanelWithQuestion(): JSX.Element {
  const fx = useV4Fixtures()
  return (
    <AgentPanelV4Panel
      slotHandlers={V4_LAB_SLOT_HANDLERS}
      flow={fx.flows.creation}
      slot={fx.slots.question}
      context={{ ...fx.context, used: 36000 }}
      height={860}
    />
  )
}

/**
 * 同一个取景、同一条对话，槽里换成**普通确认卡**（可撤销档）。
 * 付费卡那一格不在这里：它的正文是节点参数条那个真组件，要先给画布 store 播种，
 * 住在 `07-spend-params.tsx`（`v4-panel-spend-light`）。
 *
 * 暗色**不另立一格**：暗色是翻真 token（`data-mantine-color-scheme`），由走查在同一格上翻。
 * 这里原来有过 `-dark` 两格，用的是面板的 `darkMode` prop——那个 prop 只换用户气泡的底色，
 * 面板和卡一点不动，拍出来的「暗色」和亮色是同一张。
 */
function PanelWithApproval(): JSX.Element {
  const fx = useV4Fixtures()
  return (
    <AgentPanelV4Panel
      slotHandlers={V4_LAB_SLOT_HANDLERS}
      flow={fx.flows.creation}
      slot={fx.slots.reversible}
      context={{ ...fx.context, used: 36000 }}
      height={860}
    />
  )
}

export const V4_FLOW_STATES: readonly LabState[] = [
  {
    id: 'v4-panel-question-light',
    name: '⑤ 反问卡**在真面板里**——和对话流、composer、面板壳一起看',
    source: '2026-09-21 用户：「有弄我们的设计系统不？会不会格格不入？」；对账物 = 同屏 composer',
    coverage: 'component-only',
    span: 2,
    render: () => <PanelWithQuestion />,
  },
  {
    id: 'v4-panel-approval-light',
    name: '⑤ 普通确认卡在真面板里（同族第三张）',
    source: '2026-09-22 卡族换壳：一处改、全族生效',
    coverage: 'component-only',
    span: 2,
    render: () => <PanelWithApproval />,
  },
  {
    id: 'v4-flow-creation',
    name: 'FlowCreation · 读文稿 → 载技能 → 起草分镜 → 计划槽',
    source: '2026-09-06-agent-panel-v4.md · FlowCreation 板',
    coverage: 'component-only',
    span: 2,
    render: () => <FlowCreation />,
  },
  {
    id: 'v4-flow-generation',
    name: 'FlowGeneration · 四张参考图任务卡 + 付费槽',
    source: '2026-09-06-agent-panel-v4.md · FlowGeneration 板',
    coverage: 'component-only',
    span: 2,
    render: () => <FlowGeneration />,
  },
  {
    id: 'v4-flow-preview',
    name: 'FlowPreview · 修剪 + 前移 + 三处改动计划',
    source: '2026-09-06-agent-panel-v4.md · FlowPreview 板',
    coverage: 'component-only',
    span: 2,
    render: () => <FlowPreview />,
  },
  {
    id: 'v4-rendering',
    name: 'Rendering · 助手文本的 12 种 Markdown 格式',
    source: '2026-09-06-agent-panel-v4.md · Rendering 板',
    coverage: 'component-only',
    span: 2,
    render: () => <RenderingPanel />,
  },
  {
    id: 'v4-collapsed',
    name: 'Collapsed · 结果全屏（顶栏角标 + 下沿 composer / 介入槽）',
    source: '2026-09-06-agent-panel-v4.md · Collapsed 板 + 2026-09-01 §11.2 收起态',
    coverage: 'component-only',
    span: 2,
    render: () => <CollapsedScene />,
  },
  {
    id: 'v4-dark',
    name: 'Dark · 同一块面板，token 翻转',
    source: '2026-09-06-agent-panel-v4.md · Dark 板',
    coverage: 'component-only',
    span: 2,
    scheme: 'dark',
    render: () => <DarkPanel />,
  },
]
