import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const roots: string[] = []
const settings = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => settings.root, getAppPath: () => process.cwd() } }))
vi.mock('./assetEvents', () => ({ broadcastAssetsUpdated: vi.fn(), broadcastAssetLocalizationStarted: vi.fn() }))

function temp() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-artifact-import-')); roots.push(root); return root }
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

it('stores text and HTML bytes/native files under the exact originating identity', async () => {
  settings.root = temp()
  const { createProject, projectDirById } = await import('../projects/repository')
  const { ensureWorkspaceProjectIdentity } = await import('../workspace/workspaceProjectIdentity')
  const { importLocalFile } = await import('./localFileImport')
  const { listProjectAssets } = await import('./projectAssetStore')
  const a = createProject({ rootPath: temp(), name: 'A', payload: {} })
  const b = createProject({ rootPath: temp(), name: 'B', payload: {} })
  const identity = await ensureWorkspaceProjectIdentity(projectDirById(a.id)!)
  const binding = { projectId: identity.projectId, immutableProjectUuid: identity.immutableProjectUuid, projectGeneration: identity.projectGeneration }
  const text = await importLocalFile({ projectId: a.id, projectBinding: binding, fileName: 'note.txt', contentType: 'text/plain', bytes: Buffer.from('original project') })
  expect(text).toMatchObject({ projectId: a.id })
  const sourcePath = path.join(temp(), 'page.html')
  fs.writeFileSync(sourcePath, '<p>original project</p>')
  expect(await importLocalFile({ projectId: a.id, projectBinding: binding, fileName: 'page.html', contentType: 'text/html', sourcePath }, { allowSourcePath: true })).toMatchObject({ projectId: a.id })
  await expect(importLocalFile({ projectId: b.id, projectBinding: binding, fileName: 'wrong.txt', bytes: Buffer.from('wrong') })).rejects.toMatchObject({ code: 'project_binding_stale' })
  await expect(importLocalFile({ projectId: a.id, projectBinding: { ...binding, projectGeneration: binding.projectGeneration + 1 }, fileName: 'stale.txt', bytes: Buffer.from('stale') })).rejects.toMatchObject({ code: 'project_binding_stale' })
  expect(listProjectAssets({ projectId: b.id }).items).toEqual([])
  expect(listProjectAssets({ projectId: a.id }).items.map(item => item.name)).toEqual(expect.arrayContaining(['note.txt', 'page.html']))
})
