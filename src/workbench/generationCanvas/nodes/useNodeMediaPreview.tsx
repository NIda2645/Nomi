import React from 'react'
import { useTranslation } from 'react-i18next'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import NodeMediaPreviewDialog from './NodeMediaPreviewDialog'
import NodeResultDownloadButton from './NodeResultDownloadButton'

/** 图片工具条与视频结果浮条共用的预览状态/渲染出口。 */
export function useNodeMediaPreview(
  node: GenerationCanvasNode,
  resultActionsSelected: boolean,
  /** 打开生成记录——原先住卡片右上角常驻压在图上，2026-08-04 迁进浮条（§1.5 动作不许压在内容上）。 */
  onOpenProvenance: () => void,
  reportFeedback: (message: string) => void,
): {
  openMediaPreview: () => void
  mediaPreviewControls: JSX.Element
  /** 摊给媒体区的双击放大 props（只对图/视频生效；3D/全景有自己的交互，给了会打架）。 */
  mediaPreviewDoubleClick: { onDoubleClick?: (event: React.MouseEvent) => void }
} {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const openMediaPreview = React.useCallback(() => setOpen(true), [])
  const closeMediaPreview = React.useCallback(() => setOpen(false), [])
  const result = node.result
  // 双击画面 = 放大（2026-08-04）。卡片右上那颗常驻「放大」撤走后放大只剩浮条一个入口，
  // 补一条零成本手势兜住「我就想看大点」——手势不占视觉预算（§1.5：手势算加速器不算入口）。
  const canQuickPreview = Boolean(result?.url) && (result?.type === 'image' || result?.type === 'video')
  const mediaPreviewDoubleClick = React.useMemo(
    () =>
      canQuickPreview
        ? {
            onDoubleClick: (event: React.MouseEvent) => {
              event.stopPropagation()
              setOpen(true)
            },
          }
        : {},
    [canQuickPreview],
  )
  return {
    openMediaPreview,
    mediaPreviewDoubleClick,
    mediaPreviewControls: (
      <>
        <NodeResultDownloadButton reportFeedback={reportFeedback} node={node} selected={resultActionsSelected} onPreview={openMediaPreview} onOpenProvenance={onOpenProvenance} />
        {open && result?.url && (result.type === 'image' || result.type === 'video') ? (
          <NodeMediaPreviewDialog
            mediaType={result.type}
            url={result.url}
            title={
              node.title ||
              (result.type === 'video'
                ? t('generationCommon.imagePreview.video')
                : t('generationCommon.imagePreview.image'))
            }
            onClose={closeMediaPreview}
          />
        ) : null}
      </>
    ),
  }
}
