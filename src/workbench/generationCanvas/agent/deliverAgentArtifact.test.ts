import { describe, expect, it, vi } from 'vitest'
import {
  artifactFileName,
  buildArtifactFile,
  deliverAgentArtifactToAsset,
  DELIVERABLE_ARTIFACT_EXTENSION,
  DELIVERABLE_ARTIFACT_MIME,
  isTextDeliverableFileType,
} from './deliverAgentArtifact'
import { readAgentArtifactMeta } from '../model/artifactMeta'
import { generationCanvasNodeSchema } from '../model/generationCanvasSchema'
import { canvasWriteSemanticInputSchema } from '../../../../electron/shared/agentCapabilities/canvasWrite'
import { AssetImportError } from '../../../../electron/shared/contracts/assetImportResult'
import { SurfacePortWireError } from '../../../../electron/shared/surfacePortBinding'

// deliverAgentArtifact：Agent 把文件内容直接交给画布（不调模型）的落盘通道契约。
// 纯函数部分在 node 直接测；落盘用注入 stub（真实走 importWorkbenchLocalAssetFile → 主进程，GUI 走查覆盖）。

describe('artifact 文件构建', () => {
  it('文件名由标题 derive + 扩展名；标题空则回退默认名', () => {
    expect(artifactFileName({ fileType: 'svg', content: '<svg/>', title: '构图线稿' })).toBe('构图线稿.svg')
    expect(artifactFileName({ fileType: 'markdown', content: 'x', title: '' })).toBe('agent-artifact.md')
    expect(artifactFileName({ fileType: 'table', content: 'x', title: '分镜表' })).toBe('分镜表.html')
  })

  it('危险字符被清洗（文件系统安全）', () => {
    const name = artifactFileName({ fileType: 'html', content: 'x', title: 'a/b:c*d?e"f<g>h|i' })
    expect(name).not.toMatch(/[/\\:*?"<>|]/)
    expect(name.endsWith('.html')).toBe(true)
  })

  it('File 带正确 MIME 与文件名', () => {
    const file = buildArtifactFile({ fileType: 'html', content: '<p>hi</p>', title: '讲解卡' })
    expect(file.name).toBe('讲解卡.html')
    expect(file.type).toBe('text/html')
  })

  it('svg/html/markdown/table/text 可走文本通道；glb 不可（二进制 P1）', () => {
    for (const t of ['svg', 'html', 'markdown', 'table', 'text'] as const) {
      expect(isTextDeliverableFileType(t)).toBe(true)
      expect(DELIVERABLE_ARTIFACT_MIME[t]).toBeTruthy()
      expect(DELIVERABLE_ARTIFACT_EXTENSION[t]).toBeTruthy()
    }
    expect(isTextDeliverableFileType('glb')).toBe(false)
  })
})

describe('deliverAgentArtifactToAsset（落盘契约）', () => {
  const context = { binding: { projectId: 'original', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 }, assertCurrent() {} }
  const stubImporter = (url: string) => async (file: File) => ({ data: { url: `${url}/${file.name}` } })

  it('成功：返回 nomi-local URL 且文件名带扩展名', async () => {
    const result = await deliverAgentArtifactToAsset(
      { fileType: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg"/>', title: '线稿' },
      context,
      stubImporter('nomi-local://asset/p/assets/generated'),
    )
    expect(result).toMatchObject({ ok: true, url: 'nomi-local://asset/p/assets/generated/线稿.svg' })
  })

  it('空内容 → 拒绝（不落盘空文件）', async () => {
    const result = await deliverAgentArtifactToAsset(
      { fileType: 'text', content: '   ', title: 't' },
      context,
      stubImporter('nomi-local://'),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure).toEqual({ code: 'capability_input_invalid' })
  })

  it('落盘器抛错 → 转 ok:false + reason（调用方中止整批）', async () => {
    const failing = async () => { throw new Error('disk full') }
    // 'md' 是**扩展名**，不是 fileType（词表 ARTIFACT_FILE_TYPES 里叫 'markdown'）。
    // 两者长得像，写混了 vitest 不管，只有 check:test-types 看得见。
    const result = await deliverAgentArtifactToAsset({ fileType: 'markdown', content: '# hi', title: 't' }, context, failing)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure).toEqual({ code: 'capability_execution_failed' })
  })

  it('落盘成功返回无 url → 转 ok:false', async () => {
    const empty = async () => ({ data: {} })
    const result = await deliverAgentArtifactToAsset({ fileType: 'text', content: 'x', title: 't' }, context, empty)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure).toEqual({ code: 'capability_receipt_unresolved' })
  })

  it('binds every declared text artifact to the original project and blocks stale writes', async () => {
    const importer = vi.fn<import('./deliverAgentArtifact').WorkbenchAssetImporter>(stubImporter('nomi-local://asset/original'))
    for (const fileType of ['text', 'markdown', 'html', 'table', 'svg'] as const) {
      expect(await deliverAgentArtifactToAsset({ fileType, content: 'fixture' }, context, importer)).toMatchObject({ ok: true })
    }
    for (const call of importer.mock.calls) expect(call[2]).toMatchObject({ projectBinding: context.binding })
    importer.mockClear()
    const result = await deliverAgentArtifactToAsset({ fileType: 'text', content: 'x' }, {
      ...context, assertCurrent() { throw new SurfacePortWireError('project_binding_stale') },
    }, importer)
    expect(result).toMatchObject({ ok: false, failure: { code: 'project_binding_stale' } })
    expect(importer).not.toHaveBeenCalled()
  })

  it('preserves safe storage rejection and cancellation through delivery', async () => {
    for (const [error, failure] of [
      [new AssetImportError({ code: 'capability_execution_failed', reason: 'no-disk-space' }), { code: 'capability_execution_failed', reason: 'no-disk-space' }],
      [new SurfacePortWireError('project_binding_stale'), { code: 'project_binding_stale' }],
      [new DOMException('private detail', 'AbortError'), { code: 'capability_cancelled' }],
    ]) {
      const result = await deliverAgentArtifactToAsset({ fileType: 'text', content: 'x' }, context, async () => { throw error })
      expect(result).toEqual({ ok: false, failure })
    }
  })
})

// 交付产物构造的节点（meta.artifact）能被 schema 快照校验放行、能被 reader 读回——两条契约锁死
// 「Agent 交付 → 画布持久化 → 渲染读回」闭环不裂。
describe('deliver 产物节点跨层契约', () => {
  const svgBody = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#2f6f8f"/></svg>'

  it('electron canvasWrite schema 接受 agent-artifact + artifact 内容（并拒绝缺内容的）', () => {
    const ok = canvasWriteSemanticInputSchema.safeParse({
      operation: 'create_canvas_nodes',
      summary: '交付构图线稿',
      nodes: [{
        clientId: 'a1',
        kind: 'agent-artifact',
        title: '构图线稿',
        // 传输 schema 对所有 kind 都要 prompt（这条要求写在**形状**里，外部宿主才看得见——
        // 藏进 superRefine 的话 tools/list 会说它可选，check:mcp-operation-constructible 会红）。
        // 手艺产物不调模型，给空串。
        prompt: '',
        artifact: { fileType: 'svg', content: svgBody },
      }],
    })
    expect(ok.success).toBe(true)

    const missing = canvasWriteSemanticInputSchema.safeParse({
      operation: 'create_canvas_nodes',
      summary: '缺内容',
      nodes: [{ clientId: 'a1', kind: 'agent-artifact', title: '构图线稿', prompt: '' }],
    })
    expect(missing.success).toBe(false)

    const wrongKind = canvasWriteSemanticInputSchema.safeParse({
      operation: 'create_canvas_nodes',
      summary: '普通节点不能带 artifact',
      nodes: [{ clientId: 'a1', kind: 'image', title: '镜头', prompt: 'x', artifact: { fileType: 'svg', content: svgBody } }],
    })
    expect(wrongKind.success).toBe(false)
  })

  it('落盘 URL 写进 meta.artifact 后节点通过画布 schema（持久化）且 reader 读回', () => {
    const node = {
      id: 'n1',
      kind: 'agent-artifact',
      title: '构图线稿',
      position: { x: 0, y: 0 },
      meta: { artifact: { fileType: 'svg', url: 'nomi-local://asset/p/assets/generated/构图线稿.svg' } },
    }
    const parsed = generationCanvasNodeSchema.safeParse(node)
    expect(parsed.success).toBe(true)
    expect(readAgentArtifactMeta({ meta: parsed.success ? parsed.data.meta : {} })).toMatchObject({
      fileType: 'svg',
      url: 'nomi-local://asset/p/assets/generated/构图线稿.svg',
    })
  })
})
