import { afterEach, describe, expect, it, vi } from 'vitest'
import { intakeConfigured, intakeEndpoint, intakeToken, postIntake } from './intakeClient'

const ORIGINAL = { endpoint: process.env.NOMI_INTAKE_ENDPOINT, token: process.env.NOMI_INTAKE_TOKEN }

afterEach(() => {
  process.env.NOMI_INTAKE_ENDPOINT = ORIGINAL.endpoint
  process.env.NOMI_INTAKE_TOKEN = ORIGINAL.token
  if (ORIGINAL.endpoint === undefined) delete process.env.NOMI_INTAKE_ENDPOINT
  if (ORIGINAL.token === undefined) delete process.env.NOMI_INTAKE_TOKEN
})

describe('intake endpoint 解析', () => {
  it('没配就是 null，设置页据此显示「只在本机记录」', () => {
    delete process.env.NOMI_INTAKE_ENDPOINT
    expect(intakeEndpoint()).toBeNull()
    expect(intakeConfigured()).toBe(false)
  })

  it('明文 http 当没配 —— 照发但不加密比降级更糟', () => {
    process.env.NOMI_INTAKE_ENDPOINT = 'http://intake.example'
    process.env.NOMI_INTAKE_TOKEN = 'token'
    expect(intakeEndpoint()).toBeNull()
    expect(intakeConfigured()).toBe(false)
  })

  it('尾斜杠剥干净，避免拼出 //v1/events', () => {
    process.env.NOMI_INTAKE_ENDPOINT = 'https://intake.example///'
    expect(intakeEndpoint()).toBe('https://intake.example')
  })

  it('端点有、令牌空 = 未配置（缺一个都发不出去）', () => {
    process.env.NOMI_INTAKE_ENDPOINT = 'https://intake.example'
    process.env.NOMI_INTAKE_TOKEN = '   '
    expect(intakeToken()).toBe('')
    expect(intakeConfigured()).toBe(false)
  })
})

describe('postIntake', () => {
  it('未配置时抛，不静默丢货', async () => {
    await expect(postIntake('/v1/events', { events: [] }, { endpoint: null, token: '' })).rejects.toThrow(/not configured/)
  })

  it('带 bearer、不带 cookie、路由拼在基址后面', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, ref: 'r1' }), { status: 200 }))
    const result = await postIntake('/v1/trajectories', { turn: 1 }, { fetch: fetch as never, endpoint: 'https://intake.example', token: 'tok' })
    expect(result).toEqual({ ref: 'r1' })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://intake.example/v1/trajectories')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
    // 带 cookie 就等于给了一个跨请求可关联的身份，而我们对用户说的是「匿名」。
    expect(init.credentials).toBe('omit')
    expect(init.body).toBe(JSON.stringify({ turn: 1 }))
  })

  it('反馈那条把编号带回来给用户引用', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 'NF-0915-0042', ref: 'r2' }), { status: 200 }))
    const result = await postIntake('/v1/feedback', {}, { fetch: fetch as never, endpoint: 'https://intake.example', token: 'tok' })
    expect(result).toEqual({ id: 'NF-0915-0042', ref: 'r2' })
  })

  it('非 2xx 抛，让调用方入队重试', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 503 }))
    await expect(postIntake('/v1/events', {}, { fetch: fetch as never, endpoint: 'https://intake.example', token: 'tok' }))
      .rejects.toThrow(/HTTP 503/)
  })

  it('200 但回的不是 JSON（网关插了一页 HTML）算成功 —— 收到了，只是少一个把手', async () => {
    const fetch = vi.fn(async () => new Response('<html>ok</html>', { status: 200 }))
    await expect(postIntake('/v1/events', {}, { fetch: fetch as never, endpoint: 'https://intake.example', token: 'tok' }))
      .resolves.toEqual({})
  })

  it('回了数组或字符串也不炸，当空结果', async () => {
    for (const body of ['[]', '"done"', 'null']) {
      const fetch = vi.fn(async () => new Response(body, { status: 200 }))
      await expect(postIntake('/v1/events', {}, { fetch: fetch as never, endpoint: 'https://intake.example', token: 'tok' }))
        .resolves.toEqual({})
    }
  })

  it('超时会 abort（不许一个挂住的请求把后续都堵死）', async () => {
    const fetch = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    await expect(postIntake('/v1/events', {}, { fetch: fetch as never, endpoint: 'https://intake.example', token: 'tok', timeoutMs: 1 }))
      .rejects.toThrow(/abort/i)
  })
})
