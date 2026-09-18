import { app, ipcMain } from "electron";
import { writePersistedLocale } from './settings/localePreference'
import { getSettingsRoot } from './settings/settingsRoot'

// locale 归一是纯逻辑，住在 electron-free 的 desktopLocale.ts（打包裸 Node launcher 也要 require 它，
// 不能碰 electron）。本地引来给 setDesktopLocale 用，再原样导出——保持 i18n 对既有消费者的公开面不变
//（P1：函数只此一处定义，i18n 只是转口）。
import {
  normalizeDesktopLocale,
  getDesktopLocale,
  setDesktopLocale,
  type DesktopLocale,
} from "./desktopLocale";
export { normalizeDesktopLocale, getDesktopLocale, setDesktopLocale, type DesktopLocale };

// 文案表与取词函数住在 electron-free 的 desktopStrings.ts（渲染层够得到的 catalog 模块也要用它，
// 不能碰 electron）。这里引来原样导出——保持 i18n 对既有消费者的公开面不变。
import { desktopT, type DesktopTranslationKey } from "./desktopStrings";
export { desktopT, type DesktopTranslationKey };


// i18n 相关 IPC 一处收口（避免主进程巨壳继续膨胀，R9）：
//  · set-locale：渲染层切语言 → 同步桌面侧（原生菜单/对话框文案）。
//  · get-system-locale：首启无存储偏好时，渲染层同步探测 OS 语言（app.getLocale() 由 --lang/系统设定）。
export function registerI18nIpc(): void {
  ipcMain.on("nomi:i18n:set-locale", (_event, locale: unknown) => {
    setDesktopLocale(locale)
    try {
      writePersistedLocale(getSettingsRoot(), getDesktopLocale())
    } catch {
      // Locale still applies for this session when the settings root is unavailable.
    }
  });
  ipcMain.on("nomi:i18n:get-system-locale", (event) => {
    try {
      event.returnValue = { ok: true, value: app.getLocale() };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
