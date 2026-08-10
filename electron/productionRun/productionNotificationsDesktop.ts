// A5 系统通知 · electron 胶水层（薄）：决策在 productionNotifications.ts（纯逻辑，单测在那边）。
// 只干三件事：① 前台不打扰（用户正看着 Nomi）；② 发原生通知；③ 点击拉回窗口并深链到该 run
// （复用 nomi:production-deep-link 通道，renderer 既有处理器会定位到 run）。
// 通知钩子绝不允许影响制作主流程：全部 try/catch 吞错。

import { BrowserWindow, Notification } from 'electron'

import { createNoticeDedupe, decideProductionNotice } from './productionNotifications'
import type { ProductionRun, RunEvent } from './productionRunTypes'

function anyWindowFocused(): boolean {
  return BrowserWindow.getAllWindows().some((win) => !win.isDestroyed() && win.isFocused())
}

function focusAndDeepLink(target: { projectId: string; runId: string }): void {
  const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
  if (!win) return // MCP stdio 无窗进程：通知仍有价值（提示用户开 Nomi），点击无窗可聚焦则不动
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  win.webContents.send('nomi:production-deep-link', target)
}

/** 装一个可直接塞给 service deps.onEvents 的监听器。 */
export function createProductionNotificationsListener(): (events: RunEvent[], run: ProductionRun) => void {
  const allow = createNoticeDedupe()
  return (events, run) => {
    try {
      if (anyWindowFocused()) return
      if (!Notification.isSupported()) return
      const decided = decideProductionNotice(events, run)
      if (!decided || !allow(decided.key)) return
      const item = new Notification({ title: decided.title, body: decided.body })
      item.on('click', () => focusAndDeepLink(decided.target))
      item.show()
    } catch {
      // 通知失败不影响制作。
    }
  }
}
