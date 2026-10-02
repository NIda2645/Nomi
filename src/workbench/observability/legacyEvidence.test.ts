import { describe, expect, it } from 'vitest'
import { classifyGenerationError } from './classifyError'
import i18n from '../../i18n'

/**
 * 失败分类的「证据」不能是我们自己写的字（2026-09-30 pb07 真机走查抓出）。
 *
 * 病：legacy 关键词嗅探读整句 raw，而 raw 里有一大半是主进程拼的诊断外壳——供应商键、方法、带随机端口 / 任务 id
 * 的 URL。'401' / '402' / '429' 三个裸子串于是从 `127.0.0.1:59401` 这样的端口里读出「API Key 无效」，
 * 给一条供应商说了「我认不出」的失败（418 + 自由文本）编了个原因。走查里同一条脚本中文过、英文红——
 * 只因为两次跑随机到的端口不同。
 *
 * 判据只读它认得出来源的话：结构化载荷的 upstreamMsg / 异步任务失败格式里的原话；来源不明的老串整句读，
 * 但先抠掉 URL，状态码只认独立的词。
 */
const structuredMessage = (structured: Record<string, unknown>, tail: string) =>
  `Error: NOMI_VENDOR_ERR_B64::${Buffer.from(JSON.stringify(structured), 'utf8').toString('base64')}:: ${tail}`

const UNRECOGNIZED = 'The render farm returned an unrecognised state after the third checkpoint.'
/** 认不出的失败里，这些「原因」一个都不许出现。 */
const INVENTED_CAUSE = /API Key|密钥|余额|额度|限流|Invalid API key|insufficient|quota|balance|rate.?limit/i

// 端口 / 路径 / 任务 id 里碰巧连着的三个字符：401（鉴权）、402（余额）、429（限流）。
const HAZARD_URLS = [
  'http://127.0.0.1:59401/v1/images/generations',
  'http://127.0.0.1:40233/v1/images/generations',
  'http://127.0.0.1:42933/v1/images/generations',
  'https://api.example.com/v1/tasks/5c1429ab',
  'https://api.example.com/v1/jobs/recordInfo?taskId=task_a4029b',
] as const

const providerFailure = (url: string, words: string, extra: Record<string, unknown> = {}) =>
  structuredMessage(
    { vendorKey: 'agent-runtime-loopback', httpStatus: 418, category: 'unknown', upstreamMsg: words, ...extra },
    `Provider request failed (HTTP 418) at agent-runtime-loopback POST ${url}: ${words}`,
  )

describe('结构化失败：外壳里的 URL / 端口 / id 不是证据', () => {
  it.each(HAZARD_URLS)('418 + 认不出的话 + URL=%s → 仍是 unknown，没被配上鉴权 / 余额 / 限流', (url) => {
    const report = classifyGenerationError(providerFailure(url, UNRECOGNIZED, { upstreamCode: 'render_farm_state' }))
    expect(report.kind).toBe('unknown')
    expect(report.hint).toContain('没能认出这次失败的原因')
    expect(report.hint).toContain('render_farm_state')
    expect(`${report.reason}${report.hint}`).not.toMatch(INVENTED_CAUSE)
    expect(report.primary).not.toBe('open-model-access')
  })

  it.each(HAZARD_URLS)('unknown 的三个出口都一样（URL=%s）：话是界面语言 / 不是界面语言 / 根本没有话', (url) => {
    const inUiLanguage = classifyGenerationError(providerFailure(url, '当前模型排队人数过多，请等一会儿再来'))
    const outOfUiLanguage = classifyGenerationError(providerFailure(url, UNRECOGNIZED))
    const noWords = classifyGenerationError(
      structuredMessage({ vendorKey: 'x', httpStatus: 418, category: 'unknown' }, `Provider request failed (HTTP 418) at x POST ${url}: (no detail from provider)`),
    )
    for (const report of [inUiLanguage, outOfUiLanguage, noWords]) {
      expect(report.kind).toBe('unknown')
      expect(`${report.reason}${report.hint}`).not.toMatch(INVENTED_CAUSE)
    }
  })

  it('英文界面同样：不读外壳', async () => {
    await i18n.changeLanguage('en')
    try {
      const report = classifyGenerationError(providerFailure(HAZARD_URLS[0], UNRECOGNIZED, { upstreamCode: 'render_farm_state' }))
      expect(report.kind).toBe('unknown')
      expect(report.hint).toContain('will not guess')
      expect(`${report.reason}${report.hint}`).not.toMatch(INVENTED_CAUSE)
    } finally {
      await i18n.changeLanguage('zh-CN')
    }
  })

  it('供应商自己的话里写了 401 / 402 / 429 → 仍然认（原话才是证据，没有矫枉过正）', () => {
    const url = 'https://api.example.com/v1/x'
    expect(classifyGenerationError(providerFailure(url, 'HTTP 401 Unauthorized: token expired')).kind).toBe('auth')
    expect(classifyGenerationError(providerFailure(url, 'error 402 payment required')).kind).toBe('balance')
    expect(classifyGenerationError(providerFailure(url, 'slow down: 429 too many requests')).kind).toBe('quota')
    expect(classifyGenerationError(providerFailure(url, 'Invalid API key provided')).kind).toBe('auth')
  })

  it('供应商键带三位数字（用户自己起的名字）+ 每种形状的话 → 外壳里的键不算证据', () => {
    for (const vendorKey of ['relay-402', 'my-401-proxy', 'gw_429']) {
      const message = structuredMessage(
        { vendorKey, httpStatus: 418, category: 'unknown', upstreamMsg: UNRECOGNIZED },
        `Provider request failed (HTTP 418) at ${vendorKey} POST https://relay.example.com/v1/x: ${UNRECOGNIZED}`,
      )
      const report = classifyGenerationError(message)
      expect(report.kind, vendorKey).toBe('unknown')
      expect(`${report.reason}${report.hint}`).not.toMatch(INVENTED_CAUSE)
    }
  })
})

