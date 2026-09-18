import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react'
import { WorkbenchIconButton } from '../../design'
import { useWorkbenchStore } from '../workbenchStore'
import { useCreationResourceTreeCollapsed } from './useCreationResourceTreeCollapsed'

/**
 * 「创作内容」列收起/展开的**唯一一对钮**（§1.5.2 一功能一个家）：
 * 展开态住左栏头部、和「+ 新建」同组；收起态住中间面板头部最左、把标题挤开一格。
 * 不再在顶栏 / 右键菜单 / 命令面板各放一个，也不配快捷键（A-2 再排）。
 */

/**
 * `placement='column'`：左栏头部的收起钮（左栏只在展开态挂载，所以它恒可见）。
 * `placement='panel'`：中间面板头部的展开钮——**收起时无条件渲染**，展开时返回 null。
 * 绝不许抄 `CollapsedAiChip.tsx:24` 的条件渲染：那颗角标在 agent 空闲时压根不长出来，
 * 用户就没有回头路了（卡点④）。
 */
export function CreationResourceTreeToggle({ placement }: { placement: 'column' | 'panel' }): JSX.Element | null {
  const { t } = useTranslation()
  const collapsed = useCreationResourceTreeCollapsed()
  const setCollapsed = useWorkbenchStore((state) => state.setCreationResourceTreeCollapsed)
  if (placement === 'panel' && !collapsed) return null
  const expanding = placement === 'panel'
  const label = expanding ? t('creationAi.documentList.expandColumn') : t('creationAi.documentList.collapseColumn')
  return (
    <WorkbenchIconButton
      icon={expanding
        ? <IconLayoutSidebarLeftExpand size={16} stroke={1.6} />
        : <IconLayoutSidebarLeftCollapse size={16} stroke={1.6} />}
      label={label}
      title={label}
      className="shrink-0"
      data-creation-resource-tree-toggle={expanding ? 'expand' : 'collapse'}
      onClick={() => setCollapsed(expanding ? false : true)}
    />
  )
}
