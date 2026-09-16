import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDesktopBridge } from '../../../desktop/bridge'
import type { GenerationNodeResult } from '../model/generationCanvasTypes'
import { isRemoteHttpUrl, localizeRemoteResultUrl } from './resultAssetLocalization'

vi.mock('../../../desktop/bridge', () => ({ getDesktopBridge: vi.fn() }))
const mockedBridge = vi.mocked(getDesktopBridge)

function bridgeWithImport(importRemoteUrl: ReturnType<typeof vi.fn>) {
  return { assets: { importRemoteUrl } } as unknown as ReturnType<typeof getDesktopBridge>
}

function videoResult(url: string, overrides: Partial<GenerationNodeResult> = {}): GenerationNodeResult {
  return { id: 'r1', type: 'video', url, createdAt: 1, ...overrides }
}

describe('isRemoteHttpUrl', () => {
  it('只认 http(s)——nomi-local / file / 空一律 false', () => {
    expect(isRemoteHttpUrl('https://cdn.vendor/x.mp4')).toBe(true)
    expect(isRemoteHttpUrl('http://cdn.vendor/x.mp4')).toBe(true)
    expect(isRemoteHttpUrl('nomi-local://asset/p/x.mp4')).toBe(false)
    expect(isRemoteHttpUrl('file:///x.mp4')).toBe(false)
    expect(isRemoteHttpUrl('')).toBe(false)
    expect(isRemoteHttpUrl(undefined)).toBe(false)
  })
})

describe('localizeRemoteResultUrl — 厂商临时 URL 落地结构闸', () => {
  beforeEach(() => {
    mockedBridge.mockReset()
  })

  it('nomi-local 结果 → 原样返回，绝不调 bridge（主进程已本地化时的零开销 no-op）', async () => {
    const importRemoteUrl = vi.fn()
    mockedBridge.mockReturnValue(bridgeWithImport(importRemoteUrl))
    const result = videoResult('nomi-local://asset/p/assets/generated/v.mp4')
    expect(await localizeRemoteResultUrl(result, 'proj-1', 'node-1')).toBe(result)
    expect(importRemoteUrl).not.toHaveBeenCalled()
  })

  it('http 结果 + projectId → 下载落地，换本地 url，原 CDN 进 providerUrl', async () => {
    const importRemoteUrl = vi.fn().mockResolvedValue({
      ok: true,
      asset: { id: 'asset-9', data: { url: 'nomi-local://asset/proj-1/assets/generated/v.mp4' } },
    })
    mockedBridge.mockReturnValue(bridgeWithImport(importRemoteUrl))
    const out = await localizeRemoteResultUrl(videoResult('https://cdn.vendor/v.mp4'), 'proj-1', 'node-1')
    expect(out.url).toBe('nomi-local://asset/proj-1/assets/generated/v.mp4')
    expect(out.providerUrl).toBe('https://cdn.vendor/v.mp4')
    expect(out.assetId).toBe('asset-9')
    expect(importRemoteUrl).toHaveBeenCalledWith({
      projectId: 'proj-1',
      url: 'https://cdn.vendor/v.mp4',
      kind: 'generated',
      ownerNodeId: 'node-1',
    })
  })

  it('已有 providerUrl → 不覆盖（保住原始来源）', async () => {
    const importRemoteUrl = vi.fn().mockResolvedValue({ ok: true, asset: { data: { url: 'nomi-local://asset/p/v.mp4' } } })
    mockedBridge.mockReturnValue(bridgeWithImport(importRemoteUrl))
    const out = await localizeRemoteResultUrl(
      videoResult('https://cdn.vendor/v.mp4', { providerUrl: 'https://origin/real.mp4' }),
      'proj-1',
      'node-1',
    )
    expect(out.providerUrl).toBe('https://origin/real.mp4')
  })

  it('projectId 空（headless/首启窗口）→ 原样返回，不硬塞', async () => {
    const importRemoteUrl = vi.fn()
    mockedBridge.mockReturnValue(bridgeWithImport(importRemoteUrl))
    const result = videoResult('https://cdn.vendor/v.mp4')
    expect(await localizeRemoteResultUrl(result, '', 'node-1')).toBe(result)
    expect(importRemoteUrl).not.toHaveBeenCalled()
  })

  it('下载失败（URL 已过期/网络）→ 保持原样，绝不阻断（守卫诚实报错）', async () => {
    const importRemoteUrl = vi.fn().mockRejectedValue(new Error('403 expired'))
    mockedBridge.mockReturnValue(bridgeWithImport(importRemoteUrl))
    const result = videoResult('https://cdn.vendor/expired.mp4')
    expect(await localizeRemoteResultUrl(result, 'proj-1', 'node-1')).toBe(result)
  })

  it('structured stale-project rejection retains the original result without fabricating a local URL', async () => {
    const importRemoteUrl = vi.fn().mockResolvedValue({ ok: false, failure: { code: 'project_binding_stale', reason: 'import-failed' } })
    mockedBridge.mockReturnValue(bridgeWithImport(importRemoteUrl))
    const result = videoResult('https://cdn.vendor/v.mp4')
    expect(await localizeRemoteResultUrl(result, 'proj-1', 'node-1')).toBe(result)
  })

  it('无桌面环境（bridge/importRemoteUrl 缺）→ 原样返回', async () => {
    mockedBridge.mockReturnValue(undefined as unknown as ReturnType<typeof getDesktopBridge>)
    const result = videoResult('https://cdn.vendor/v.mp4')
    expect(await localizeRemoteResultUrl(result, 'proj-1', 'node-1')).toBe(result)
  })
})
