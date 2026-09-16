import React from 'react'

import { useOpenProjectId } from '../project/useOpenProjectId'
import { useProductionRunStore } from './productionRunStore'

const POLL_INTERVAL_MS = 1500

/**
 * options.enabled=false → 不加载也不轮询（任务中心关着时不该每 1.5s 拉一次全量 run）。
 * 徽标计数走 TaskCenterButton 自己的 summary 轮询，与这里无关。
 */
export function useActiveProductionRun(projectId?: string | null, options: { enabled?: boolean } = {}) {
  const openProjectId = useOpenProjectId()
  const enabled = options.enabled ?? true
  const state = useProductionRunStore()
  const resolvedProjectId = enabled ? (projectId ?? openProjectId) : null

  React.useEffect(() => {
    if (!resolvedProjectId) {
      useProductionRunStore.getState().reset()
      return
    }
    void useProductionRunStore.getState().load(resolvedProjectId)
    const interval = window.setInterval(() => void useProductionRunStore.getState().poll(), POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [resolvedProjectId])

  return state
}
