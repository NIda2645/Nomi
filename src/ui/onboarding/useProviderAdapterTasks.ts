import React from 'react'
import type { DesktopProviderAdapterRun } from '../../desktop/bridge'
import { getDesktopBridge } from '../../desktop/bridge'
import { isAdapterRunTerminal } from './adapterVerificationViewModel'
import { mergeAdapterRuns, visibleAdapterRuns } from './adapterTaskVisibility'

export function useProviderAdapterTasks(): {
  runs: DesktopProviderAdapterRun[]
  visibleRuns: DesktopProviderAdapterRun[]
  recordRun: (run: DesktopProviderAdapterRun) => void
  cancelRun: (run: DesktopProviderAdapterRun) => Promise<void>
  retryRun: (run: DesktopProviderAdapterRun, modelKey?: string) => Promise<DesktopProviderAdapterRun>
} {
  const [runs, setRuns] = React.useState<DesktopProviderAdapterRun[]>([])

  const recordRun = React.useCallback((run: DesktopProviderAdapterRun) => {
    setRuns((current) => mergeAdapterRuns(current, [run]))
  }, [])

  const loadRuns = React.useCallback(async () => {
    const list = getDesktopBridge()?.onboarding?.adapterList
    if (!list) return
    // Active work must never disappear behind newer history. The store caps this
    // query at 200; visibleAdapterRuns applies the small limit only to terminal rows.
    const result = await list({ limit: 200 }).catch(() => null)
    if (result?.ok && result.runs) setRuns((current) => mergeAdapterRuns(current, result.runs ?? []))
  }, [])

  const hasActiveRun = runs.some((run) => !isAdapterRunTerminal(run.stage))
  React.useEffect(() => {
    void loadRuns()
    if (!hasActiveRun) return
    const timer = window.setInterval(() => { void loadRuns() }, 900)
    return () => window.clearInterval(timer)
  }, [hasActiveRun, loadRuns])

  const cancelRun = React.useCallback(async (run: DesktopProviderAdapterRun) => {
    const cancel = getDesktopBridge()?.onboarding?.adapterCancel
    if (!cancel || isAdapterRunTerminal(run.stage)) return
    const result = await cancel({ runId: run.id }).catch(() => null)
    if (result?.ok && result.run) recordRun(result.run)
  }, [recordRun])

  const retryRun = React.useCallback(async (run: DesktopProviderAdapterRun, modelKey?: string) => {
    const adapterRetry = getDesktopBridge()?.onboarding?.adapterRetry
    if (!adapterRetry) throw new Error('Adapter retry is unavailable')
    if (!isAdapterRunTerminal(run.stage)) throw new Error('An active adapter run cannot be retried')
    const result = await adapterRetry({ runId: run.id, ...(modelKey ? { modelKey } : {}) })
    if (!result.ok) throw new Error(result.error || 'Adapter retry failed')
    recordRun(result.run)
    return result.run
  }, [recordRun])

  return {
    runs,
    visibleRuns: visibleAdapterRuns(runs),
    recordRun,
    cancelRun,
    retryRun,
  }
}
