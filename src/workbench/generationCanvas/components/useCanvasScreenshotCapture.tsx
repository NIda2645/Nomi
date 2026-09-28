/**
 * 全局截图（默认关，设置里开）在画布这一侧的接线：
 * 热键抓完整屏 → 主进程落素材 → 这里收到事件、弹选区面板 → 框完落节点（见 ScreenshotCropOverlay）。
 *
 * 三条消息都要接：抓到了 / 没权限 / 抓失败。**「按了没反应」是最糟的形态**，
 * 尤其未授权那条——macOS 的屏幕录制权限没法程序化申请，不说用户根本不知道要去哪开。
 *
 * 项目身份不由这里上报：主进程在抓屏前固定它已提交的项目面，事件带回那份绑定；
 * 这里只在它仍是当前项目面时接手，并把原项目的交互生命周期交给面板——换项目即关面板、不落节点。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { notify } from '../../../ui/notificationPolicy'
import { getDesktopBridge } from '../../../desktop/bridge'
import { withMainProjectAction, type ProjectExecutionContext } from '../../project/projectCanvasReadSurface'
import { ScreenshotCropOverlay } from './ScreenshotCropOverlay'

export type ScreenshotCapture = { url: string; width: number; height: number }
type ScreenshotSession = Readonly<{ capture: ScreenshotCapture; project: ProjectExecutionContext }>

/**
 * 订阅 + 挂载一起给（同 useNodeMediaPreview 的写法）：调用方只要把 `screenshotOverlay` 塞进 JSX 就行，
 * 不必再各自管一份 state 和条件渲染 —— GenerationCanvas.tsx 常年顶着 800 行上限，能少一行是一行。
 */
export function useCanvasScreenshotCapture(params: {
  readOnly: boolean
  getInsertPosition: () => { x: number; y: number }
  categoryId?: string
}): { screenshotOverlay: JSX.Element | null } {
  const { t } = useTranslation()
  const [screenshot, setScreenshot] = React.useState<ScreenshotSession | null>(null)

  React.useEffect(() => {
    const bridge = getDesktopBridge()?.screenshot
    if (!bridge) return undefined
    const offCaptured = bridge.onCaptured?.((payload) => {
      if (!payload?.url) return
      // 抓屏期间换了项目（含 A→B→A）：这张图属于原项目，不在新项目里弹面板——不签发即取消。
      withMainProjectAction(payload.surfaceBinding, (project) => {
        setScreenshot({ capture: { url: payload.url, width: payload.width, height: payload.height }, project })
      })
    })
    const offDenied = bridge.onDenied?.(() => {
      notify({ identity: 'global-screenshot', reason: 'permission', level: 'background', type: 'error', message: t('generationCommon.screenshot.denied'), actionLabel: t('settings.tab.general'), onAction: () => { window.dispatchEvent(new CustomEvent('nomi-open-settings', { detail: { tab: 'general' } })) } })
    })
    const offFailed = bridge.onFailed?.((payload) => {
      notify({
        identity: 'global-screenshot', reason: payload?.reason ?? 'capture', level: 'background', type: 'error',
        message: payload?.reason === 'no-project' ? t('generationCommon.screenshot.noProject') : t('generationCommon.screenshot.failed'),
        actionLabel: t('settings.tab.general'),
        onAction: () => { window.dispatchEvent(new CustomEvent('nomi-open-settings', { detail: { tab: 'general' } })) },
      })
    })
    return () => { offCaptured?.(); offDenied?.(); offFailed?.() }
  }, [t])

  React.useEffect(() => {
    if (!screenshot) return undefined
    const close = () => setScreenshot((current) => (current === screenshot ? null : current))
    if (screenshot.project.signal.aborted) { close(); return undefined }
    screenshot.project.signal.addEventListener('abort', close, { once: true })
    return () => screenshot.project.signal.removeEventListener('abort', close)
  }, [screenshot])

  const clearScreenshot = React.useCallback(() => setScreenshot(null), [])
  const screenshotOverlay = screenshot && !params.readOnly ? (
    <ScreenshotCropOverlay
      capture={screenshot.capture}
      project={screenshot.project}
      basePosition={params.getInsertPosition()}
      categoryId={params.categoryId}
      onClose={clearScreenshot}
    />
  ) : null
  return { screenshotOverlay }
}
