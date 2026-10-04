import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { WorkbenchMenu } from '../../../design/menu'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { buildNodeDeriveMenuItems, type NodeDeriveKind } from './nodeDeriveMenuModel'

/**
 * 节点右侧「+」圈点一下：**用这个节点生成…**（2026-10-04 节点快捷动作批次 1）。
 *
 * 选一项 = 新建这一类空节点 + 连好线 + 选中它（不生成、不花钱）。和「拖线到空白处松手」问的是
 * 同一个问题，所以判据只有一份（`connectionCreateVerdictsForSource`），接线那一轮两处出同一个菜单。
 *
 * 和拖线松手菜单的差别只有一条：**接不上的不藏，灰掉并在第二行说原因**（§1.6 C1 / C4：可点即有效，
 * 否则禁用并说明为什么）。藏起来的后果是用户以为「视频节点接不出图片」是 bug，或者以为是自己没找到。
 */

export function NodeDeriveMenu({
  source,
  point,
  onPick,
  onClose,
}: {
  source: GenerationCanvasNode
  /** 「+」圈的视口坐标（菜单左上角贴这里，越界由 Radix 避让）。 */
  point: { x: number; y: number }
  onPick: (kind: NodeDeriveKind) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const items = React.useMemo(() => buildNodeDeriveMenuItems(source, t, onPick), [onPick, source, t])
  return (
    <WorkbenchMenu
      open
      onOpenChange={(next) => { if (!next) onClose() }}
      point={point}
      items={items}
      ariaLabel={t('generationCommon.quickActions.derive.title')}
      onPointerDown={(event) => event.stopPropagation()}
      data-testid="node-derive-menu"
    />
  )
}
