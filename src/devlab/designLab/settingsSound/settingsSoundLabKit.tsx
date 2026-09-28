import React from 'react'
import { AttentionSoundSection } from '../../../workbench/settings/AttentionSoundSection'
import { normalizeAttentionSound, type AttentionSoundBridge } from '../../../../electron/shared/contracts/attentionSound'

export function SoundStage({ state }: { state: 'on' | 'off' | 'custom' | 'playing' }): JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useMemo(() => {
    let settings = normalizeAttentionSound({ enabled: state !== 'off', custom: state === 'custom' ? { name: '雨落木窗.wav', durationSeconds: 3.4 } : null })
    const api: AttentionSoundBridge = {
      get: async () => settings,
      set: async (value) => { settings = normalizeAttentionSound(value); return settings },
      pick: async () => ({ ok: false, reason: 'canceled' }),
      reset: async () => { settings = { ...settings, custom: null }; return settings },
      preview: () => state === 'playing' ? new Promise(() => {}) : Promise.resolve({ ok: true }),
      stop: async () => {},
    }
    ;(window as unknown as { nomiDesktop: unknown }).nomiDesktop = { settings: { attentionSound: api } }
  }, [state])
  React.useEffect(() => {
    if (state !== 'playing') return
    const root = ref.current!
    const start = (): void => {
      const button = root.querySelector<HTMLButtonElement>('button')
      if (button && !button.disabled) { observer.disconnect(); button.click() }
    }
    const observer = new MutationObserver(start)
    observer.observe(root, { subtree: true, attributes: true, childList: true })
    start()
    return () => observer.disconnect()
  }, [state])
  return <div ref={ref} data-design-lab-stage="settings-sound" className="w-[564px] rounded-nomi border border-nomi-line bg-nomi-paper p-6"><AttentionSoundSection /></div>
}
