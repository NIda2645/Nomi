import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'

// 0a · 「dispatch 后恰好一次富化」的结构不变量。两层验证：
//  ① 单元：dispatchAndEnrich（注入假 dispatch）→ 结果一定过了 enrichResultForMethod（generate 补 _nomiThumbnail）。
//  ② 结构：两个真实传输（rpcServer / mcpStdioServer）**不再**各自 bare-dispatch + 手动 enrich，只走包装器。
//     这样「新加一个传输忘了富化」在结构上不可能。host.ts 是有意死代码，刻意不接（见 plan 第四节），此处不作要求。

// nativeImage 桩：enrichGenerateResult 走 buildResultThumbnail，需要能出 JPEG 的 toolkit（否则优雅省略，测不到富化）。
vi.mock('electron', () => {
  const image = {
    isEmpty: () => false,
    getSize: () => ({ width: 1024, height: 768 }),
    resize() {
      return image
    },
    toJPEG: () => Buffer.alloc(1_000, 1),
  }
  return { nativeImage: { createFromPath: () => image, createFromBuffer: () => image } }
})

// 本地素材解析桩：让 generate 结果里的 nomi-local:// 资产被认成可读本地文件（触发缩略图富化）。
vi.mock('../protocol/localProtocol', () => ({
  parseLocalAssetUrl: (url: string) =>
    url.startsWith('nomi-local://asset/') ? { filePath: '/tmp/fake.png', projectId: 'p1', relativePath: 'a.png' } : null,
}))

// readFileBytes 只在缩略图富化里读素材字节；结构断言仍要读真源码 → 只对非 .ts 路径返回假字节，.ts 透传真读。
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const readFileSync = ((p: fs.PathOrFileDescriptor, ...rest: unknown[]) =>
    typeof p === 'string' && p.endsWith('.ts')
      ? (actual.readFileSync as (...a: unknown[]) => unknown)(p, ...rest)
      : Buffer.alloc(10)) as typeof actual.readFileSync
  return { ...actual, readFileSync, default: { ...actual, readFileSync } }
})

import { dispatchAndEnrich } from './mcpResultEnrichLive'
import type { DispatchContext } from './dispatcher'

const fakeCtx = {} as unknown as DispatchContext

describe('dispatchAndEnrich — dispatch 后恰好一次富化（单元）', () => {
  it('generate 结果经包装器 → 注入 _nomiThumbnail（证明过了 enrichResultForMethod）', async () => {
    const dispatchFn = vi.fn(async () => ({ status: 'succeeded', assets: [{ type: 'image', url: 'nomi-local://asset/p1/a.png' }] }))
    const out = (await dispatchAndEnrich('generate', { projectId: 'p1' }, fakeCtx, dispatchFn)) as Record<string, unknown>
    expect(dispatchFn).toHaveBeenCalledTimes(1)
    expect(out._nomiThumbnail).toBeTruthy()
  })

  it('非 generate/artifact 方法原样透传（富化只作用于该富化的方法）', async () => {
    const dispatchFn = vi.fn(async () => ({ projects: [] }))
    const out = await dispatchAndEnrich('project.list', {}, fakeCtx, dispatchFn)
    expect(out).toEqual({ projects: [] })
  })
})

describe('富化收口 — 传输层不得 bare-dispatch（结构断言）', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const read = (f: string) => fs.readFileSync(path.join(here, f), 'utf8')

  for (const transport of ['rpcServer.ts', 'mcpStdioServer.ts']) {
    it(`${transport} 走 dispatchAndEnrich，且不再直调 dispatch(...) 或 enrichResultForMethod(...)`, () => {
      const src = read(transport)
      expect(src).toContain('dispatchAndEnrich(')
      // bare dispatch( 调用（非 dispatchAndEnrich、非 import）应为 0：用「非字母紧邻」界定 dispatch 边界。
      const bareDispatch = src.match(/(?<![A-Za-z])dispatch\s*\(/g) || []
      expect(bareDispatch.length).toBe(0)
      // 手动富化也不该再出现（已折进包装器）。
      expect(src).not.toContain('enrichResultForMethod(')
    })
  }
})
