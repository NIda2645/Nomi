import { ownPendingCanvasWrite, abandonPendingCanvasWrite } from '../../events/canvasWriteBoundary'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import { readShotTable } from '../../../../../electron/shared/canvas/shotTable'
import { deconstructToShotTable, ensureDeconstructionShotTable, retryShot } from './factBridge'

const bridge = vi.hoisted(() => ({ deconstruct: vi.fn(), onDeconstructionProgress: vi.fn(() => vi.fn()) }))
vi.mock('../../../../desktop/bridge', () => ({ getDesktopBridge: () => ({ video: bridge }) }))

const project = vi.hoisted(() => ({ controller: new AbortController() }))
/** 发起拆解时签发的原项目（替身）；replace 即换项目。 */
function originProject() {
  const signal = project.controller.signal
  return { binding: { projectId: 'isolated-project', immutableProjectUuid: 'uuid', projectGeneration: 1 }, signal,
    assertCurrent() { if (signal.aborted) throw Object.assign(new Error('stale'), { code: 'project_binding_stale' }) } }
}

const evidence = {
  shots: [{ index: 1, startSeconds: 0, endSeconds: 2, durationSeconds: 2,
    sourceFrameUrl: 'nomi-local://isolated-project/frame.png', shotSize: 'close', mood: 'quiet', visual: 'Door opens',
    onScreenText: '', dialogue: '', carriedOver: false, imagePrompt: 'A door', motionPrompt: 'Opening', custom: {} }],
  durationSeconds: 2, hasAudio: false, failedShotIndexes: [],
}

beforeEach(() => {
  project.controller = new AbortController()
  abandonPendingCanvasWrite()
  bridge.deconstruct.mockReset()
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] })
})

function source(legacy = false): string {
  const node = useGenerationCanvasStore.getState().addNode({
    kind: 'video', title: 'Reference', position: { x: 0, y: 0 },
    meta: legacy ? { videoDeconstruction: evidence } : {},
  })
  useGenerationCanvasStore.getState().updateNode(node.id, {
    result: { id: 'result', type: 'video', url: 'nomi-local://isolated-project/video.mp4', createdAt: 1 },
  })
  return node.id
}

describe('fact table engine bridge', () => {
  it('migrates cached evidence once, connects its source and retains the migration backup', async () => {
    const sourceId = source(true)
    const id = ensureDeconstructionShotTable(sourceId)
    expect(await deconstructToShotTable(sourceId, originProject())).toBe(id)
    const state = useGenerationCanvasStore.getState()
    expect(state.nodes.filter((node) => node.kind === 'shot_table')).toHaveLength(1)
    expect(state.edges.some((edge) => edge.source === sourceId && edge.target === id)).toBe(true)
    expect(state.nodes.find((node) => node.id === sourceId)?.meta?.videoDeconstruction).toEqual(evidence)
    expect(readShotTable(state.nodes.find((node) => node.id === id)?.meta)?.rows?.[0].keyframeRef).toBe(evidence.shots[0].sourceFrameUrl)
    expect(bridge.deconstruct).not.toHaveBeenCalled()
  })

  it('persists real engine results in the table and leaves source metadata unmodified', async () => {
    bridge.deconstruct.mockResolvedValue(evidence)
    const sourceId = source()
    const id = await deconstructToShotTable(sourceId, originProject())
    const state = useGenerationCanvasStore.getState()
    const table = readShotTable(state.nodes.find((node) => node.id === id)?.meta)
    expect(table?.source).toMatchObject({ kind: 'deconstruction', status: 'ready' })
    expect(table?.rows?.[0].cells.visual).toBe('Door opens')
    expect(state.nodes.find((node) => node.id === sourceId)?.meta?.videoDeconstruction).toBeUndefined()
  })

  it('records real failure and permits a successful retry without creating another table', async () => {
    bridge.deconstruct.mockRejectedValueOnce(new Error('Unable to read video')).mockResolvedValueOnce(evidence)
    const sourceId = source()
    const id = await deconstructToShotTable(sourceId, originProject())
    expect(readShotTable(useGenerationCanvasStore.getState().nodes.find((node) => node.id === id)?.meta)?.source)
      .toMatchObject({ status: 'failed', errorMessage: 'Unable to read video' })
    expect(await deconstructToShotTable(sourceId, originProject())).toBe(id)
    expect(useGenerationCanvasStore.getState().nodes.filter((node) => node.kind === 'shot_table')).toHaveLength(1)
  })
})


