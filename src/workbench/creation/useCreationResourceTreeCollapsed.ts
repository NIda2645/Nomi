import { useWorkbenchStore } from '../workbenchStore'
import { creationResourceTreeCollapsedFor } from './creationResourceTreeCollapse'

/**
 * 当前这一面上「创作内容」那列到底收没收起：用户偏好优先，没设过就按面给默认。
 * 单独成文件而不是挂在 `CreationResourceTreeToggle.tsx` 上：那个文件只导出组件，
 * 混进一个 hook 会破掉 react-refresh 的整文件热更新（lint 直接点名）。
 */
export function useCreationResourceTreeCollapsed(): boolean {
  const preference = useWorkbenchStore((state) => state.creationResourceTreeCollapsedPreference)
  const workspaceMode = useWorkbenchStore((state) => state.workspaceMode)
  return creationResourceTreeCollapsedFor(workspaceMode, preference)
}
