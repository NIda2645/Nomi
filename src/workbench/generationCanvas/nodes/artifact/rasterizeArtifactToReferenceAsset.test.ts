import { describe, expect, it, vi, beforeEach } from 'vitest'
import { rasterizeArtifactToReferenceAsset, type ReferenceAssetDeps } from './rasterizeArtifactToReferenceAsset'
import type { AgentArtifactMeta } from '../../model/artifactMeta'
import type { WorkbenchAssetDto } from '../../../api/assetUploadApi'
import type { ProjectExecutionContext } from '../../../project/projectCanvasReadSurface'

const project = { controller: new AbortController() }
/** 动作起点签发的原项目生命周期（此处由测试替身扮演；被替换即 abort）。 */
function originProject(): ProjectExecutionContext {
  const signal = project.controller.signal
  return { signal, binding: { projectId: 'p', immutableProjectUuid: 'uuid-p', projectGeneration: 1 },
    assertCurrent() { if (signal.aborted) throw Object.assign(new Error('stale'), { code: 'project_binding_stale' }) },
  }
}

// 固化为参考图（SVG → PNG → asset 节点）契约。真实路径依赖 canvas + 主进程资产导入
//（importWorkbenchLocalAssetFile），node 单测用 stub deps 锁「数据流与分支语义」；
// canvas 栅格化 + 落盘 + 连线走 GUI 走查（tests/ux/agent-artifact.walk.mjs）。

const store: { calls: unknown[]; nodes: unknown[] } = { calls: [], nodes: [] }
vi.mock('../../store/generationCanvasStore', () => ({
  useGenerationCanvasStore: {
    getState: () => ({
      nodes: store.nodes,
      addNode: (input: unknown) => {
        store.calls.push({ op: 'addNode', input })
        return { id: 'asset-1' }
      },
      updateNode: (id: string, patch: unknown) => {
        store.calls.push({ op: 'updateNode', id, patch })
      },
    }),
  },
}))

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#2f6f8f"/></svg>'
const svgArtifact: AgentArtifactMeta = { fileType: 'svg', url: 'nomi-local://asset/p/assets/generated/composition-guide.svg' }

function makeDeps(overrides: Partial<ReferenceAssetDeps> = {}): ReferenceAssetDeps {
  return {
    readText: vi.fn(async () => svg),
    rasterizeSvgToPngBlob: vi.fn(async () => new Blob(['fake-png'], { type: 'image/png' })),
    // 注意类型：deps.uploadFile 的契约是 Promise<WorkbenchAssetDto>，不是「长得差不多的对象」。
    // 测试文件不进 pnpm typecheck，只有 check:test-types 看得见这里的类型错。
    uploadFile: vi.fn(async (file: File): Promise<WorkbenchAssetDto> => ({
      id: 'asset-uuid',
      name: file.name,
      data: { url: `nomi-local://asset/p/assets/generated/${file.name}` },
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
      userId: 'local',
    })),
    ...overrides,
  }
}

