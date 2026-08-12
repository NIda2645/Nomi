/**
 * 只读节点图里的一张节点卡。
 * plan: docs/plan/2026-08-12-model-settings-home-and-comfyui-workflow-page.md
 *
 * 三行信息，按「用户认得出」排序（R2：每条信息问「有行动价值吗」）：
 *   ① 角色胶囊（绑了才有）—— 用户真正在找的就是这个（「哪个是提示词」）
 *   ② 作者起的标题（_meta.title 优先）—— 真人起的名字，比 class_type 贴切
 *   ③ class_type #id —— 对账用；跟 ComfyUI 里看到的一致，用来核对是不是同一个节点
 *
 * 可点性（设计系统 §1.6 C1：可点即有效，否则禁用并说明为什么）：
 * 没有任何可绑输入、也没有可调标量的节点（CLIPLoader、VAELoader 这类），**渲染成非按钮**并挂
 * title 说清为什么点不了——不摆一个点下去什么都不发生的死按钮。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../utils/cn'
import { NODE_HEIGHT, NODE_WIDTH, type PositionedNode } from '../comfyuiGraphGeometry'
import { ROLE_TONES } from './roleTone'

type WorkflowNodeCardProps = {
  node: PositionedNode
  /** 这个节点有东西可绑（角色或可调字段）——没有就不给按钮语义。 */
  bindable: boolean
  selected: boolean
  onSelect: (nodeId: string) => void
}

function WorkflowNodeCard({ node, bindable, selected, onSelect }: WorkflowNodeCardProps): JSX.Element {
  const { t } = useTranslation()
  const tone = node.role ? ROLE_TONES[node.role] : null
  const roleLabel = tone ? t(tone.labelKey) : t('comfyuiWorkflowPage.roles.none')
  const style: React.CSSProperties = { left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }
  const ariaLabel = node.role
    ? t('comfyuiWorkflowPage.graph.nodeRoleAria', { title: node.title, classType: node.classType, id: node.nodeId, role: roleLabel })
    : t('comfyuiWorkflowPage.graph.nodeAria', { title: node.title, classType: node.classType, id: node.nodeId })

  const body = (
    <>
      {tone ? (
        <span className={cn('flex items-center gap-1 text-micro font-semibold leading-none', tone.text)}>
          <tone.Icon size={11} stroke={2} aria-hidden="true" />
          {roleLabel}
        </span>
      ) : null}
      <span className="block w-full truncate text-caption leading-tight text-nomi-ink">{node.title}</span>
      <span className="block w-full truncate font-nomi-mono text-micro leading-tight text-nomi-ink-40">
        {node.classType} #{node.nodeId}
      </span>
      {node.exposedCount > 0 ? (
        <span
          className="absolute bottom-1 right-1 rounded-full bg-nomi-accent-soft px-1.5 text-micro font-semibold leading-[15px] text-nomi-accent"
          title={t('comfyuiWorkflowPage.graph.exposedBadgeAria', { count: node.exposedCount })}
        >
          {t('comfyuiWorkflowPage.graph.exposedBadge', { count: node.exposedCount })}
        </span>
      ) : null}
    </>
  )

  const shared = cn(
    'absolute z-[1] flex flex-col justify-center gap-0.5 overflow-hidden rounded-nomi px-2 py-1.5 text-left',
    'bg-nomi-paper shadow-nomi-sm',
    tone ? cn('border', tone.border, tone.soft) : 'border border-nomi-line',
    selected && 'ring-2 ring-nomi-accent',
  )

  if (!bindable) {
    return (
      <div
        className={cn(shared, 'cursor-default opacity-70')}
        style={style}
        data-node-id={node.nodeId}
        title={t('comfyuiWorkflowPage.graph.unbindableTitle')}
        aria-label={ariaLabel}
      >
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={cn(shared, 'cursor-pointer hover:border-nomi-accent')}
      style={style}
      data-node-id={node.nodeId}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={selected}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(node.nodeId)
      }}
    >
      {body}
    </button>
  )
}

export default React.memo(WorkflowNodeCard)
