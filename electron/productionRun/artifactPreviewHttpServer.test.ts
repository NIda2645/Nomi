import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { startArtifactPreviewHttpServer } from './artifactPreviewHttpServer'

const roots: string[] = []
const closes: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(closes.splice(0).map((close) => close()))
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('production artifact preview HTTP server', () => {
  it('serves a valid handle to an external host with CORS/range support and fails closed otherwise', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-preview-http-'))
    roots.push(root)
    const filePath = path.join(root, 'clip.mp4')
    fs.writeFileSync(filePath, '0123456789')
    const service = {
      resolveArtifactPreview(token: string) {
        if (token !== 'valid') throw new Error('invalid')
        return { filePath, expiresAt: new Date(Date.now() + 60_000).toISOString() }
      },
    }
    const server = await startArtifactPreviewHttpServer(service as never)
    closes.push(server.close)

    const valid = await fetch(`http://127.0.0.1:${server.port}/production-preview?preview=valid`, { headers: { Range: 'bytes=2-4' } })
    expect(valid.status).toBe(206)
    expect(valid.headers.get('access-control-allow-origin')).toBe('*')
    expect(valid.headers.get('cache-control')).toBe('private, no-store')
    expect(await valid.text()).toBe('234')

    await expect(fetch(`http://127.0.0.1:${server.port}/production-preview`).then((response) => response.status)).resolves.toBe(404)
    await expect(fetch(`http://127.0.0.1:${server.port}/production-preview?preview=forged`).then((response) => response.status)).resolves.toBe(404)
  })

  it('serves a canvas-asset preview token via the same endpoint when production resolution declines (交付④)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-preview-http-asset-'))
    roots.push(root)
    const filePath = path.join(root, 'gen.png')
    fs.writeFileSync(filePath, 'ABCDE')
    const service = {
      // production 解析对 asset token 抛（kind 不符）。
      resolveArtifactPreview(token: string) {
        if (token === 'asset-tok') throw new Error('Preview token kind mismatch')
        throw new Error('invalid')
      },
      // 同一 server 增设 asset 解析器（真实由 App 层用 resolveProjectRelativePath 注入）。
      resolveAssetPreview(token: string) {
        if (token !== 'asset-tok') throw new Error('invalid')
        return { filePath, expiresAt: new Date(Date.now() + 60_000).toISOString() }
      },
    }
    const server = await startArtifactPreviewHttpServer(service as never)
    closes.push(server.close)

    const res = await fetch(`http://127.0.0.1:${server.port}/production-preview?preview=asset-tok`)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.text()).toBe('ABCDE')

    // 两个解析器都拒的 token → 404（fail-closed）。
    await expect(fetch(`http://127.0.0.1:${server.port}/production-preview?preview=nope`).then((r) => r.status)).resolves.toBe(404)
  })
})
