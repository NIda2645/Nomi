import type { AntigravityCheck, AntigravityTestRequest } from '../../../electron/shared/antigravity'
import type { AntigravityConnectionStatus, DesktopOnboardingBridge } from '../../desktop/onboardingBridgeTypes'

type ConnectionBridge = Pick<DesktopOnboardingBridge, 'antigravityStatus' | 'antigravityTest' | 'antigravityCancel'>
const defaultRequest: AntigravityTestRequest = { capability: 'text', modelId: 'auto' }
export type AntigravityConnectionView = {
  status: AntigravityConnectionStatus | null
  busy: 'checking' | 'testing' | 'cancelling' | null
  request?: AntigravityTestRequest
  issue?: 'unavailable' | 'requestFailed' | 'cancelled' | 'alreadyFinished' | 'cancelFailed' | 'saveFailed'
}

export function antigravityCheckFor(status: AntigravityConnectionStatus | null, request: AntigravityTestRequest): AntigravityCheck | undefined {
  return status?.checks?.find((check) => check.modelId === request.modelId && check.capability === request.capability && check.version === status.version)
}

/** Mirrors the main-process freshness rule for guidance; the backend remains authoritative. */
export function canEnableAntigravityRequest(status: AntigravityConnectionStatus | null, request: AntigravityTestRequest, now = Date.now()): boolean {
  const check = antigravityCheckFor(status, request)
  return check?.state === 'passed' && check.checkedAt <= now && now - check.checkedAt < 10 * 60_000
}

/** Owns one card's requests; only an authoritative cancellation result can resolve a completion race. */
export function createAntigravityConnectionController({ bridge, onState, saveEnabled, onChanged }: {
  bridge: ConnectionBridge | undefined
  onState: (state: AntigravityConnectionView) => void
  saveEnabled: (enabled: boolean, request: AntigravityTestRequest) => void
  onChanged: () => void
}) {
  let alive = true
  let generation = 0
  let view: AntigravityConnectionView = { status: null, busy: null }
  const update = (next: AntigravityConnectionView) => {
    if (!alive) return
    view = next
    onState(view)
  }
  const run = async (kind: 'checking' | 'testing', request = defaultRequest) => {
    if (!alive || view.busy) return
    if (!bridge?.antigravityStatus || !bridge?.antigravityTest || !bridge?.antigravityCancel) {
      update({ status: null, busy: null, issue: 'unavailable' })
      return
    }
    const current = ++generation
    // A re-test invalidates only its own previous proof, including on cancellation/IPC failure.
    const status = kind === 'testing' && view.status ? {
      ...view.status,
      checks: view.status.checks?.filter((check) => check.capability !== request.capability || check.modelId !== request.modelId),
    } : view.status
    update({ status, busy: kind, ...(kind === 'testing' ? { request } : {}) })
    try {
      const next = await (kind === 'checking' ? bridge.antigravityStatus() : bridge.antigravityTest(request))
      if (alive && generation === current) update({ status: next, busy: null })
    } catch {
      if (alive && generation === current) update({ status: kind === 'checking' ? null : status, busy: null, issue: 'requestFailed' })
    }
  }
  const cancel = async () => {
    if (!alive || view.busy === 'cancelling') return
    const testing = view.busy === 'testing'
    const current = ++generation
    const status = view.status
    update({ status, busy: testing ? 'cancelling' : null, ...(testing ? {} : { issue: 'cancelled' }) })
    if (!testing) return
    try {
      const finalStatus = await bridge?.antigravityCancel()
      if (alive && generation === current) update({ status: finalStatus ?? status, busy: null,
        issue: finalStatus && finalStatus.code !== 'ANTIGRAVITY_CANCELLED' ? 'alreadyFinished' : 'cancelled' })
    } catch {
      if (alive && generation === current) update({ status, busy: null, issue: 'cancelFailed' })
    }
  }
  return {
    getState: () => view,
    check: () => run('checking'),
    test: (request = defaultRequest) => run('testing', request),
    cancel,
    setEnabled(enabled: boolean, request = defaultRequest): boolean {
      if (!alive || (enabled && (view.busy || !canEnableAntigravityRequest(view.status, request)))) return false
      if (!enabled && view.busy === 'testing') void cancel()
      try {
        saveEnabled(enabled, request)
        onChanged()
        return true
      } catch {
        update({ ...view, issue: 'saveFailed' })
        return false
      }
    },
    dispose() {
      if (!alive) return
      alive = false
      generation += 1
      if (view.busy === 'testing') void bridge?.antigravityCancel().catch(() => {})
    },
  }
}
