import { describe, it, expect } from 'vitest'
import { enrichGenerateResult, parseLocalAssetRef } from './mcpResultEnrich'
import type { ThumbnailImageToolkit } from './mcpPreviewImage'

function fakeToolkit(jpegBytes = 2_000): ThumbnailImageToolkit {
  const image = {
    isEmpty: () => false,
    getSize: () => ({ width: 1024, height: 768 }),
    resize() { return image },
    toJPEG: () => Buffer.alloc(jpegBytes, 1),
  }
  return { createFromPath: () => image, createFromBuffer: () => image }
}

describe('parseLocalAssetRef（nomi-local://asset URL → {projectId, relativePath}）', () => {
  it('解析常规本地素材链', () => {
    expect(parseLocalAssetRef('nomi-local://asset/p1/assets/gen/a.png')).toEqual({ projectId: 'p1', relativePath: 'assets/gen/a.png' })
  })
  it('URL 编码段被 decode', () => {
    expect(parseLocalAssetRef('nomi-local://asset/proj%201/a%20b/c.png')).toEqual({ projectId: 'proj 1', relativePath: 'a b/c.png' })
  })
  it('非 nomi-local://asset → null', () => {
    expect(parseLocalAssetRef('https://x/y.png')).toBeNull()
    expect(parseLocalAssetRef('nomi-local://production-preview/p/r/a/x.png?preview=t')).toBeNull()
    expect(parseLocalAssetRef('')).toBeNull()
  })
})

describe('enrichGenerateResult（交付②④ · App 侧给生成结果补缩略图 base64 + 签名预览 URL）', () => {
  const baseResult = () => ({ status: 'succeeded', assets: [{ type: 'image', url: 'nomi-local://asset/p1/assets/a.png', assetId: 'x' }] })

  it('图片资产：注入 _nomiThumbnail（base64 块）+ _nomiPreviewUrl（签名链）', () => {
    const out = enrichGenerateResult(baseResult(), {
      projectId: 'p1',
      toolkit: fakeToolkit(),
      readFileBytes: () => Buffer.alloc(10),
      resolveLocalFile: () => '/tmp/p1/a.png',
      mintPreview: (a) => ({ url: `http://127.0.0.1:1/production-preview?preview=TOK-${a.relativePath}`, token: 't', expiresAt: 'later' }),
    }) as Record<string, unknown>
    const thumb = out._nomiThumbnail as { data: string; mimeType: string }
    expect(thumb).toBeTruthy()
    expect(thumb.mimeType).toBe('image/jpeg')
    expect(thumb.data.length).toBeGreaterThan(100)
    expect(out._nomiPreviewUrl).toBe('http://127.0.0.1:1/production-preview?preview=TOK-assets/a.png')
    // 原字段不动。
    expect((out.assets as unknown[]).length).toBe(1)
  })

  it('mint 返回 null（server 未起）：不加 _nomiPreviewUrl，但缩略图仍在', () => {
    const out = enrichGenerateResult(baseResult(), {
      projectId: 'p1',
      toolkit: fakeToolkit(),
      readFileBytes: () => Buffer.alloc(10),
      resolveLocalFile: () => '/tmp/p1/a.png',
      mintPreview: () => null,
    }) as Record<string, unknown>
    expect(out._nomiThumbnail).toBeTruthy()
    expect(out._nomiPreviewUrl).toBeUndefined()
  })

  it('缩略失败（解析不到文件）：不加 _nomiThumbnail，结果其余完好', () => {
    const out = enrichGenerateResult(baseResult(), {
      projectId: 'p1',
      toolkit: fakeToolkit(),
      readFileBytes: () => Buffer.alloc(10),
      resolveLocalFile: () => null,
      mintPreview: () => ({ url: 'http://127.0.0.1:1/production-preview?preview=T', token: 't', expiresAt: 'later' }),
    }) as Record<string, unknown>
    expect(out._nomiThumbnail).toBeUndefined()
    expect(out.status).toBe('succeeded')
  })

  it('视频资产无 poster：既无 _nomiThumbnail 也无 _nomiPreviewUrl（不抽帧、不签视频）', () => {
    const out = enrichGenerateResult(
      { status: 'succeeded', assets: [{ type: 'video', url: 'nomi-local://asset/p1/clip.mp4' }] },
      {
        projectId: 'p1',
        toolkit: fakeToolkit(),
        readFileBytes: () => Buffer.alloc(10),
        resolveLocalFile: () => '/tmp/p1/clip.mp4',
        mintPreview: () => ({ url: 'http://127.0.0.1:1/production-preview?preview=T', token: 't', expiresAt: 'later' }),
      },
    ) as Record<string, unknown>
    expect(out._nomiThumbnail).toBeUndefined()
    expect(out._nomiPreviewUrl).toBeUndefined()
  })

  it('非本地素材（公网 url，理论上本地化后不会出现）：不签、不缩，原样返回', () => {
    const out = enrichGenerateResult(
      { status: 'succeeded', assets: [{ type: 'image', url: 'https://cdn/x.png' }] },
      {
        projectId: 'p1',
        toolkit: fakeToolkit(),
        readFileBytes: () => Buffer.alloc(10),
        resolveLocalFile: () => null,
        mintPreview: () => ({ url: 'http://127.0.0.1:1/production-preview?preview=T', token: 't', expiresAt: 'later' }),
      },
    ) as Record<string, unknown>
    expect(out._nomiPreviewUrl).toBeUndefined()
    expect(out._nomiThumbnail).toBeUndefined()
  })

  it('非对象结果 / 无 projectId：原样返回，不炸', () => {
    const deps = { projectId: '', toolkit: fakeToolkit(), readFileBytes: () => Buffer.alloc(1), resolveLocalFile: () => '/x', mintPreview: () => null }
    expect(enrichGenerateResult(null, deps)).toBeNull()
    expect(enrichGenerateResult('str', deps)).toBe('str')
    // 有资产但无 projectId → 不签（token 需 projectId），缩略图仍可（本地文件解析不依赖 projectId）。
    const out = enrichGenerateResult(baseResult(), { ...deps, projectId: '' }) as Record<string, unknown>
    expect(out._nomiPreviewUrl).toBeUndefined()
  })
})
