import { BrowserWindow, Notification } from 'electron'
import { logCrash } from './crashLog'
import { playAttentionSound } from './attentionSoundPlayer'
import { readAttentionSoundSettings } from './settings/attentionSoundSettings'
import { readAutomationPolicySettings } from './settings/automationPolicySettings'
import type { AttentionSoundEvent } from './shared/contracts/attentionSound'
import { isBackgroundWindowUnshown } from './backgroundIdleExit'

/** Both notification producers converge here; OS sound is always disabled. */
export function showDesktopNotification(input: {
  title: string; body: string; event: AttentionSoundEvent; onClick: () => void
}): { ok: boolean; reason?: string } {
  try {
    if (isBackgroundWindowUnshown()) return { ok: false, reason: 'background-unshown' }
    if (BrowserWindow.getAllWindows().some((win) => !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused())) {
      return { ok: false, reason: 'focused' }
    }
    const sound = readAttentionSoundSettings()
    if (sound.enabled && sound.events[input.event]) void playAttentionSound().catch(() => undefined)
    if (!readAutomationPolicySettings().systemNotifications) return { ok: true }
    if (!Notification.isSupported()) return { ok: false, reason: 'unsupported' }
    const notification = new Notification({ title: input.title, body: input.body, silent: true })
    notification.on('click', input.onClick)
    notification.on('failed', (_event, error) => logCrash('notification:failed', error))
    notification.show()
    return { ok: true }
  } catch { return { ok: false, reason: 'unavailable' } }
}
