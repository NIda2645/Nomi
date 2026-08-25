import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  mintAssetPreviewUrl,
  verifyAssetPreviewToken,
  setArtifactPreviewHttpOrigin,
  verifyArtifactPreviewHandle,
  createArtifactProjection,
} from './artifactProjection'
import type { ProductionArtifact, ProductionRun } from './productionRunTypes'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  setArtifactPreviewHttpOrigin(null)
})

describe('canvas-asset 签名预览 token（交付④ · 复用同一 HMAC / 同一 server，不建第二套）', () => {
  it('可 mint 时给出 http://127.0.0.1/production-preview?preview=<token> 签名短链', () => {
    setArtifactPreviewHttpOrigin('http://127.0.0.1:54321')
    const minted = mintAssetPreviewUrl({
      projectId: 'p1',
      relativePath: 'assets/gen/a.png',
      secret: 'sekret',
      nowMs: 1_000,
      ttlMs: 60_000,
    })
    expect(minted).not.toBeNull()
    expect(minted!.url).toMatch(/^http:\/\/127\.0\.0\.1:54321\/production-preview\?preview=/)
    expect(minted!.expiresAt).toBe(new Date(61_000).toISOString())
    // verify 回读 → 拿到项目 id + 相对路径（无 run/artifact）。
    const claims = verifyAssetPreviewToken({ token: minted!.token, secret: 'sekret', nowMs: 30_000 })
    expect(claims).toMatchObject({ projectId: 'p1', relativePath: 'assets/gen/a.png' })
  })

  it('无 HTTP origin（server 未起）：mint 返回 null（调用方回退 nomi-local://）', () => {
    setArtifactPreviewHttpOrigin(null)
    const minted = mintAssetPreviewUrl({ projectId: 'p1', relativePath: 'assets/a.png', secret: 's', nowMs: 1 })
    expect(minted).toBeNull()
  })

  it('过期 token 被拒', () => {
    setArtifactPreviewHttpOrigin('http://127.0.0.1:1')
    const minted = mintAssetPreviewUrl({ projectId: 'p1', relativePath: 'assets/a.png', secret: 's', nowMs: 0, ttlMs: 10_000 })
    expect(() => verifyAssetPreviewToken({ token: minted!.token, secret: 's', nowMs: 10_001 })).toThrow(/expired/i)
  })

  it('签名被篡改/换密钥：拒', () => {
    setArtifactPreviewHttpOrigin('http://127.0.0.1:1')
    const minted = mintAssetPreviewUrl({ projectId: 'p1', relativePath: 'assets/a.png', secret: 'right', nowMs: 0 })
    expect(() => verifyAssetPreviewToken({ token: minted!.token, secret: 'wrong', nowMs: 1 })).toThrow(/signature/i)
  })

  it('路径越界/供应商 URL：mint 期即拒（严格，不放宽）', () => {
    setArtifactPreviewHttpOrigin('http://127.0.0.1:1')
    for (const bad of ['../x.png', 'assets/../../x.png', '/etc/passwd', 'https://evil/x.png']) {
      expect(() => mintAssetPreviewUrl({ projectId: 'p1', relativePath: bad, secret: 's', nowMs: 0 })).toThrow(/path|relative|provider/i)
    }
  })

  it('asset token 不能冒充 production run-artifact token（判别位隔离）', () => {
    setArtifactPreviewHttpOrigin('http://127.0.0.1:1')
    const minted = mintAssetPreviewUrl({ projectId: 'p1', relativePath: 'assets/a.png', secret: 's', nowMs: 0 })
    // 用 production 校验器读 asset token → 必须拒（kind 不符），不能穿过去解析成 run 产物。
    expect(() => verifyArtifactPreviewHandle({ token: minted!.token, secret: 's', nowMs: 1 })).toThrow()
  })

  it('production run-artifact token 不能被 asset 校验器接受（反向隔离）', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-asset-token-'))
    roots.push(root)
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(root, 'assets', 'frame.png'), 'bytes')
    const artifact: ProductionArtifact = {
      artifactId: 'artifact-1', stageId: 'storyboard', kind: 'image', status: 'ready',
      projectRelativePath: 'assets/frame.png', createdAt: '2026-08-08T10:00:00.000Z',
    }
    const run = { runId: 'run-1', projectId: 'project-1', artifacts: [artifact] } as ProductionRun
    const projection = createArtifactProjection({ projectRoot: root, run, artifact, secret: 's', nowMs: 10 })
    expect(() => verifyAssetPreviewToken({ token: projection.preview!.token, secret: 's', nowMs: 11 })).toThrow()
  })
})
