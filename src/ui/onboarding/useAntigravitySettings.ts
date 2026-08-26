import React from 'react'
import { getDesktopBridge } from '../../desktop/bridge'
import type { AntigravityTestRequest } from '../../../electron/shared/antigravity'
import { persistAntigravityModelEnabled } from './antigravityCardModel'
import { createAntigravityConnectionController, type AntigravityConnectionView } from './antigravityConnection'

/** The connection and its model dialog share one native request owner. */
export function useAntigravitySettings(active: boolean, onChanged: () => void, modelScope?: string) {
  const bridge = getDesktopBridge()
  const [view, setView] = React.useState<AntigravityConnectionView>({ status: null, busy: null })
  const [controller, setController] = React.useState<ReturnType<typeof createAntigravityConnectionController> | null>(null)
  const changed = React.useRef(onChanged)
  changed.current = onChanged
  const catalog = bridge?.modelCatalog
  const onboarding = bridge?.onboarding
  React.useEffect(() => {
    if (!active || !catalog) return
    let alive = true
    const owner = createAntigravityConnectionController({
      bridge: onboarding, onState: setView,
      saveEnabled: (enabled, request) => persistAntigravityModelEnabled(catalog, enabled, request),
      onChanged: () => changed.current(),
    })
    setController(owner)
    void owner.check().then(() => { if (alive) changed.current() })
    return () => { alive = false; owner.dispose(); setController(null) }
  }, [active, catalog, onboarding])
  React.useEffect(() => () => {
    if (modelScope && controller?.getState().busy === 'testing') void controller.cancel().then(() => changed.current())
  }, [controller, modelScope])
  const perform = async (action: 'check' | 'test' | 'cancel', request?: AntigravityTestRequest) => {
    if (!controller) return
    if (action === 'test') await controller.test(request)
    else await controller[action]()
    changed.current()
  }
  return { view, controller, perform }
}

export type AntigravitySettingsSession = ReturnType<typeof useAntigravitySettings>
