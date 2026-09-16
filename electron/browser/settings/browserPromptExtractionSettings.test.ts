// 浏览器提示词提取模板按项目存。项目只认发起窗口（浮层 = 父窗口）已提交的项目面，
// 渲染层 payload 里自报的 projectId 不是授权：读写都不看它，父窗口没打开项目就拒写。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { IpcMainInvokeEvent } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, payload?: unknown) => Promise<unknown>>(),
  issued: null as null | { binding: { projectId: string }; assertCurrent: () => void },
  roots: new Map<string, string>(),
  readProject: vi.fn(),
}))
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: never) => state.handlers.set(channel, handler) } }))
vi.mock('../../ipcSenderGuard', () => ({ assertTrustedUiSender: () => undefined }))
vi.mock('../overlay/browserViewOverlay', () => ({ getOwnerWindowForSender: () => ({}) }))
vi.mock('../../assets/windowProjectCapture', () => ({ issueWindowProject: () => state.issued }))
vi.mock('../../projects/repository', () => ({ readProject: state.readProject }))
import { registerBrowserPromptExtractionSettingsIpc } from './browserPromptExtractionSettings'

const event = { sender: {} } as IpcMainInvokeEvent
const settingsFile = (projectId: string) => path.join(state.roots.get(projectId)!, '.nomi', 'browser-prompt-extraction.json')

beforeEach(() => {
  state.handlers.clear()
  state.issued = null
  for (const projectId of ['a', 'b']) state.roots.set(projectId, fs.mkdtempSync(path.join(os.tmpdir(), `nomi-browser-settings-${projectId}-`)))
  state.readProject.mockImplementation((projectId: string) => ({ lastKnownRootPath: state.roots.get(projectId) }))
  registerBrowserPromptExtractionSettingsIpc()
})
afterEach(() => {
  for (const root of state.roots.values()) fs.rmSync(root, { recursive: true, force: true })
  state.roots.clear()
})

describe('browser prompt extraction settings are scoped by the window session, not the payload', () => {
  it('reads nothing when the window has no project, whatever projectId the renderer names', async () => {
    await expect(state.handlers.get('browser:prompt-extraction-settings:read')!(event, { projectId: 'a' })).resolves.toEqual({ ok: true, settings: null })
    expect(state.readProject).not.toHaveBeenCalled()
  })

  it('refuses to write without a window project session', async () => {
    await expect(state.handlers.get('browser:prompt-extraction-settings:write')!(event, { projectId: 'a', settings: { mode: 'x' } }))
      .rejects.toMatchObject({ code: 'project_identity_unavailable' })
    expect(fs.existsSync(settingsFile('a'))).toBe(false)
  })

  it('writes into the issued project even when the payload names another, and stops once the session is revoked', async () => {
    let current = true
    state.issued = { binding: { projectId: 'a' }, assertCurrent: () => { if (!current) throw Object.assign(new Error('project_binding_stale'), { code: 'project_binding_stale' }) } }
    await state.handlers.get('browser:prompt-extraction-settings:write')!(event, { projectId: 'b', settings: { mode: 'style' } })
    expect(JSON.parse(fs.readFileSync(settingsFile('a'), 'utf8'))).toEqual({ mode: 'style' })
    expect(fs.existsSync(settingsFile('b'))).toBe(false)

    current = false
    await expect(state.handlers.get('browser:prompt-extraction-settings:write')!(event, { settings: { mode: 'late' } }))
      .rejects.toMatchObject({ code: 'project_binding_stale' })
    expect(JSON.parse(fs.readFileSync(settingsFile('a'), 'utf8'))).toEqual({ mode: 'style' })
  })
})
