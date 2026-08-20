import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconClipboard,
  IconCopy,
  IconCut,
  IconLayersSubtract,
  IconTrash,
} from '@tabler/icons-react'
import { cn } from '../../../utils/cn'
import { platformModifier } from './canvasControlsHelpModel'

/**
 * 节点右键菜单（2026-08-20 用户拍板样张）。
 *
 * 为什么要它：复制/剪切/粘贴自 2026-06-12 就能用，但画布上**一个可见入口都没有**——
 * 右键节点原先被排除名单挡掉、什么都不弹，节点工具条与多选工具条也都没有复制钮，
 * 只剩键盘一条路且只写在帮助面板里。群反馈原话是「copy 键是啥呢」——问的是「键在哪」。
 *
 * 每项右侧标出快捷键：菜单是**发现入口**，快捷键是**加速器**（§1.5.2 第 1 条）——
 * 用户点一次菜单就顺带学会了键，下次不必再来。
 *
 * 层级：L3 收纳（§1.5.1，一次点击可达），不占任何常驻预算，不新增平铺按钮。
 */
export type NodeContextMenuAction = 'copy' | 'cut' | 'paste' | 'group' | 'delete'

type NodeContextMenuProps = {
  className?: string
  style?: React.CSSProperties
  /** 剪贴板为空 → 粘贴禁用并说明为什么（§1.6 C1：可点即有效，否则禁用+解释）。 */
  canPaste: boolean
  /** 少于两个选中项 → 建组禁用并说明为什么。 */
  canGroup: boolean
  onAction: (action: NodeContextMenuAction) => void
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void
}

export default function NodeContextMenu({
  className,
  style,
  canPaste,
  canGroup,
  onAction,
  onPointerDown,
  onContextMenu,
}: NodeContextMenuProps): JSX.Element {
  const { t } = useTranslation()
  const mod = platformModifier(navigator.platform)

  const items: {
    action: NodeContextMenuAction
    label: string
    shortcut: string
    icon: typeof IconCopy
    disabled?: boolean
    disabledReason?: string
    danger?: boolean
  }[] = [
    { action: 'copy', label: t('canvas.nodeMenuCopy'), shortcut: `${mod} C`, icon: IconCopy },
    { action: 'cut', label: t('canvas.nodeMenuCut'), shortcut: `${mod} X`, icon: IconCut },
    {
      action: 'paste',
      label: t('canvas.nodeMenuPaste'),
      shortcut: `${mod} V`,
      icon: IconClipboard,
      disabled: !canPaste,
      disabledReason: t('canvas.nodeMenuPasteEmpty'),
    },
    {
      action: 'group',
      label: t('canvas.nodeMenuGroup'),
      shortcut: `${mod} G`,
      icon: IconLayersSubtract,
      disabled: !canGroup,
      disabledReason: t('canvas.nodeMenuGroupNeedsTwo'),
    },
    { action: 'delete', label: t('canvas.nodeMenuDelete'), shortcut: 'Del', icon: IconTrash, danger: true },
  ]

  return (
    <div
      className={cn(
        'generation-canvas-v2-toolbar__node-menu',
        'absolute grid gap-0.5 w-[172px] p-[6px]',
        'border border-workbench-border rounded-nomi',
        'bg-nomi-paper shadow-workbench-pop',
        className,
      )}
      role="menu"
      aria-label={t('canvas.nodeMenu')}
      style={style}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
    >
      {items.map((item, index) => {
        const Icon = item.icon
        // 禁用的 <button> 自己不触发 title（浏览器行为）→ 外层包一层承载它（§1.6 C1）。
        return (
          <React.Fragment key={item.action}>
            {index === items.length - 2 ? (
              <div className={cn('h-px my-1 mx-2 bg-nomi-line')} aria-hidden="true" />
            ) : null}
            <span title={item.disabled ? item.disabledReason : undefined} className={cn('contents')}>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center justify-between gap-2',
                  'w-full h-8 min-h-8 px-2 border-0 rounded-nomi',
                  'bg-workbench-surface-solid font-[inherit] text-caption',
                  '[&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5',
                  '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.8]',
                  item.disabled
                    ? 'text-nomi-ink-40 cursor-not-allowed [&_svg]:text-nomi-ink-30'
                    : item.danger
                      ? 'text-workbench-danger cursor-pointer hover:bg-nomi-ink-05 [&_svg]:text-workbench-danger'
                      : 'text-workbench-ink cursor-pointer hover:bg-nomi-ink-05 [&_svg]:text-nomi-ink-60',
                )}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => onAction(item.action)}
              >
                <span>
                  <Icon />
                  {item.label}
                </span>
                <span className={cn('text-nomi-ink-40 tabular-nums')}>{item.shortcut}</span>
              </button>
            </span>
          </React.Fragment>
        )
      })}
    </div>
  )
}
