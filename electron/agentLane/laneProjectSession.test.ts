import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { createCanvasReadSurfaceRegistry, createSurfaceOwnerAuthority } from '../capabilityCore/canvasReadSurfaceRegistry'
import { ensureWorkspaceProjectIdentity } from '../workspace/workspaceProjectIdentity'
import { workspaceProjectFile, workspaceProjectBackupFile } from '../workspace/workspacePaths'
import { createHttpFixture } from '../../tests/agent-runtime/httpFixture.mjs'
import { openLaneWorkspace } from './laneWorkspace.mjs'
import { bindLaneProjectSession } from './laneProjectSession'
import type { LaneWorkspaceHandle, LaneWorkspaceProjection } from '../shared/agentLane/laneContracts'
import { LANE_IPC_CHANNELS } from '../shared/agentLane/laneContracts'
import { openLaneHistory } from './laneHistory.mjs'
import { registerAgentLaneIpc } from './laneIpc'

const ipc = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))
vi.mock('electron', () => ({ ipcMain: {
  handle: (channel: string, handler: (...args: unknown[]) => unknown) => ipc.handlers.set(channel, handler),
  removeHandler: (channel: string) => ipc.handlers.delete(channel),
} }))
vi.mock('../ipcSenderGuard', () => ({ assertTrustedSender: vi.fn() }))

it('failed real workspace replacement retires the bound session and finishes cleanup before IPC reopens', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nomi-session-replacement-'))
  const ownerAuthority = createSurfaceOwnerAuthority()
  const owner = ownerAuthority.capture({ contents: {}, frame: {}, webContentsId: 1, processId: 2,
    frameRoutingId: 3, origin: 'file://', isLive: () => true })
  const identity = { projectId: 'project-a', immutableProjectUuid: 'uuid-a', projectGeneration: 1, canonicalRootPath: root, canonicalRootDigest: 'root-a' }
  const registry = createCanvasReadSurfaceRegistry({ ownerAuthority, resolveProjectIdentity: async () => identity })
  const wire = await registry.commitCanvasRead(owner, { projectId: identity.projectId,
    suspension: registry.suspend(owner, { surfaceInstanceId: 'fixture' }) })
  const original = registry.openProjectSession(owner, wire.binding)
  let opens = 0
  const options = { projectDir: root, fetch: globalThis.fetch, tools: [], systemPrompt: 'Fixture.' }
  const raw = await openLaneWorkspace(options, async options => {
    if (++opens > 1) throw new Error('replacement open failure')
    return openLaneHistory(options)
  })
  const cleanup = vi.fn()
  const first = bindLaneProjectSession(raw, registry, original, cleanup)
  let second: LaneWorkspaceHandle | undefined
  const sender = { id: 1, send: vi.fn(), isDestroyed: () => false, once: vi.fn(), removeListener: vi.fn() }
  const openWorkspace = vi.fn(async () => {
    if (openWorkspace.mock.calls.length === 1) return first
    expect(cleanup).toHaveBeenCalledOnce()
    const fresh = registry.openProjectSession(owner, wire.binding)
    expect(fresh).not.toBe(original)
    await registry.verifyProjectSession(fresh)
    second = bindLaneProjectSession(await openLaneWorkspace(options), registry, fresh, () => undefined)
    return second
  })
  const registration = registerAgentLaneIpc({ openWorkspace, validate: vi.fn(), configure: vi.fn(),
    receipt: vi.fn(), singleShot: vi.fn(), updatePolicy: vi.fn(), restoreInput: vi.fn() })
  const send = (request: unknown) => ipc.handlers.get(LANE_IPC_CHANNELS.command)!({ sender }, request)
  try {
    const opened = await send({ kind: 'workspace-open', binding: wire.binding }) as { workspaceId: string }
    expect(await send({ kind: 'lane-create', laneName: 'research', workspaceId: opened.workspaceId })).toMatchObject({ ok: false })
    expect(() => registry.resolveProjectSession(original)).toThrow()
    expect(await send({ kind: 'workspace-open', binding: wire.binding })).toMatchObject({ ok: true })
    expect(cleanup).toHaveBeenCalledOnce()
    expect(sender.send.mock.calls.filter(([, projection]) => projection.closed)).toHaveLength(1)
  } finally {
    await registration.dispose()
    await first.close()
    await second?.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})

