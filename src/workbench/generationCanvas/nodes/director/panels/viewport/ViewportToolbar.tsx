/**
 * [INPUT]: 依赖 react、react-i18next、../../../../../../design 的 NomiSegmented、../../../../../../vendor/tablerIcons、
 *          ../../DirectorEditorContext、../../model/hotkeys（DIRECTOR_HOTKEYS / formatHotkey）、./useDirectorToolChange
 *          onCancelCreation 回调：点击任意工具前取消角色/方块/路径创建模式
 * [OUTPUT]: 对外提供 ViewportToolbar：顶栏第三簇「工具」——选择 / 移动 / 旋转 / 缩放 ｜ 手绘画线 / 逐点；
 *           切工具走 ./useDirectorToolChange（与精修属性卡里的画线 / 逐点同一份写法）
 * [POS]: director/panels/viewport 的工具簇，由 topbar/DirectorTopBar 装配（2026-09-09 五簇重排：重置视角归「视图」簇、
 *        退出归「交付」簇，本组件只剩工具本身）。画线 / 逐点是模式不是 gizmo 工具，进模式时关 gizmo；
 *        编辑模式提示不在这里，住检查器「空间变换」卡。精修「选中才出」顶栏传 variant="transform"：只放选择 / 移动 / 旋转 / 缩放、
 *        格子收窄；画线 / 逐点是「给选中的角色或机位画路径」，搬到属性卡头（就近，§1.5.1 L2），顶栏不因选中而变宽、不抖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { NomiSegmented } from '../../../../../../design'
import { IconArrowsMove, IconPencil, IconPointer, IconResize, IconRotate, IconRoute } from '../../../../../../vendor/tablerIcons'
import { useDirectorStore } from '../../DirectorEditorContext'
import { DIRECTOR_HOTKEYS, formatHotkey } from '../../model/hotkeys'
import { useDirectorToolChange } from './useDirectorToolChange'

type ToolKey = 'select' | 'translate' | 'rotate' | 'scale' | 'drawPencil' | 'waypoint'

const TOOL_ICONS: Record<ToolKey, React.ReactNode> = {
  select: <IconPointer size={16} stroke={1.9} />,
  translate: <IconArrowsMove size={16} stroke={1.9} />,
  rotate: <IconRotate size={16} stroke={1.9} />,
  scale: <IconResize size={16} stroke={1.9} />,
  drawPencil: <IconPencil size={16} stroke={1.9} />,
  waypoint: <IconRoute size={16} stroke={1.9} />,
}
const TOOL_ORDER: ToolKey[] = ['select', 'translate', 'rotate', 'scale', 'drawPencil', 'waypoint']
const TRANSFORM_TOOLS: ToolKey[] = ['select', 'translate', 'rotate', 'scale']

export function ViewportToolbar({ onCancelCreation, variant = 'all' }: { onCancelCreation?: () => void; variant?: 'all' | 'transform' }): JSX.Element {
  const { t } = useTranslation()
  const transformMode = useDirectorStore((state) => state.transformMode)
  const drawMode = useDirectorStore((state) => state.drawMode)
  const toolValue: ToolKey = drawMode === 'pencil' ? 'drawPencil' : drawMode === 'waypoint' ? 'waypoint' : transformMode ?? 'select'
  const onToolChange = useDirectorToolChange(onCancelCreation)
  const compact = variant === 'transform'

  return (
    <div
      className="flex items-center gap-1"
      role="toolbar"
      aria-label={t('director.topbar.toolsAria')}
      data-testid="director-viewport-toolbar"
    >
      <NomiSegmented
        ariaLabel={t('director.topbar.toolsAria')}
        density="compact"
        fit="content"
        value={toolValue}
        itemClassName={compact ? 'px-1' : undefined}
        options={(compact ? TRANSFORM_TOOLS : TOOL_ORDER).map((key) => ({
          value: key,
          label: <span className={compact ? 'inline-flex items-center justify-center' : 'inline-flex items-center justify-center px-0.5'}>{TOOL_ICONS[key]}</span>,
          title: `${t(`director.topbar.${key}`)} (${formatHotkey(DIRECTOR_HOTKEYS[key])})`,
        }))}
        onChange={onToolChange}
      />
    </div>
  )
}
