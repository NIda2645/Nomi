import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconBrush, IconCheck, IconCrop, IconDownload, IconFlipHorizontal, IconFlipVertical, IconGrid3x3, IconLayoutGrid, IconMaximize, IconRotate2, IconRotateClockwise2, IconScissors, IconSparkles, IconTransform, IconCut } from '@tabler/icons-react'
import { type ImageGridSize, type ImageTransformOp } from './useNodeImageEditing'
import type { CropGridSize } from './render/ImageCropGridOverlay'
import { useResultDownload } from './useResultDownload'
import { FloatingToolbarShell, TOOLBAR_ICON as I, ToolbarButton, ToolbarDivider, ToolbarDuplicateVariantButton, ToolbarIconButton, ToolbarMenu, ToolbarProvenanceButton, ToolbarReshootButton } from './NodeFloatingToolbar'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import WhiteboardModal from './whiteboard/WhiteboardModal'
import { inferWhiteboardAspectRatio, readWhiteboardState } from './whiteboard/whiteboardState'
import { NomiLoadingMark } from '../../../design'

// 图片节点编辑浮条（按「创作优先级」排左→右，用户拍板）：
//   左·创作：定妆（仅锚卡）｜ 中·改这张：抠图 · 裁切▾（裁剪/四视图/九宫格）· 变换▾ ｜ 交接：画板 ｜ 右·工具：全屏 · 下载。
// 全屏是「看」的工具，不占最左创作主位——与下载同归右侧工具区（此前全屏在最左，抢了 accent 主动作定妆的位）。
// 低频的裁切(3)/变换(4)收进两个下拉，常用动作外露 1 次点击直达。容器/按钮/图标全走 NodeFloatingToolbar
// 共享组件（token 合规，§2/§6）。图片类与素材类节点共用此条。

type Props = {
  reportFeedback: (message: string) => void
  node: GenerationCanvasNode
  /** 当前打开的可调框：null=未开，1=裁剪，2/3=切图。开着或忙时禁用编辑入口。 */
  editGrid: CropGridSize | null
  imageOpBusy: boolean
  onGridSplit: (gridSize: ImageGridSize) => void
  onCrop: () => void
  onTransform: (op: ImageTransformOp) => void
  onRemoveBackground?: () => void
  removeBackgroundBusy?: boolean
  /** 打开共享图片全屏预览。 */
  onPreview: () => void
  /** 打开生成记录（原先住卡片右上角，常驻压在图上；2026-08-04 迁来这条浮条）。 */
  onOpenProvenance: () => void
  /** 这张卡本身是不是「视觉锚」（角色/场景/道具参考卡）。是 → 最左出「定妆」。 */
  isAnchor?: boolean
  /** 该锚是否已定妆（形象已确认）。isAnchor 时驱动「定妆 / 已定妆✓」两态。 */
  frozen?: boolean
  /** 定妆开关（写/删 meta.frozen）。isAnchor 时点最左动作触发。 */
  onToggleFreeze?: () => void
}