describe('rasterizeArtifactToReferenceAsset', () => {
  beforeEach(() => { store.calls = []; store.nodes = []; project.controller = new AbortController() })

  it.each(['read', 'rasterize', 'upload'])('cancels without creating a node when project changes during %s', async phase => {
    const deps = makeDeps()
    const replace = () => { project.controller.abort(); project.controller = new AbortController() }
    if (phase === 'read') deps.readText = vi.fn(async () => { replace(); return svg })
    if (phase === 'rasterize') deps.rasterizeSvgToPngBlob = vi.fn(async () => { replace(); return new Blob(['png']) })
    if (phase === 'upload') {
      const upload = deps.uploadFile
      deps.uploadFile = vi.fn(async (...args: Parameters<ReferenceAssetDeps['uploadFile']>) => { replace(); return upload(...args) })
    }
    await expect(rasterizeArtifactToReferenceAsset(svgArtifact, originProject(), deps)).resolves.toMatchObject({ ok: false, cancelled: true })
    expect(store.calls).toEqual([])
    if (phase !== 'upload') expect(deps.uploadFile).not.toHaveBeenCalled()
  })

  it('SVG 产物 → 栅格化 → 上传 PNG → 新建 asset 节点 + result.url（可被连线当参考）', async () => {
    const deps = makeDeps()
    const result = await rasterizeArtifactToReferenceAsset(svgArtifact, originProject(), deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nodeId).toBe('asset-1')
    expect(deps.readText).toHaveBeenCalledWith('nomi-local://asset/p/assets/generated/composition-guide.svg')
    // 上传的是 PNG（文件名带 .png）
    expect(deps.uploadFile).toHaveBeenCalledTimes(1)
    const uploaded = (deps.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as File
    expect(uploaded.name).toMatch(/\.png$/)
    expect(uploaded.type).toBe('image/png')
    // asset 节点挂 result:{type:image, url:nomi-local} → referenceUrl.ts 的 resultUrl 可读
    const update = store.calls.find((c) => (c as { op: string }).op === 'updateNode') as { patch: { result: { type: string; url: string } } }
    expect(update.patch.result.type).toBe('image')
    expect(update.patch.result.url).toContain('nomi-local://asset/p/assets/generated/')
  })

  it('非 SVG 类型拒绝（v1 仅 SVG 可栅格化）', async () => {
    const deps = makeDeps()
    const result = await rasterizeArtifactToReferenceAsset({ ...svgArtifact, fileType: 'html' }, originProject(), deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('unsupported-file-type')
    expect(deps.uploadFile).not.toHaveBeenCalled()
  })

  it('读文本失败 → 不落盘、不建节点', async () => {
    const deps = makeDeps({ readText: vi.fn(async () => { throw new Error('404') }) })
    const result = await rasterizeArtifactToReferenceAsset(svgArtifact, originProject(), deps)
    expect(result.ok).toBe(false)
    expect(deps.uploadFile).not.toHaveBeenCalled()
    expect(store.calls.length).toBe(0)
  })

  it('栅格化失败（SVG 有外部引用/不可渲染）→ 干净失败', async () => {
    const deps = makeDeps({ rasterizeSvgToPngBlob: vi.fn(async () => null) })
    const result = await rasterizeArtifactToReferenceAsset(svgArtifact, originProject(), deps)
    expect(result.ok).toBe(false)
    expect(deps.uploadFile).not.toHaveBeenCalled()
  })

  it('上传失败 → 不建节点', async () => {
    const deps = makeDeps({ uploadFile: vi.fn(async () => { throw new Error('disk full') }) })
    const result = await rasterizeArtifactToReferenceAsset(svgArtifact, originProject(), deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('disk full')
    expect(store.calls.length).toBe(0)
  })

  // nomi-local URL 是逐段 encodeURIComponent 建出来的，取名就必须逐段 decode。
  // 少这一步，中文标题会以 %E5%BC%80… 的样子变成参考图文件名和节点标题（用户看到的乱码）。
  it('中文标题的产物：参考图文件名解码回中文，不留百分号转义', async () => {
    const deps = makeDeps()
    const encoded = `nomi-local://asset/p/assets/imported/2026-09-07/${encodeURIComponent('开场构图线稿')}.svg`
    const result = await rasterizeArtifactToReferenceAsset({ fileType: 'svg', url: encoded }, originProject(), deps)

    expect(result.ok).toBe(true)
    const uploaded = vi.mocked(deps.uploadFile).mock.calls[0][0]
    expect(uploaded.name).toBe('开场构图线稿.png')
    expect(uploaded.name).not.toContain('%')
    // 节点标题就是这个文件名——乱码会一路显到画布上。
    const added = store.calls.find((call) => (call as { op: string }).op === 'addNode') as { input: { title: string } }
    expect(added.input.title).toBe('开场构图线稿.png')
  })

  // 类级：不是「中文」特殊，是**任何**被转义的段都要还原（空格/括号同族）。
  it('空格与括号一样解码（同一类：URL 段编码，不是某种语言）', async () => {
    const deps = makeDeps()
    const encoded = `nomi-local://asset/p/assets/imported/d/${encodeURIComponent('shot 01 (draft)')}.svg`
    await rasterizeArtifactToReferenceAsset({ fileType: 'svg', url: encoded }, originProject(), deps)

    expect(vi.mocked(deps.uploadFile).mock.calls[0][0].name).toBe('shot 01 (draft).png')
  })

  // 真机走查（2026-09-07）抓到的落点 bug：不传源节点时 addNode 退到缺省落点 (120,360)，
  // 参考图落在画布最左侧、压在左侧工具簇底下——用户点完「固化为参考图」，东西不在他刚看的地方。
  // 更狠的一条是分类：画布按 activeCategoryId 分屏，参考图落错分类等于落在另一块屏上（看起来「点了没反应」）。
  it('给了源节点就生在它右边、并跟它同一个分类（落点与分类都跟源卡走）', async () => {
    store.nodes = [{ id: 'artifact-1', categoryId: 'references', position: { x: 900, y: 200 }, size: { width: 420, height: 260 } }]
    const result = await rasterizeArtifactToReferenceAsset(svgArtifact, originProject(), makeDeps(), 'artifact-1')
    expect(result.ok).toBe(true)
    const add = store.calls.find((call) => (call as { op: string }).op === 'addNode') as { input: Record<string, unknown> }
    expect(add.input.categoryId).toBe('references')
    expect(add.input.position).toEqual({ x: 900 + 420 + 48, y: 200 })
  })

  it('源节点 id 认不出来时不炸，退回缺省落点与 shots 分类', async () => {
    store.nodes = []
    const result = await rasterizeArtifactToReferenceAsset(svgArtifact, originProject(), makeDeps(), 'missing-node')
    expect(result.ok).toBe(true)
    const add = store.calls.find((call) => (call as { op: string }).op === 'addNode') as { input: Record<string, unknown> }
    expect(add.input.categoryId).toBe('shots')
    expect(add.input.position).toBeUndefined()
  })
})
