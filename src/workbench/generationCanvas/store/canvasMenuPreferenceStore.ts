import { declareStoreLifetime } from '../../project/storeLifetime'
import { create } from 'zustand'
import { getDesktopBridge } from '../../../desktop/bridge'
import { DEFAULT_CANVAS_MENU_PREFERENCE_SETTINGS, normalizeCanvasMenuPreferenceSettings, type CanvasMenuPreferenceSettings } from '../../../../electron/shared/contracts/canvasMenuPreference'

type PreferenceState = {
  preference: CanvasMenuPreferenceSettings
  load: () => Promise<void>
  save: (preference: CanvasMenuPreferenceSettings) => Promise<void>
}
let writes = Promise.resolve()
let revision = 0
export const useCanvasMenuPreferenceStore = create<PreferenceState>((set) => ({
  preference: DEFAULT_CANVAS_MENU_PREFERENCE_SETTINGS,
  load: async () => {
    const started = revision
    const bridge = getDesktopBridge()?.settings?.canvasMenuPreference
    if (!bridge) return
    const value = await bridge.get()
    if (started === revision) set({ preference: normalizeCanvasMenuPreferenceSettings(value) })
  },
  save: async (value) => {
    const preference = normalizeCanvasMenuPreferenceSettings(value)
    const current = ++revision
    const previous = useCanvasMenuPreferenceStore.getState().preference
    set({ preference })
    const write = writes.catch(() => {}).then(async () => {
      const bridge = getDesktopBridge()?.settings?.canvasMenuPreference
      if (bridge) await bridge.set(preference)
    })
    writes = write
    try { await write } catch (error) {
      if (current === revision) set({ preference: previous })
      throw error
    }
  },
}))

/**
 * C1 寿命声明：右键菜单的展示偏好是**这个窗口**里用户的手感，与打开哪个项目无关。
 * 切项目清掉它 = 每换一次项目就把用户刚调好的偏好还原一次。
 */
export const canvasMenuPreferenceStoreLifetime = declareStoreLifetime({
  store: 'useCanvasMenuPreferenceStore',
  fields: { preference: 'window' },
})
