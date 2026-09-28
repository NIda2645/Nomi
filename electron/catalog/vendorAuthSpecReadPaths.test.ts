// 一把 key，一份鉴权说法 —— 读路与写路必须拼出同一个 Authorization 头。
//
// 2026-09-18 为 Higgsfield 的 `Authorization: Key id:secret` 加了 vendor.authScheme，写路收全了，
// 读路（接入向导列模型 / 模型发现 / 凭证页测连接）三处在拼头时少传最后一个实参——同一把 key
// 生成能跑、列模型 401，用户看到的是「key 是对的啊，生成都能跑，这里怎么说连不上」。
//
// 这条测试钉的不是那三处各自补没补，而是**这件事只有一个答案**：
// ① 行为：Higgsfield 式 scheme 与缺省 Bearer 两种连接，在 existingConnection 与模型发现两条读路上
//    出站头与生成路逐字相同；② 结构：electron/ 里所有 authHeaders/authQueryParams 调用点的第一个实参
//    都必须来自 vendorAuthSpec / connectionAuthSpec / 一个 VendorAuthSpec 值，不许有人现拼一份。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import { authHeaders } from '../ai/requestPipeline'
import { vendorAuthSpec } from './vendorAuthSpec'
import type { Vendor } from './types'

const HIGGSFIELD: Vendor = {
  key: 'higgsfield',
  name: 'Higgsfield',
  enabled: true,
  hasApiKey: true,
  baseUrlHint: 'https://platform.higgsfield.ai/v1',
  authType: 'bearer',
  authScheme: 'Key',
  providerKind: 'openai-compatible',
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-18T00:00:00.000Z',
} as Vendor

const PLAIN_BEARER: Vendor = { ...HIGGSFIELD, key: 'relay', name: 'Relay', authScheme: undefined } as Vendor

const KEY = 'id-123:secret-456'

