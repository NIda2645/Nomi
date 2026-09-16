import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const roots: string[] = []
const settings = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => settings.root, getAppPath: () => process.cwd() } }))
vi.mock('./assetEvents', () => ({ broadcastAssetsUpdated: vi.fn(), broadcastAssetLocalizationStarted: vi.fn() }))

function temp() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-artifact-import-')); roots.push(root); return root }
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

it.each(['generation', 'directory'].flatMap(change => [['bytes', true, change], ['native', true, change], ['bytes', false, change], ['native', false, change]]))('rejects %s publication (explicit binding=%s) on %s replacement during lookup', async (transport, bound, change) => {
  settings.root = temp()
  const { createProject, projectDirById } = await import('../projects/repository')
  const { importLocalFile } = await import('./localFileImport')
  const { ensureWorkspaceProjectIdentity } = await import('../workspace/workspaceProjectIdentity')
  const project = createProject({ rootPath: temp(), name: 'origin', payload: {} })
  const root = projectDirById(project.id)!
  const identity = await ensureWorkspaceProjectIdentity(root)
  const binding = { projectId: identity.projectId, immutableProjectUuid: identity.immutableProjectUuid, projectGeneration: identity.projectGeneration }
  const source = path.join(temp(), 'artifact.txt')
  fs.writeFileSync(source, 'must not publish')
  const original = fs.promises.readdir.bind(fs.promises)
  let changed = false
  vi.spyOn(fs.promises, 'readdir').mockImplementation(async (...args: Parameters<typeof original>) => {
    if (!changed && String(args[0]).includes('assets/imported')) {
      changed = true
      if (change === 'directory') {
        const moved = `${root}-moved`; roots.push(moved)
        fs.renameSync(root, moved); fs.mkdirSync(root)
        fs.cpSync(path.join(moved, '.nomi'), path.join(root, '.nomi'), { recursive: true })
      } else {
        for (const name of fs.readdirSync(path.join(root, '.nomi')).filter(name => name.startsWith('project') && name.endsWith('.json'))) {
          const target = path.join(root, '.nomi', name)
          const record = JSON.parse(fs.readFileSync(target, 'utf8'))
          fs.writeFileSync(target, JSON.stringify({ ...record, projectGeneration: record.projectGeneration + 1 }))
        }
      }
    }
    return original(...args)
  })
  await expect(importLocalFile({ projectId: project.id, ...(bound ? { projectBinding: binding } : {}), fileName: 'artifact.txt', contentType: 'text/plain',
    ...(transport === 'native' ? { sourcePath: source } : { bytes: Buffer.from('must not publish') }),
  }, { allowSourcePath: true })).rejects.toMatchObject({ code: 'project_binding_stale' })
  expect(changed).toBe(true)
  expect(fs.existsSync(path.join(root, 'assets/imported/sha256'))).toBe(false)
})

it('revokes reuse and metadata updates when an interaction is cancelled during lookup', async () => {
  settings.root = temp()
  const { createProject } = await import('../projects/repository')
  const { importLocalFile } = await import('./localFileImport')
  const project = createProject({ rootPath: temp(), name: 'origin', payload: {} })
  const payload = { projectId: project.id, fileName: 'reuse.txt', contentType: 'text/plain', bytes: Buffer.from('reusable') }
  const stored = await importLocalFile(payload) as { data: { absolutePath: string } }
  const sidecar = `${stored.data.absolutePath}.meta`
  const before = fs.readFileSync(sidecar, 'utf8')
  let current = true
  const readdir = fs.promises.readdir.bind(fs.promises)
  vi.spyOn(fs.promises, 'readdir').mockImplementation(async (...args: Parameters<typeof readdir>) => {
    if (String(args[0]).includes('assets/imported')) current = false
    return readdir(...args)
  })
  await expect(importLocalFile(payload, { assertCurrent() {
    if (!current) throw Object.assign(new Error('project_binding_stale'), { code: 'project_binding_stale' })
  } })).rejects.toMatchObject({ code: 'project_binding_stale' })
  expect(fs.readFileSync(sidecar, 'utf8')).toBe(before)
})

it('does not lend a background upload the cancelled interaction authorization', async () => {
  settings.root = temp()
  const { createProject } = await import('../projects/repository')
  const { importLocalFile } = await import('./localFileImport')
  const project = createProject({ rootPath: temp(), name: 'concurrent', payload: {} })
  const payload = { projectId: project.id, fileName: 'same.txt', contentType: 'text/plain', bytes: Buffer.from('same bytes') }
  let current = true
  const readdir = fs.promises.readdir.bind(fs.promises)
  vi.spyOn(fs.promises, 'readdir').mockImplementation(async (...args: Parameters<typeof readdir>) => {
    if (String(args[0]).includes('assets/imported')) current = false
    return readdir(...args)
  })
  const results = await Promise.allSettled([importLocalFile(payload, { assertCurrent() {
    if (!current) throw Object.assign(new Error('project_binding_stale'), { code: 'project_binding_stale' })
  } }), importLocalFile(payload)])
  expect(results[0]).toMatchObject({ status: 'rejected', reason: { code: 'project_binding_stale' } })
  expect(results[1]).toMatchObject({ status: 'fulfilled', value: { projectId: project.id } })
})

it('stores the five tool artifact formats and rejects unknown formats and insufficient disk', async () => {
  settings.root = temp()
  const { createProject } = await import('../projects/repository')
  const { importLocalFile } = await import('./localFileImport')
  const { clearStorageCapacityCache } = await import('./storageCapacity')
  const project = createProject({ rootPath: temp(), name: 'formats', payload: {} })
  const formats = [
    ['text.txt', 'text/plain', 'text'], ['markdown.md', 'text/markdown', '# markdown'],
    ['page.html', 'text/html', '<p>page</p>'], ['table.html', 'text/html', '<table><tr><td>value</td></tr></table>'],
    ['image.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'],
  ]
  for (const [fileName, contentType, text] of formats) {
    const stored = await importLocalFile({ projectId: project.id, fileName, contentType, bytes: Buffer.from(text) }) as { data: { absolutePath: string } }
    expect(fs.readFileSync(stored.data.absolutePath, 'utf8')).toBe(text)
  }
  await expect(importLocalFile({ projectId: project.id, fileName: 'unknown.exe', contentType: 'application/x-unknown', bytes: Buffer.from('unknown') }))
    .rejects.toMatchObject({ rejection: { reason: 'unsupported-kind' } })
  vi.spyOn(fs, 'statfsSync').mockReturnValue({ bavail: 0, bsize: 4096 } as ReturnType<typeof fs.statfsSync>)
  clearStorageCapacityCache()
  await expect(importLocalFile({ projectId: project.id, fileName: 'full.txt', contentType: 'text/plain', bytes: Buffer.from('full') }))
    .rejects.toMatchObject({ rejection: { reason: 'no-disk-space' } })
})

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