export default function NodeImageEditToolbar({ reportFeedback, node, editGrid, imageOpBusy, onGridSplit, onCrop, onTransform, onRemoveBackground, removeBackgroundBusy = false, onPreview, onOpenProvenance, isAnchor = false, frozen = false, onToggleFreeze }: Props): JSX.Element {

  const { t } = useTranslation()
  const { downloading, download } = useResultDownload(node, reportFeedback)
  const [whiteboardOpen, setWhiteboardOpen] = React.useState(false)
  const imageUrl = node.result?.type === 'image' ? node.result.url || '' : ''
  const busy = editGrid !== null || imageOpBusy || removeBackgroundBusy
  return (
    <>

      <FloatingToolbarShell ariaLabel={t('generationCommon.imageToolbar.aria')} lockNodeId={node.id}>
        {/* 锚卡（角色/场景/道具参考卡）：最左是「定妆」= 确认形象、放行下游镜头（F15 装上的操作者）。 */}
        {isAnchor && onToggleFreeze ? (
          <ToolbarButton
            icon={frozen ? <IconCheck size={I.size} stroke={I.stroke} /> : <IconSparkles size={I.size} stroke={I.stroke} />}
            label={frozen ? t('generationCommon.imageToolbar.frozen') : t('generationCommon.imageToolbar.freeze')}
            accent={!frozen}
            title={frozen ? t('generationCommon.imageToolbar.frozenHint') : t('generationCommon.imageToolbar.freezeHint')}
            onClick={onToggleFreeze}
          />
        ) : null}
        {isAnchor && onToggleFreeze ? <ToolbarDivider /> : null}
        <ToolbarDuplicateVariantButton nodeId={node.id} />
        <ToolbarReshootButton nodeId={node.id} />
        {onRemoveBackground ? (
          <ToolbarButton
            icon={removeBackgroundBusy ? <NomiLoadingMark size={I.size} /> : <IconScissors size={I.size} stroke={I.stroke} />}
            label={removeBackgroundBusy ? t('generationCommon.imageToolbar.removingBackground') : t('generationCommon.imageToolbar.removeBackground')}
            title={t('generationCommon.imageToolbar.removeBackgroundHint')}
            disabled={busy}
            ariaBusy={removeBackgroundBusy}
            onClick={onRemoveBackground}
          />
        ) : null}
        <ToolbarMenu
          icon={<IconCrop size={I.size} stroke={I.stroke} />}
          label={t('generationCommon.imageToolbar.cropSplit')}
          disabled={busy}
          items={[
            { icon: <IconCut size={I.size} stroke={I.stroke} />, label: t('generationCommon.imageToolbar.crop'), title: t('generationCommon.imageToolbar.cropHint'), onClick: onCrop },
            { icon: <IconLayoutGrid size={I.size} stroke={I.stroke} />, label: t('generationCommon.imageToolbar.fourView'), onClick: () => onGridSplit(2) },
            { icon: <IconGrid3x3 size={I.size} stroke={I.stroke} />, label: t('generationCommon.imageToolbar.gridNine'), onClick: () => onGridSplit(3) },
          ]}
        />
        <ToolbarMenu
          icon={<IconTransform size={I.size} stroke={I.stroke} />}
          label={t('generationCommon.imageToolbar.transform')}
          disabled={busy}
          items={([
            { op: 'rotate-left' as const, icon: <IconRotate2 size={I.size} stroke={I.stroke} /> },
            { op: 'rotate-right' as const, icon: <IconRotateClockwise2 size={I.size} stroke={I.stroke} /> },
            { op: 'flip-h' as const, icon: <IconFlipHorizontal size={I.size} stroke={I.stroke} /> },
            { op: 'flip-v' as const, icon: <IconFlipVertical size={I.size} stroke={I.stroke} /> },
          ]).map(({ op, icon }) => ({
            icon,
            label: t(`generationCommon.imageToolbar.${op === 'rotate-left' ? 'rotateLeft' : op === 'rotate-right' ? 'rotateRight' : op === 'flip-h' ? 'flipHorizontal' : 'flipVertical'}` as 'generationCommon.imageToolbar.rotateLeft'),
            onClick: () => onTransform(op),
          }))}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={<IconBrush size={I.size} stroke={I.stroke} />}
          label={t('generationCommon.imageToolbar.whiteboard')}
          title={t('generationCommon.imageToolbar.whiteboardHint')}
          disabled={busy || !imageUrl}
          onClick={() => setWhiteboardOpen(true)}
        />
        <ToolbarDivider />
        <ToolbarIconButton
          icon={<IconMaximize size={I.size} stroke={I.stroke} />}
          title={t('generationCommon.imageToolbar.fullscreen')}
          ariaLabel={t('generationCommon.imageToolbar.fullscreenAria')}
          disabled={!imageUrl}
          onClick={onPreview}
        />
        <ToolbarButton
          icon={<IconDownload size={I.size} stroke={I.stroke} />}
          label={t('generationCommon.imageToolbar.download')}
          title={t('generationCommon.imageToolbar.downloadHint')}
          disabled={downloading}
          onClick={download}
        />
        <ToolbarProvenanceButton onOpen={onOpenProvenance} />
      </FloatingToolbarShell>
      {whiteboardOpen && imageUrl ? (
        <WhiteboardModal
          nodeId={node.id}
          sourceKind="image"
          nodeTitle={`${node.title || t('generationCommon.imageToolbar.image')} · ${t('generationCommon.imageToolbar.whiteboard')}`}
          initialState={readWhiteboardState(node)}
          initialImage={{ url: imageUrl, aspectRatio: inferWhiteboardAspectRatio(node.meta?.imageWidth, node.meta?.imageHeight) }}
          onClose={() => setWhiteboardOpen(false)}
        />
      ) : null}
    </>
  )
}
