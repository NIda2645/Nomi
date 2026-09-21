import type { CanvasGestureScheme } from '../../../utils/canvasGesturePreference'
import { platformAltKey, platformModifier } from '../../../design/platformShortcut'

export type CanvasControlsHelpSectionId = 'selection' | 'pan' | 'zoom' | 'node'

export type CanvasControlsHelpRow = {
  shortcutKey: string
  actionKey: string
  shortcutValues?: { mod: '⌘' | 'Ctrl'; alt: '⌥ Option' | 'Alt' }
}

export type CanvasControlsHelpSection = {
  id: CanvasControlsHelpSectionId
  rows: CanvasControlsHelpRow[]
}

export function canvasControlsHelpSections(
  scheme: CanvasGestureScheme,
  platform: string,
): CanvasControlsHelpSection[] {
  const shortcutValues = { mod: platformModifier(platform), alt: platformAltKey(platform) }
  // 平移排第一行：它是默认手势（空白左键拖），其余三个是「压在节点上也要平移」的补充入口。
  const panRows: CanvasControlsHelpRow[] = [
    { shortcutKey: 'blankDrag', actionKey: 'pan' },
    { shortcutKey: 'spaceDrag', actionKey: 'pan' },
    { shortcutKey: 'middleOrRightDrag', actionKey: 'pan' },
  ]
  if (scheme === 'modifier-zoom') {
    panRows.push({ shortcutKey: 'wheelOrTwoFinger', actionKey: 'pan' })
  }

  return [
    {
      id: 'selection',
      rows: [
        { shortcutKey: 'shiftDrag', actionKey: 'boxSelect' },
        { shortcutKey: 'shiftClick', actionKey: 'toggleSelection' },
        { shortcutKey: 'blankClick', actionKey: 'clearSelection' },
      ],
    },
    { id: 'pan', rows: panRows },
    {
      id: 'zoom',
      rows: scheme === 'wheel-zoom'
        ? [
            { shortcutKey: 'wheel', actionKey: 'zoom' },
            { shortcutKey: 'pinch', actionKey: 'zoom' },
          ]
        : [
            { shortcutKey: 'modWheel', actionKey: 'zoom', shortcutValues },
            { shortcutKey: 'pinch', actionKey: 'zoom' },
          ],
    },
    {
      id: 'node',
      rows: [
        { shortcutKey: 'modA', actionKey: 'selectAll', shortcutValues },
        { shortcutKey: 'modCopyPaste', actionKey: 'copyPaste', shortcutValues },
        // 松手处即副本落点——节点、框、结果堆叠里的单个版本都一样（LibTV「Option + 拖动节点」同款）。
        { shortcutKey: 'altDrag', actionKey: 'duplicateDrag', shortcutValues },
        { shortcutKey: 'delete', actionKey: 'deleteSelection' },
        { shortcutKey: 'escape', actionKey: 'cancel' },
      ],
    },
  ]
}
