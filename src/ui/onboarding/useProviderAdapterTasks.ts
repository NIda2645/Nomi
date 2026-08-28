import React from 'react'
import type { DesktopHttpCertificationRun } from '../../desktop/onboardingBridgeTypes'
import { getDesktopBridge } from '../../desktop/bridge'
import { isAdapterRunTerminal } from './adapterVerificationViewModel'
import { mergeAdapterRuns, visibleAdapterRuns } from './adapterTaskVisibility'

export function useProviderAdapterTasks(): {
  runs: DesktopHttpCertificationRun[]
  visibleRuns: DesktopHttpCertificationRun[]
  recordRun: (run: DesktopHttpCertificationRun) => void
  cancelRun: (run: DesktopHttpCertificationRun) => Promise<void>
  retryRun: (run: DesktopHttpCertificationRun, modelKey?: string) => Promise<DesktopHttpCertificationRun>
} {
  const [runs, setRuns] = React.useState<DesktopHttpCertificationRun[]>([])

  const recordRun = React.useCallback((run: DesktopHttpCertificationRun) => {
    setRuns((current) => mergeAdapterRuns(current, [run]))
  }, [])

  const loadRuns = React.useCallback(async () => {
    const list = getDesktopBridge()?.onboarding?.certificationList
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

  const cancelRun = React.useCallback(async (run: DesktopHttpCertificationRun) => {
    const cancel = getDesktopBridge()?.onboarding?.certificationCancel
    if (!cancel || isAdapterRunTerminal(run.stage)) return
    const result = await cancel({ runId: run.id }).catch(() => null)
    if (result?.ok && result.run) recordRun(result.run)
  }, [recordRun])

  const retryRun = React.useCallback(async (run: DesktopHttpCertificationRun, modelKey?: string) => {
    const retryCertification = getDesktopBridge()?.onboarding?.httpCertificationRetry
    if (!retryCertification) throw new Error('Adapter retry is unavailable')
    if (!isAdapterRunTerminal(run.stage)) throw new Error('An active adapter run cannot be retried')
    const result = await retryCertification({
      runId: run.id,
      ...(modelKey ? { modelKey } : {}),
      idempotencyKey: crypto.randomUUID(),
    })
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