it('retries only the requested shot and preserves its measured evidence', async () => {
  const sourceId = source(true)
  const id = ensureDeconstructionShotTable(sourceId)!
  bridge.deconstruct.mockResolvedValue({ ...evidence, shots: [{ ...evidence.shots[0], visual: 'New reading', startSeconds: 1 }] })
  await retryShot(id, 'fact-1', originProject())
  expect(bridge.deconstruct).toHaveBeenCalledWith(expect.objectContaining({ shotIndexes: [1] }))
  const table = readShotTable(useGenerationCanvasStore.getState().nodes.find(node => node.id === id)?.meta)
  expect(table?.rows?.[0].cells.visual).toBe('New reading')
  expect(table?.rows?.[0].startSeconds).toBe(0)
})

it('keeps runtime progress out of user undo steps', async () => {
  const sourceId = source()
  bridge.deconstruct.mockResolvedValue(evidence)
  const id = await deconstructToShotTable(sourceId, originProject())
  useGenerationCanvasStore.getState().undo()
  expect(useGenerationCanvasStore.getState().nodes.some(node => node.id === id)).toBe(false)
  expect(useGenerationCanvasStore.getState().nodes.some(node => node.id === sourceId)).toBe(true)
})

it('rejects an old completion when the same project canvas is restored', async () => {
  const sourceId = source()
  bridge.deconstruct.mockImplementation(async () => {
    const state = useGenerationCanvasStore.getState()
    state.restoreSnapshot({ nodes: state.nodes, edges: state.edges, groups: state.groups, selectedNodeIds: state.selectedNodeIds })
    return evidence
  })
  const id = await deconstructToShotTable(sourceId, originProject())
  expect(readShotTable(useGenerationCanvasStore.getState().nodes.find(node => node.id === id)?.meta)?.source).toMatchObject({ status: 'idle' })
})


it('makes one retry one undo step and preserves the table', async () => {
  const sourceId = source(true)
  const id = ensureDeconstructionShotTable(sourceId)!
  bridge.deconstruct.mockResolvedValue({ ...evidence, shots: [{ ...evidence.shots[0], visual: 'New reading' }] })
  await retryShot(id, 'fact-1', originProject())
  useGenerationCanvasStore.getState().undo()
  expect(readShotTable(useGenerationCanvasStore.getState().nodes.find(node => node.id === id)?.meta)?.rows?.[0].cells.visual).toBe('Door opens')
  useGenerationCanvasStore.getState().undo()
  expect(useGenerationCanvasStore.getState().nodes.some(node => node.id === id)).toBe(false)
})

it('ignores a single-shot retry completed after restoring the same project', async () => {
  const sourceId = source(true)
  const id = ensureDeconstructionShotTable(sourceId)!
  bridge.deconstruct.mockImplementation(async () => {
    const state = useGenerationCanvasStore.getState()
    state.restoreSnapshot({ nodes: state.nodes, edges: state.edges, groups: state.groups, selectedNodeIds: state.selectedNodeIds })
    return { ...evidence, shots: [{ ...evidence.shots[0], visual: 'Obsolete reading' }] }
  })
  await retryShot(id, 'fact-1', originProject())
  expect(readShotTable(useGenerationCanvasStore.getState().nodes.find(node => node.id === id)?.meta)?.rows?.[0].cells.visual).toBe('Door opens')
})


it('defers an async result until an unrelated proposal releases the canvas', async () => {
  const sourceId = source()
  const cancel = vi.fn()
  let release: (() => void) | undefined
  let started!: () => void
  const engineStarted = new Promise<void>(resolve => { started = resolve })
  bridge.deconstruct.mockImplementation(async () => {
    release = await ownPendingCanvasWrite('unrelated-proposal', cancel)
    started()
    return evidence
  })
  const operation = deconstructToShotTable(sourceId, originProject())
  await engineStarted
  await Promise.resolve()
  await Promise.resolve()
  expect(cancel).not.toHaveBeenCalled()
  release!()
  const id = await operation
  expect(readShotTable(useGenerationCanvasStore.getState().nodes.find(node => node.id === id)?.meta)?.source).toMatchObject({ status: 'ready' })
})

it('never writes a late engine result after the originating project was replaced, even A to B to A', async () => {
  const sourceId = source()
  const id = ensureDeconstructionShotTable(sourceId)!
  bridge.deconstruct.mockImplementation(async () => { project.controller.abort(); project.controller = new AbortController(); return evidence })
  await deconstructToShotTable(sourceId, originProject())
  expect(readShotTable(useGenerationCanvasStore.getState().nodes.find(node => node.id === id)?.meta)?.source).toMatchObject({ status: 'running' })
})
