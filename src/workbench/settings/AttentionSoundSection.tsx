import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'
import { DesignButton, DesignSwitch, DesignCheckbox } from '../../design'
import { getDesktopBridge } from '../../desktop/bridge'
import { ATTENTION_SOUND_LIMITS, type AttentionSoundSettings } from '../../../electron/shared/contracts/attentionSound'

function SoundCover(): JSX.Element {
  return <svg viewBox="0 0 128 144" aria-hidden="true" className="h-32 w-28 shrink-0 text-nomi-ink">
    <path d="M22 60h84v61H22z" fill="var(--nomi-paper)" stroke="currentColor" strokeWidth="1.5" />
    <path d="M30 72v-5h12m44 0h12v5M30 109v5h12m44 0h12v-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="m40 97 18-19 13 13 11-10 13 22H40z" fill="var(--nomi-accent)" />
    <circle cx="64" cy="43" r="5" fill="var(--nomi-accent)" />
    <path d="M55 33q9-8 18 0M48 25q16-14 32 0M41 17q23-19 46 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M17 128h94" stroke="currentColor" strokeWidth="1" opacity=".25" />
  </svg>
}

export function AttentionSoundSection(): JSX.Element {
  const { t } = useTranslation()
  const api = getDesktopBridge()?.settings?.attentionSound
  const [settings, setSettings] = React.useState<AttentionSoundSettings | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [playing, setPlaying] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mounted = React.useRef(true)
  React.useEffect(() => {
    mounted.current = true
    if (api) void api.get().then((value) => { if (mounted.current) setSettings(value) }).catch(() => setError('saveError'))
    return () => { mounted.current = false; clearTimeout(timer.current); void api?.stop().catch(() => undefined) }
  }, [api])
  const perform = async (operation: () => Promise<AttentionSoundSettings>): Promise<void> => {
    setBusy(true); setError(null)
    try { const value = await operation(); if (mounted.current) setSettings(value) }
    catch { if (mounted.current) setError('saveError') }
    finally { if (mounted.current) setBusy(false) }
  }
  const stop = async (): Promise<void> => {
    clearTimeout(timer.current); setPlaying(false)
    await api?.stop().catch(() => undefined)
  }
  const preview = async (): Promise<void> => {
    if (!api) return
    if (playing) { await stop(); return }
    setError(null); setPlaying(true)
    try {
      const result = await api.preview()
      if (!mounted.current) { await api.stop(); return }
      if (!result.ok) { setPlaying(false); setError('previewError'); return }
      timer.current = setTimeout(() => { setPlaying(false) }, ATTENTION_SOUND_LIMITS.previewMs)
    } catch { setPlaying(false); setError('previewError') }
  }
  const pick = async (): Promise<void> => {
    if (!api) return
    await stop(); setBusy(true); setError(null)
    try {
      const result = await api.pick()
      if (result.ok) setSettings(result.settings)
      else if (result.reason !== 'canceled') setError(result.reason === 'invalid' ? 'invalid' : 'saveError')
    } catch { setError('saveError') }
    finally { setBusy(false) }
  }
  const unavailable = !api || !settings
  return <section data-settings-section="attention-sound" data-sound-state={playing ? 'playing' : settings?.custom ? 'custom' : settings?.enabled ? 'on' : 'off'} className="mt-5 border-t border-nomi-line pt-4">
    <h3 className="mb-3 text-body-sm font-medium text-nomi-ink">{t('settings.sound.title')}</h3>
    <div className="flex items-center gap-3 overflow-hidden rounded-nomi-lg border border-nomi-line bg-nomi-ink-05 px-3 py-3">
      <SoundCover />
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-nomi-ink">{t('settings.sound.brand')}</div>
        <p className="mb-3 mt-1 text-caption leading-relaxed text-nomi-ink-60">{t('settings.sound.description')}</p>
        {settings?.custom ? <div className="mb-2 truncate text-caption text-nomi-ink-60" title={settings.custom.name}>{settings.custom.name} · {t('settings.sound.duration', { seconds: settings.custom.durationSeconds.toFixed(1) })}</div> : null}
        <DesignButton variant="default" disabled={unavailable || busy} title={unavailable ? t('settings.sound.unavailable') : undefined} onClick={() => { void preview() }}
          leftSection={playing ? <IconPlayerStop size={14} stroke={1.5} /> : <IconPlayerPlay size={14} stroke={1.5} />}>
          {t(playing ? 'settings.sound.stop' : 'settings.sound.preview')}
        </DesignButton>
      </div>
    </div>
    <div className="flex min-h-14 items-center justify-between gap-3 py-3" title={unavailable ? t('settings.sound.unavailable') : undefined}>
      <span className="text-body-sm text-nomi-ink">{t('settings.sound.enabled')}</span>
      <DesignSwitch aria-label={t('settings.sound.enabled')} checked={settings?.enabled ?? false} disabled={unavailable || busy}
        onChange={(event) => { const enabled = event.currentTarget.checked; void stop(); void perform(() => api!.set({ ...settings, enabled })) }} />
    </div>
    <fieldset disabled={unavailable || busy || !settings?.enabled} title={!settings?.enabled ? t('settings.sound.enableFirst') : undefined} className="m-0 grid min-w-0 gap-2.5 border-0 p-0 pb-4 disabled:opacity-40">
      <legend className="mb-2 text-caption text-nomi-ink-60">{t('settings.sound.events')}</legend>
      {(['decision', 'completed', 'slow'] as const).map((event) => <DesignCheckbox key={event}
        label={event === 'decision' ? t('settings.sound.decision') : event === 'completed' ? t('settings.sound.completed') : t('settings.sound.slow')} checked={settings?.events[event] ?? false}
        onChange={(input) => { const checked = input.currentTarget.checked; void perform(() => api!.set({ ...settings, events: { ...settings!.events, [event]: checked } })) }} />)}
    </fieldset>
    <div className="border-t border-nomi-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-sm text-nomi-ink">{t('settings.sound.custom')}</span>
        <div className="flex gap-1" title={unavailable ? t('settings.sound.unavailable') : undefined}>
          <DesignButton variant="default" disabled={unavailable || busy} onClick={() => { void pick() }}>{t('settings.sound.replace')}</DesignButton>
          {settings?.custom ? <DesignButton variant="subtle" disabled={busy} onClick={() => { void stop(); void perform(() => api!.reset()) }}>{t('settings.sound.reset')}</DesignButton> : null}
        </div>
      </div>
      <p className="mt-2 text-micro text-nomi-ink-40">{t('settings.sound.formats')}</p>
    </div>
    {error ? <p role="alert" className="mt-2 text-caption text-nomi-danger">{error === 'invalid' ? t('settings.sound.invalid') : error === 'previewError' ? t('settings.sound.previewError') : t('settings.sound.saveError')}</p> : null}
  </section>
}
