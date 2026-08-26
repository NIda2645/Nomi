import type { AntigravityConnectionStatus, DesktopOnboardingBridge } from '../../desktop/onboardingBridgeTypes'

type ConnectionBridge = Pick<DesktopOnboardingBridge, 'antigravityStatus' | 'antigravityTest' | 'antigravityCancel'>
export type AntigravityConnectionView = {
  status: AntigravityConnectionStatus | null
  busy: 'checking' | 'testing' | 'cancelling' | null
  issue?: 'unavailable' | 'requestFailed' | 'cancelled' | 'cancelFailed' | 'saveFailed'
}

/** Owns one card's requests; late IPC replies cannot restore success after cancellation or disposal. */
export function createAntigravityConnectionController({ bridge, onState, saveEnabled, onChanged }: {
  bridge: ConnectionBridge | undefined
  onState: (state: AntigravityConnectionView) => void
  saveEnabled: (enabled: boolean) => void
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
  const run = async (kind: 'checking' | 'testing') => {
    if (!alive || view.busy) return
    if (!bridge?.antigravityStatus || !bridge?.antigravityTest || !bridge?.antigravityCancel) {
      update({ status: null, busy: null, issue: 'unavailable' })
      return
    }
    const current = ++generation
    update({ status: null, busy: kind })
    try {
      const status = await (kind === 'checking' ? bridge.antigravityStatus() : bridge.antigravityTest())
      if (alive && generation === current) update({ status, busy: null })
    } catch {
      if (alive && generation === current) update({ status: null, busy: null, issue: 'requestFailed' })
    }
  }
  const cancel = async () => {
    if (!alive || view.busy === 'cancelling') return
    const testing = view.busy === 'testing'
    const current = ++generation
    update({ status: null, busy: testing ? 'cancelling' : null, issue: 'cancelled' })
    if (!testing) return
    try {
      await bridge?.antigravityCancel()
      if (alive && generation === current) update({ status: null, busy: null, issue: 'cancelled' })
    } catch {
      if (alive && generation === current) update({ status: null, busy: null, issue: 'cancelFailed' })
    }
  }
  return {
    getState: () => view,
    check: () => run('checking'),
    test: () => run('testing'),
    cancel,
    setEnabled(enabled: boolean): boolean {
      if (!alive || (enabled && (view.busy || view.status?.state !== 'ready'))) return false
      if (!enabled) void cancel()
      try {
        saveEnabled(enabled)
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