describe('异步任务失败格式：`<原话> (taskId=…, kind=…)` 里的 id 不是证据', () => {
  it('id 里连着 402 / 429 / 401，原话认不出 → unknown', () => {
    for (const id of ['task_4029ab', 'a42933', 'job-59401', 'task-402-x', 'job:429', 'run-401']) {
      const report = classifyGenerationError(`${UNRECOGNIZED} (taskId=${id}, kind=image)`)
      expect(report.kind, id).toBe('unknown')
      expect(`${report.reason}${report.hint}`).not.toMatch(INVENTED_CAUSE)
    }
  })

  it('原话里写了什么就认什么', () => {
    expect(classifyGenerationError('The gateway said 429 Too Many Requests (taskId=x, kind=video)').kind).toBe('quota')
    expect(classifyGenerationError('insufficient balance (taskId=x, kind=video)').kind).toBe('balance')
  })

  it('我们自己的兜底句（供应商没说话）→ 没有证据，不读 id', () => {
    const report = classifyGenerationError('模型任务执行失败 (taskId=task_4029ab, kind=video)')
    expect(report.kind).toBe('unknown')
  })
})

describe('来源不明的老串（老项目持久化的 node.error / 非 vendor 错误）：整句读，但抠掉 URL、状态码只认独立的词', () => {
  it.each(HAZARD_URLS)('URL 里的数字不算证据（%s）', (url) => {
    const report = classifyGenerationError(`request to ${url} went sideways`)
    expect(report.kind).toBe('unknown')
    expect(`${report.reason}${report.hint}`).not.toMatch(INVENTED_CAUSE)
  })

  it.each([
    ['HTTP 401 Unauthorized', 'auth'],
    ['401', 'auth'],
    ['Request failed with status code 401.', 'auth'],
    ['status=401', 'auth'],
    ['(HTTP 402)', 'balance'],
    ['error: 402 payment required', 'balance'],
    ['Request failed with status code 429', 'quota'],
    ['code 429: too many', 'quota'],
  ] as const)('独立的状态码照认：%s → %s', (raw, kind) => {
    expect(classifyGenerationError(raw).kind).toBe(kind)
  })

  it.each([
    'request id req_4029x failed',
    'port 8402 is busy',
    'job 14293 not finished',
    'host 10.0.0.401 unreachable',
    'checksum a401b',
    'vendor error code 4029 from gateway',
    'job #4011 not finished',
    'business code 42901 returned',
  ])('嵌在别的数字 / 标识里的三个字符不算：%s → unknown', (raw) => {
    expect(classifyGenerationError(raw).kind).toBe('unknown')
  })

  it('URL 里整段的路径 / 端口 / 主机名也不算：只有抠掉 URL 才防得住（整词匹配防不住）', () => {
    for (const raw of [
      'GET https://httpbin.org/status/429 failed',
      'GET https://docs.example.com/errors/402 failed',
      'POST http://127.0.0.1:401/x failed',
      'https://network.example.com/v1 failed',
      'GET https://api.example.com/v1/models/gpt-x returned 404 Not Found',
    ]) {
      const report = classifyGenerationError(raw)
      expect(report.kind, raw).toBe('unknown')
      expect(`${report.reason}${report.hint}`).not.toMatch(INVENTED_CAUSE)
    }
  })

  it('URL 之外的文字照读：带 URL 的老串，原话里的真因仍然认', () => {
    expect(classifyGenerationError('POST https://api.example.com/v1/x failed: Unauthorized').kind).toBe('auth')
    expect(classifyGenerationError('POST http://127.0.0.1:59401/v1/x failed: insufficient balance').kind).toBe('balance')
    expect(classifyGenerationError('POST http://127.0.0.1:59401/v1/x failed: fetch failed').kind).toBe('network')
  })

  it('只有 {code, reason} 的载荷（主进程给带 code + reason 的错误加的标记，没有原话字段）也是来源不明：整句读，认得出的词照认', () => {
    const tagged = (tail: string) => structuredMessage({ code: 'some_code', reason: 'some_reason' }, tail)
    expect(classifyGenerationError(tagged('connect ECONNREFUSED 127.0.0.1:59401')).kind).toBe('network')
    expect(classifyGenerationError(tagged('HTTP 401 Unauthorized')).kind).toBe('auth')
    expect(classifyGenerationError(tagged('odd thing at http://127.0.0.1:59401/v1/x')).kind).toBe('unknown')
  })
})
