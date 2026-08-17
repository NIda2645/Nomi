import { describe, it, expect, vi } from 'vitest'
import { buildResultThumbnail, type ThumbnailImageToolkit } from './mcpPreviewImage'

// 假 nativeImage：记录 resize 调用，toJPEG 产一个可控大小的 buffer（按注入的 byteLength 造）。
function fakeToolkit(options: {
  jpegBytes?: number
  width?: number
  height?: number
  emptyFor?: (input: unknown) => boolean
} = {}): { toolkit: ThumbnailImageToolkit; resizeCalls: Array<Record<string, unknown>> } {
  const resizeCalls: Array<Record<string, unknown>> = []
  const jpegBytes = options.jpegBytes ?? 4_000
  const makeImage = (empty: boolean) => {
    const image = {
      isEmpty: () => empty,
      getSize: () => ({ width: options.width ?? 1024, height: options.height ?? 768 }),
      resize: (opts: Record<string, unknown>) => {
        resizeCalls.push(opts)
        return image
      },
      toJPEG: (_quality: number) => Buffer.alloc(jpegBytes, 0x7a),
    }
    return image
  }
  const toolkit: ThumbnailImageToolkit = {
    createFromPath: (p: string) => makeImage(options.emptyFor ? options.emptyFor(p) : false),
    createFromBuffer: (b: Buffer) => makeImage(options.emptyFor ? options.emptyFor(b) : false),
  }
  return { toolkit, resizeCalls }
}

