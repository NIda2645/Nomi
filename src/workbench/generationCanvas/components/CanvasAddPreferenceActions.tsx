import { useTranslation } from 'react-i18next'
import { useCanvasMenuPreferenceStore } from '../store/canvasMenuPreferenceStore'
import { DEFAULT_CANVAS_MENU_PREFERENCE_SETTINGS } from '../../../../electron/shared/contracts/canvasMenuPreference'
import { notify } from '../../../ui/notificationPolicy'
import { moveCanvasIntentUp, type CanvasAddIntentId } from './canvasToolbarModel'

export function CanvasAddPreferenceActions({ intentId, previousIntentId, onDone, onFeedback }: { intentId?: CanvasAddIntentId; previousIntentId?: CanvasAddIntentId; onDone?: () => void; onFeedback: (message: string) => void }): JSX.Element | null {
  const { t } = useTranslation()
  const preference = useCanvasMenuPreferenceStore((state) => state.preference)
  const save = useCanvasMenuPreferenceStore((state) => state.save)
  const apply = (value: typeof preference) => {
    onFeedback('')
    void save(value).then(() => { onFeedback(''); onDone?.() }).catch(() => notify({ identity: `canvas-menu:${intentId ?? 'reset'}`, reason: 'save-failed', message: t('canvas.menuPreference.saveFailed'), type: 'error', level: 'inline', present: onFeedback }))
  }
  const buttonClass = 'px-2 py-1 text-micro text-nomi-ink-60 rounded-nomi hover:bg-nomi-ink-05 disabled:opacity-40'
  if (!intentId) {
    if (!preference.hiddenIntentIds.length && !preference.orderedIntentIds.length) return null
    return <button type="button" role="menuitem" data-add-menu-reset className={buttonClass} onClick={() => apply(DEFAULT_CANVAS_MENU_PREFERENCE_SETTINGS)}>{t('canvas.menuPreference.reset')}</button>
  }
  const moved = previousIntentId ? moveCanvasIntentUp(preference, intentId, previousIntentId) : preference
  return <div className="flex items-center" onPointerDown={(event) => event.stopPropagation()}>
    <button type="button" role="menuitem" data-add-menu-hide className={buttonClass} onClick={() => apply({ ...preference, hiddenIntentIds: [...preference.hiddenIntentIds, intentId] })}>{t('canvas.menuPreference.hide')}</button>
    <button type="button" role="menuitem" data-add-menu-up className={buttonClass} disabled={moved === preference} onClick={() => apply(moved)}>{t('canvas.menuPreference.moveUp')}</button>
  </div>
}
