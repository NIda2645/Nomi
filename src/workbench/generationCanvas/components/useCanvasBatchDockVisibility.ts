import React from 'react'
import { canvasBatchDockScopeKey, shouldShowCanvasBatchGenerateDock } from './canvasProductionScope'

export function useCanvasBatchDockVisibility(params: {
  readOnly: boolean
  selectedCount: number
  eligibleIds: readonly string[]
}) {
  const scopeKey = React.useMemo(() => canvasBatchDockScopeKey(params.eligibleIds), [params.eligibleIds])
  const [dismissedScopeKey, setDismissedScopeKey] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (params.eligibleIds.length === 0) setDismissedScopeKey(null)
  }, [params.eligibleIds.length])

  const dismiss = React.useCallback(() => setDismissedScopeKey(scopeKey), [scopeKey])
  const visible = shouldShowCanvasBatchGenerateDock({
    readOnly: params.readOnly,
    selectedCount: params.selectedCount,
    eligibleCount: params.eligibleIds.length,
    eligibleScopeKey: scopeKey,
    dismissedScopeKey,
  })

  return { visible, dismiss }
}
