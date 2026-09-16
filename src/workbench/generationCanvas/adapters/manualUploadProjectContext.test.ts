import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import type { ProjectExecutionContext } from '../../project/projectCanvasReadSurface'

const fixture = vi.hoisted(() => ({ controller: new AbortController(), upload: vi.fn(), update: vi.fn(), addReference: vi.fn(), state: vi.fn(), dimensions: vi.fn(), dataUrl: vi.fn(), panorama: vi.fn() }))
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>()
  return { ...actual, default: { ...actual, useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(),
    useState: (initial: unknown) => [initial, fixture.state], useRef: (initial: unknown) => ({ current: initial }) } }
})
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../../i18n', () => ({ default: { t: (key: string) => key } }))
vi.mock('../../project/projectCanvasReadSurface', () => ({
  isProjectImportCancellation: (error: { code?: string }) => error.code === 'project_binding_stale' || error.code === 'capability_cancelled',
  captureCurrentProjectExecutionContext: () => {
    const signal = fixture.controller.signal
    return { signal, binding: { projectId: 'project-a', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 },
      assertCurrent() { if (signal.aborted) throw Object.assign(new Error('stale'), { code: 'project_binding_stale' }) } }
  },
  isProjectExecutionContextCurrent: (context?: ProjectExecutionContext) => { try { if (!context) return false; context.assertCurrent(); return true } catch { return false } },
}))
vi.mock('../../api/assetUploadApi', () => ({ importWorkbenchLocalAssetFile: fixture.upload, hostedAssetUrl: (asset: { data: { url: string } }) => asset.data.url }))
vi.mock('./assetImportAdapter', () => ({ isProjectImportCancellation: (error: { code?: string }) => error.code === 'project_binding_stale' || error.code === 'capability_cancelled' }))
vi.mock('../model/nodeAssetDrop', () => ({ resolveNodeArraySlots: () => [{ key: 'images' }], dropKindFromFile: () => 'image', dropKindFromWorkspaceKind: () => 'image' }))
vi.mock('../nodes/nodeAssetWrite', () => ({ addAssetUrlToNode: fixture.addReference }))
vi.mock('../store/generationCanvasStore', () => {
  const getState = () => ({ nodes: [], updateNode: fixture.update })
  return { useGenerationCanvasStore: Object.assign((select: (s: ReturnType<typeof getState>) => unknown) => select(getState()), { getState }) }
})
vi.mock('../nodes/director/DirectorEditorContext', () => ({ useDirectorStoreApi: () => ({ getState: () => ({ saveState: vi.fn(), patchPanoramaConfig: fixture.panorama }) }) }))
vi.mock('../nodes/director/panels/imageFile', () => ({ readImageDimensions: fixture.dimensions, readFileAsDataUrl: fixture.dataUrl }))
vi.mock('../../../ui/notificationPolicy', () => ({ notify: vi.fn() }))

import { useNodeAssetDrop } from '../nodes/useNodeAssetDrop'
import { useComposerAttachments } from '../../ai/composer/useComposerAttachments'
import { useNodeImageUpload } from './useNodeImageUpload'
import { usePanoramaImport } from '../nodes/director/panels/usePanoramaImport'

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }
function replaceProject() { fixture.controller.abort(); fixture.controller = new AbortController() }
const asset = { id: 'asset', name: 'image.png', data: { url: 'nomi-local://asset/project-a/image.png', contentHash: 'hash' } }
const file = () => new File(['image'], 'image.png', { type: 'image/png' })
beforeEach(() => {
  vi.clearAllMocks(); fixture.controller = new AbortController(); fixture.upload.mockResolvedValue(asset)
  fixture.addReference.mockReturnValue({ status: 'added' }); fixture.dimensions.mockResolvedValue({ width: 100, height: 50 })
  vi.stubGlobal('window', { setTimeout: vi.fn() })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('stops a multi-file node drop after project replacement without reference or local state callbacks', async () => {
  const wait = deferred<typeof asset>(); fixture.upload.mockReturnValue(wait.promise)
  const feedback = vi.fn()
  const hook = useNodeAssetDrop({ id: 'node-1', meta: {} } as GenerationCanvasNode, feedback)
  const pending = hook.dropHandlers.onDrop({ preventDefault() {}, stopPropagation() {}, dataTransfer: { files: [file(), file()], getData: () => '' } } as unknown as React.DragEvent<HTMLElement>)
  fixture.state.mockClear(); replaceProject(); replaceProject(); wait.resolve(asset)
  await pending
  expect(fixture.upload).toHaveBeenCalledTimes(1); expect(fixture.addReference).not.toHaveBeenCalled()
  expect(fixture.state).not.toHaveBeenCalled(); expect(feedback).not.toHaveBeenCalled()
})

it('does not append ready composer attachments or errors when their upload crosses project replacement', async () => {
  const wait = deferred<typeof asset>(); fixture.upload.mockReturnValue(wait.promise)
  const setAttachments = vi.fn(), onError = vi.fn()
  useComposerAttachments({ attachments: [], setAttachments, onError }).addFiles([file()])
  setAttachments.mockClear(); replaceProject(); wait.resolve(asset)
  await wait.promise; await Promise.resolve()
  expect(setAttachments).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled()
})

it('checks queued composer state updaters again when React applies them', async () => {
  const setAttachments = vi.fn()
  useComposerAttachments({ attachments: [], setAttachments }).addFiles([file()])
  await Promise.resolve(); await Promise.resolve()
  expect(setAttachments).toHaveBeenCalledTimes(2)
  replaceProject()
  const replacement: never[] = []
  for (const [update] of setAttachments.mock.calls) expect(update(replacement)).toBe(replacement)
})

it('does not replace an image node after its persistence completes in a replacement project', async () => {
  const wait = deferred<typeof asset>(); fixture.upload.mockReturnValue(wait.promise)
  useNodeImageUpload('node-1', 'test')('data:image/png;base64,eA==', file())
  fixture.update.mockClear(); replaceProject(); wait.resolve(asset)
  await wait.promise; await Promise.resolve(); await Promise.resolve()
  expect(fixture.update).not.toHaveBeenCalled()
})

it('does not import or apply a director panorama after image dimensions outlive the project', async () => {
  const wait = deferred<{ width: number; height: number }>(); fixture.dimensions.mockReturnValue(wait.promise)
  usePanoramaImport().importPanoramaFile(file())
  fixture.state.mockClear(); replaceProject(); wait.resolve({ width: 100, height: 50 })
  await wait.promise; await Promise.resolve()
  expect(fixture.upload).not.toHaveBeenCalled(); expect(fixture.panorama).not.toHaveBeenCalled(); expect(fixture.state).not.toHaveBeenCalled()
})