describe('鉴权方案词：读路与写路同一个答案', () => {
  it('vendorAuthSpec 把声明的方案词带进头；没声明的仍是 Bearer（既有供应商零变化）', () => {
    expect(authHeaders(vendorAuthSpec(HIGGSFIELD), KEY)).toEqual({ Authorization: `Key ${KEY}` })
    expect(authHeaders(vendorAuthSpec(PLAIN_BEARER), KEY)).toEqual({ Authorization: `Bearer ${KEY}` })
  })

  it('接入向导「列出这家的模型」把整份鉴权说法交给传输层（原来这里没有方案词的位置）', async () => {
    const { createExistingConnectionActions } = await import('../providerAdapter/existingConnection')
    for (const [vendor, expected] of [[HIGGSFIELD, `Key ${KEY}`], [PLAIN_BEARER, `Bearer ${KEY}`]] as const) {
      const fetchModels = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, models: ['m-1'], statuses: [200] }))
      const actions = createExistingConnectionActions({
        readCatalog: () => ({
          version: 8,
          vendors: [vendor],
          models: [],
          mappings: [],
          apiKeysByVendor: {
            [vendor.key]: {
              vendorKey: vendor.key, apiKey: 'encrypted', enabled: true, enc: 'safeStorage',
              createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
            },
          },
        }) as never,
        decryptApiKey: () => KEY,
        fetchModels,
        startAdapter: (() => { throw new Error('unused') }) as never,
        getAdapterRun: () => undefined,
      })
      const result = await actions.listModels({ vendorKey: vendor.key })
      expect(result).toMatchObject({ ok: true })
      const passed = fetchModels.mock.calls[0]?.[0] as unknown as { auth: Parameters<typeof authHeaders>[0]; apiKey: string }
      // 关键：传下去的是整份说法，所以传输层拼出来的头与生成路逐字相同。
      expect(authHeaders(passed.auth, passed.apiKey)).toEqual({ Authorization: expected })
    }
  })

  it('模型发现（接入会话）从已保存的连接取方案词，而不是从会话配置现拼', async () => {
    vi.resetModules()
    vi.doMock('./catalogStore', () => ({
      readCatalog: () => ({ version: 8, vendors: [HIGGSFIELD], models: [], mappings: [], apiKeysByVendor: {} }),
      normalizeProviderKind: (value: string) => value || 'openai-compatible',
      extractVendorExtraHeaders: () => ({}),
    }))
    vi.doMock('./catalogCommit', () => ({ deriveVendorKeyFromBaseUrl: () => 'higgsfield' }))
    vi.doMock('../i18n', () => ({ desktopT: (key: string) => key }))
    const { discoverHttpCandidates } = await import('../integrationCertification/httpModelDiscovery')
    const discoverHttpModels = vi.fn(async (..._args: unknown[]) => [] as unknown[])
    await discoverHttpCandidates({
      session: { config: { baseUrl: HIGGSFIELD.baseUrlHint, providerKind: 'openai-compatible', authType: 'bearer' } } as never,
      certification: { discoverHttpModels } as never,
      credentialResolver: () => KEY,
    })
    const passed = discoverHttpModels.mock.calls[0]?.[0] as unknown as {
      auth: Parameters<typeof authHeaders>[0]
      headers: Record<string, string>
    }
    expect(passed.headers.Authorization).toBe(`Key ${KEY}`)
    expect(authHeaders(passed.auth, KEY)).toEqual({ Authorization: `Key ${KEY}` })
    vi.doUnmock('./catalogStore')
    vi.doUnmock('./catalogCommit')
    vi.doUnmock('../i18n')
    vi.resetModules()
  })

  it('结构：没有第二处自己拼鉴权头的（所有调用点的鉴权说法都来自同一个 owner）', () => {
    const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const OWNER = path.join('ai', 'requestPipeline.ts')
    const SPEC_OWNER = path.join('catalog', 'vendorAuthSpec.ts')
    // 允许的鉴权说法来源：单一 owner 的两个派生入口，或一个已经是 VendorAuthSpec 的值。
    const APPROVED = /^(vendorAuthSpec\(|connectionAuthSpec\(|savedConnectionAuth\(|auth\b|spec\b|input\.auth\b|\{ \.\.\.vendorAuthSpec\()/
    /**
     * 「由一条已保存的连接拼出站鉴权头」这件事只住在 requestPipeline。这三棵子树是那件事的全部现场
     * （接入/探测/自检/列模型）；供应商档案里的 `Authorization: "Bearer {{user_api_key}}"` 是**声明**
     * 不是拼头——它由模板引擎渲染并按设计覆盖 authHeaders（见 requestPipeline 的注释），不在此列。
     */
    const AUTH_ROOTS = ['ai', 'integrationCertification', 'providerAdapter']
    const HEADER_LITERAL = /[Aa]uthorization\s*:\s*[`"'](?!\s*\{\{)/
    const specOffenders: string[] = []
    const literalOffenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) { walk(full); continue }
        if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue
        const relative = path.relative(electronRoot, full)
        if (relative === OWNER || relative === SPEC_OWNER) continue
        const inAuthRoot = AUTH_ROOTS.some((root) => relative.startsWith(`${root}${path.sep}`))
        fs.readFileSync(full, 'utf8').split('\n').forEach((line, index) => {
          if (line.trim().startsWith('*') || line.trim().startsWith('//')) return
          const call = /\b(?:authHeaders|authQueryParams|buildAuthQueryParams)\(([^)]*)/.exec(line)
          if (call && !line.includes('function ') && !line.includes('import ') && !line.includes('export {')) {
            const firstArg = call[1].trim()
            if (firstArg && !APPROVED.test(firstArg)) specOffenders.push(`${relative}:${index + 1} ${firstArg.slice(0, 60)}`)
          }
          if (inAuthRoot && HEADER_LITERAL.test(line) && !line.includes('user_api_key')) {
            literalOffenders.push(`${relative}:${index + 1} ${line.trim().slice(0, 80)}`)
          }
        })
      }
    }
    walk(electronRoot)
    expect(specOffenders).toEqual([])
    // 接入/探测/自检这三棵子树里，requestPipeline 之外一处手写 Authorization 都不许有（零基线）。
    expect(literalOffenders).toEqual([])
  })
})