it('reopens a real workspace with fresh verified authority after manifest IO recovers, retaining history without reviving old actions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nomi-session-reopen-'))
  const http = await createHttpFixture([{ type: 'text', text: 'First conversation.' }, { type: 'text', text: 'Fresh conversation turn.' }])
  const handles: LaneWorkspaceHandle[] = []
  try {
    const manifest = workspaceProjectFile(root)
    await fs.mkdir(path.dirname(manifest), { recursive: true })
    await fs.writeFile(manifest, JSON.stringify({ id: 'project-a', name: 'Fixture', version: 2,
      createdAt: 1, updatedAt: 1, savedAt: 1, revision: 0, payload: {} }))
    const identity = await ensureWorkspaceProjectIdentity(root)
    const ownerAuthority = createSurfaceOwnerAuthority()
    const owner = ownerAuthority.capture({ contents: {}, frame: {}, webContentsId: 1, processId: 2,
      frameRoutingId: 3, origin: 'file://', isLive: () => true })
    const registry = createCanvasReadSurfaceRegistry({ ownerAuthority,
      resolveProjectIdentity: async () => ensureWorkspaceProjectIdentity(root) })
    const wire = await registry.commitCanvasRead(owner, { projectId: identity.projectId,
      suspension: registry.suspend(owner, { surfaceInstanceId: 'fixture' }) })
    const session = registry.openProjectSession(owner, wire.binding)
    const options = { projectDir: root, fetch: globalThis.fetch, systemPrompt: 'Fixture.', tools: [],
      model: { kind: 'openai-compatible' as const, providerId: 'fixture', modelId: 'fixture',
        baseURL: http.baseURL, authType: 'api-key' as const, apiKey: 'fixture' } }
    let closed!: () => void
    const closedPromise = new Promise<void>(resolve => { closed = resolve })
    const first = bindLaneProjectSession(await openLaneWorkspace(options), registry, session, closed)
    handles.push(first)
    await first.execute({ kind: 'prompt', text: 'Remember this conversation.' })
    const terminal: LaneWorkspaceProjection[] = []
    first.subscribe(value => terminal.push(value))
    const captured = registry.captureProjectSessionPort(session)
    const backup = workspaceProjectBackupFile(root)
    // Actual filesystem read failure: both manifest versions temporarily vanish.
    await fs.rename(manifest, `${manifest}.unavailable`)
    await fs.rename(backup, `${backup}.unavailable`)
    await expect(registry.verifyProjectSession(session)).rejects.toMatchObject({ code: 'project_identity_unavailable' })
    await closedPromise
    expect(terminal).toHaveLength(1)
    expect(terminal[0]).toMatchObject({ closed: true, active: { running: false } })
    expect(() => registry.resolveCapturedCanvasReadPort(captured)).toThrow()
    await fs.rename(`${manifest}.unavailable`, manifest)
    await fs.rename(`${backup}.unavailable`, backup)

    const fresh = registry.openProjectSession(owner, wire.binding)
    await expect(registry.verifyProjectSession(fresh)).resolves.toMatchObject({ binding: wire.binding })
    expect(fresh).not.toBe(session)
    const second = bindLaneProjectSession(await openLaneWorkspace(options), registry, fresh, () => undefined)
    handles.push(second)
    expect(JSON.stringify(second.projection().active.parts)).toContain('First conversation.')
    await second.execute({ kind: 'prompt', text: 'This is new user intent.' })
    expect(http.requests).toHaveLength(2)
    expect(() => registry.resolveProjectSession(session)).toThrow()
  } finally {
    for (const handle of handles.reverse()) await handle.close()
    await http.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
