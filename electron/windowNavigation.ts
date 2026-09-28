import { shell, type BrowserWindow } from 'electron'

export function installWindowNavigation(mainWindow: BrowserWindow, rendererUrl: string): void {
  // External http(s) links (e.g. the "get your API key" link → provider console)
  // open in the user's real browser, never as a new in-app Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isRendererEntryUrl(url, rendererUrl)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}

function isRendererEntryUrl(url: string, rendererUrl: string): boolean {
  try {
    const actual = new URL(url)
    const expected = new URL(rendererUrl)
    if (actual.protocol !== expected.protocol) return false
    if (actual.protocol === 'file:') return actual.pathname === expected.pathname
    return actual.origin === expected.origin && actual.pathname === expected.pathname
  } catch {
    return url === rendererUrl
  }
}
