// 桌面 locale 的纯归一逻辑（零 electron / 零 node-API 顶层导入）。
//
// **为什么必须保持 electron-free**：打包后的裸 Node MCP launcher（mcpNodeLauncher，ELECTRON_RUN_AS_NODE=1）
// 会 require 到它——那个运行时里 app.asar 内没有 electron 模块，任何顶层 `require('electron')` 都会
// MODULE_NOT_FOUND、当场打死整条 MCP 客户端。历史上该函数住在 electron/i18n.ts（顶层 `import { app } from
// 'electron'`），T4 让 launcher 引它就破了「launcher 闭包 electron-free」这条不变量（2026-08-18 ship 事故）。
// 因此把这份纯逻辑单拎出来：i18n.ts 与 launcher 都从这里取，i18n 只是再导出保持公开面稳定。
// 这条 electron-free 由 mcpLauncherClosure.test.ts 结构钉死——别往本文件加任何 electron/node 顶层导入。

export type DesktopLocale = 'zh-CN' | 'en'

/** 归一任意 locale 值 → 桌面双语枚举（en / zh-CN）。单一真相源：setDesktopLocale 与 MCP 传输取语言都用它。 */
export function normalizeDesktopLocale(value: unknown): DesktopLocale {
  return value === 'en' || (typeof value === 'string' && value.toLowerCase().startsWith('en')) ? 'en' : 'zh-CN'
}