describe('buildResultThumbnail（交付② · Electron 侧 nativeImage 缩略）', () => {
  const genResult = (assets: Array<Record<string, unknown>>) => ({ status: 'succeeded', assets })

  it('图片资产：产出一个 JPEG base64 块，mimeType=image/jpeg，长边被缩到 ≤512', () => {
    const { toolkit, resizeCalls } = fakeToolkit({ width: 1600, height: 900, jpegBytes: 8_000 })
    const readFile = vi.fn(() => Buffer.alloc(50_000, 1))
    const out = buildResultThumbnail(genResult([{ type: 'image', url: 'nomi-local://asset/p1/a.png' }]), {
      toolkit,
      readLocalFile: () => '/tmp/p1/a.png', // 解析到磁盘路径
      readFileBytes: readFile,
    })
    expect(out).not.toBeNull()
    expect(out!.mimeType).toBe('image/jpeg')
    // base64 of 8000 bytes ≈ 10668 chars
    expect(out!.data.length).toBeGreaterThan(1000)
    // 长边 1600 → 缩放请求带 width:512（等比，只钉长边）
    expect(resizeCalls.length).toBe(1)
    expect(resizeCalls[0]).toMatchObject({ width: 512 })
    expect(resizeCalls[0].height).toBeUndefined()
  })

  it('竖图：钉高 512（height），不钉宽', () => {
    const { toolkit, resizeCalls } = fakeToolkit({ width: 600, height: 1200 })
    const out = buildResultThumbnail(genResult([{ type: 'image', url: 'nomi-local://asset/p1/tall.png' }]), {
      toolkit,
      readLocalFile: () => '/tmp/p1/tall.png',
      readFileBytes: () => Buffer.alloc(10),
    })
    expect(out).not.toBeNull()
    expect(resizeCalls[0]).toMatchObject({ height: 512 })
    expect(resizeCalls[0].width).toBeUndefined()
  })

  it('小图（长边已 ≤512）：不放大，不带 resize 尺寸（保持原大小编码）', () => {
    const { toolkit, resizeCalls } = fakeToolkit({ width: 320, height: 240 })
    const out = buildResultThumbnail(genResult([{ type: 'image', url: 'nomi-local://asset/p1/small.png' }]), {
      toolkit,
      readLocalFile: () => '/tmp/p1/small.png',
      readFileBytes: () => Buffer.alloc(10),
    })
    expect(out).not.toBeNull()
    expect(resizeCalls.length).toBe(0) // 不缩放
  })

  it('超过 64KB base64 硬顶：省略图片块（返回 null，不塞超大 payload）', () => {
    // 64KB base64 ≈ 48KB 原始字节；给 60KB JPEG → base64 ≈ 80KB > 顶 → null
    const { toolkit } = fakeToolkit({ jpegBytes: 60_000 })
    const out = buildResultThumbnail(genResult([{ type: 'image', url: 'nomi-local://asset/p1/big.png' }]), {
      toolkit,
      readLocalFile: () => '/tmp/p1/big.png',
      readFileBytes: () => Buffer.alloc(200_000),
    })
    expect(out).toBeNull()
  })

  it('视频资产无 poster：省略图片块（本任务不做抽帧）', () => {
    const { toolkit } = fakeToolkit()
    const out = buildResultThumbnail(genResult([{ type: 'video', url: 'nomi-local://asset/p1/clip.mp4' }]), {
      toolkit,
      readLocalFile: () => '/tmp/p1/clip.mp4',
      readFileBytes: () => Buffer.alloc(10),
    })
    expect(out).toBeNull()
  })

  it('视频资产带 thumbnailUrl（poster 图）：用 poster 出块', () => {
    const { toolkit } = fakeToolkit({ jpegBytes: 3_000 })
    const out = buildResultThumbnail(
      genResult([{ type: 'video', url: 'nomi-local://asset/p1/clip.mp4', thumbnailUrl: 'nomi-local://asset/p1/poster.jpg' }]),
      {
        toolkit,
        readLocalFile: (u: string) => (u.includes('poster') ? '/tmp/p1/poster.jpg' : null),
        readFileBytes: () => Buffer.alloc(10),
      },
    )
    expect(out).not.toBeNull()
    expect(out!.mimeType).toBe('image/jpeg')
  })

  it('解析不到本地文件：优雅返回 null（不抛）', () => {
    const { toolkit } = fakeToolkit()
    const out = buildResultThumbnail(genResult([{ type: 'image', url: 'https://cdn.example/x.png' }]), {
      toolkit,
      readLocalFile: () => null, // 非 nomi-local，解析失败
      readFileBytes: () => Buffer.alloc(10),
    })
    expect(out).toBeNull()
  })

  it('nativeImage 解出空图（损坏文件）：优雅返回 null', () => {
    const { toolkit } = fakeToolkit({ emptyFor: () => true })
    const out = buildResultThumbnail(genResult([{ type: 'image', url: 'nomi-local://asset/p1/broken.png' }]), {
      toolkit,
      readLocalFile: () => '/tmp/p1/broken.png',
      readFileBytes: () => Buffer.alloc(10),
    })
    expect(out).toBeNull()
  })

  it('无资产：null', () => {
    const { toolkit } = fakeToolkit()
    expect(buildResultThumbnail(genResult([]), { toolkit, readLocalFile: () => '/x', readFileBytes: () => Buffer.alloc(1) })).toBeNull()
    expect(buildResultThumbnail({}, { toolkit, readLocalFile: () => '/x', readFileBytes: () => Buffer.alloc(1) })).toBeNull()
  })

  it('artifact 形状（preview.url 是图片本地链，无 nomiUrl 时）：也能出块', () => {
    const { toolkit } = fakeToolkit({ jpegBytes: 2_000 })
    const out = buildResultThumbnail(
      { kind: 'image', status: 'ready', preview: { url: 'nomi-local://production-preview/p/r/a/thumb.jpg?preview=tok' } },
      {
        toolkit,
        readLocalFile: () => '/tmp/p/thumb.jpg',
        readFileBytes: () => Buffer.alloc(10),
      },
    )
    expect(out).not.toBeNull()
  })

  it('artifact 真实形状（preview.url=签名 HTTP 链、preview.nomiUrl=本地链）：走 nomiUrl 出块，不误用 HTTP url', () => {
    const { toolkit } = fakeToolkit({ jpegBytes: 2_000 })
    const seen: string[] = []
    const out = buildResultThumbnail(
      {
        kind: 'image', status: 'ready',
        preview: {
          url: 'http://127.0.0.1:5/production-preview?preview=tok', // App 里真实是签名 HTTP 链（解不了本地文件）
          nomiUrl: 'nomi-local://production-preview/p/r/a/thumb.jpg?preview=tok',
        },
      },
      {
        toolkit,
        // 模拟真实 parseLocalAssetUrl：只有 nomi-local:// 能解析到磁盘，HTTP url 返回 null。
        readLocalFile: (u: string) => { seen.push(u); return u.startsWith('nomi-local://') ? '/tmp/p/thumb.jpg' : null },
        readFileBytes: () => Buffer.alloc(10),
      },
    )
    expect(out).not.toBeNull()
    // 关键：传给解析的是 nomiUrl（可解析），不是 HTTP 的 preview.url。
    expect(seen).toContain('nomi-local://production-preview/p/r/a/thumb.jpg?preview=tok')
    expect(seen).not.toContain('http://127.0.0.1:5/production-preview?preview=tok')
  })

  it('artifact 视频产物（preview 指向 mp4）：不出块（不抽帧）', () => {
    const { toolkit } = fakeToolkit({ jpegBytes: 2_000 })
    const out = buildResultThumbnail(
      { kind: 'video', status: 'ready', preview: { url: 'http://127.0.0.1:5/x', nomiUrl: 'nomi-local://production-preview/p/r/a/clip.mp4?preview=tok' } },
      { toolkit, readLocalFile: () => '/tmp/p/clip.mp4', readFileBytes: () => Buffer.alloc(10) },
    )
    expect(out).toBeNull()
  })

  it('readFileBytes 抛（文件消失）：优雅 null', () => {
    const { toolkit } = fakeToolkit()
    const out = buildResultThumbnail(genResult([{ type: 'image', url: 'nomi-local://asset/p1/gone.png' }]), {
      toolkit,
      readLocalFile: () => '/tmp/p1/gone.png',
      readFileBytes: () => { throw new Error('ENOENT') },
    })
    expect(out).toBeNull()
  })
})
