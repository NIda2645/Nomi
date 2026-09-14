// 反馈回路的**唯一**出站口。三种货物（用量事件 / Agent 轨迹 / 一键反馈）都从这里走。
//
// 2026-09-15：这份文件替掉了 `aptabaseAdapter.ts`（P1 加新必删旧）。
// 为什么不继续用 Aptabase（它的隐私姿态恰恰是同类里最干脆的，理由不是它不好）：
//
//   用量事件是 5 个名字 + 枚举 props，「我们不收别的」是**肉眼可验**的；
//   这一版开始收 Agent 轨迹，「不收别的」就变成一句**只能靠承诺的话**。
//   一句只能靠承诺的话，不能让第三方进程替我们说。
//
// 所以传输这一格自建（`infra/feedback-worker/`），而白名单校验、同意合同、脱敏、
// 落盘发件箱全部沿用仓库里 2026-09-06 就建好的那套，一行没重写。
//
// 与 `telemetrySettings.ts` 的分工：那份管**用户同意了没有**（合同、时间、匿名会话 id），
// 这份管**东西往哪发**（端点、令牌、超时）。两件事会各自独立变化——换域名不该碰同意合同，
// 改同意语义不该碰 HTTP——所以不合在一个文件里。
import { appFetch } from '../appFetch'

/** 接收端的三条路由。写成联合类型而不是 string：新增一条货物必须来这里登记一次。 */
export type IntakeRoute = '/v1/events' | '/v1/trajectories' | '/v1/feedback'

export type IntakeResult = {
  /** 只有 /v1/feedback 会给：用户能口述的编号 NF-MMDD-NNNN。 */
  id?: string
  /** 接收端的主键（uuid）。排查时用它精确定位一条。 */
  ref?: string
  accepted?: number
}

export type IntakeFetch = typeof globalThis.fetch

const DEFAULT_TIMEOUT_MS = 8_000

/**
 * 令牌。**它不是密钥，是发布令牌**——随打好的 App 一起发出去，解包就能拿到。
 * 它挡的是随手扫到这个 URL 的机器人，不是定向滥用；所以接收端只能写、不能读/列/删
 * （见 `infra/feedback-worker/README.md` 的「三条要诚实说清的事」）。
 * 任何地方都不要把它说成「已鉴权」。
 */
export function intakeToken(): string {
  return String(process.env.NOMI_INTAKE_TOKEN || '').trim()
}

/**
 * 端点基址。**只认 https**：这三种货物里有工具名、模型 id 和用户勾选带上的文稿，
 * 明文 http 等于把它们交给路上任何人。配了 http 就当没配——静默降级成「只在本机记录」，
 * 比「照发但不加密」诚实。
 */
export function intakeEndpoint(): string | null {
  const configured = String(process.env.NOMI_INTAKE_ENDPOINT || '').trim().replace(/\/+$/, '')
  if (!configured) return null
  return /^https:\/\//i.test(configured) ? configured : null
}

/** 端点和令牌都得有。缺一个就是「未配置」——设置页据此显示「只在本机记录」。 */
export function intakeConfigured(): boolean {
  return intakeEndpoint() !== null && intakeToken().length > 0
}

/**
 * 发一份货物。成功回接收端给的 `{id?, ref?, accepted?}`，失败抛——**调用方负责入队重试**，
 * 这里不自己重试：重试策略在三种货物上不一样（用量攒批、反馈立刻发），
 * 塞进传输层就得长出分支，而分支正是「哪条路没重试」这种 bug 的住处。
 */
export async function postIntake(
  route: IntakeRoute,
  payload: unknown,
  deps: { fetch?: IntakeFetch; endpoint?: string | null; token?: string; timeoutMs?: number } = {},
): Promise<IntakeResult> {
  const endpoint = deps.endpoint === undefined ? intakeEndpoint() : deps.endpoint
  const token = deps.token ?? intakeToken()
  if (!endpoint || !token) throw new Error('Nomi intake endpoint is not configured')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const response = await (deps.fetch ?? appFetch)(`${endpoint}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      // 反馈回路永远不该带 cookie：带了就等于给了一个跨请求可关联的身份，
      // 而我们对用户说的是「匿名」。
      credentials: 'omit',
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Nomi intake HTTP ${response.status}`)
    // 接收端回的是 JSON，但网关/代理可能插一页 HTML。解不出来不算失败——
    // 200 已经说明收到了，编号拿不到只是少一个把手。
    try {
      const body: unknown = await response.json()
      if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
      const record = body as Record<string, unknown>
      return {
        ...(typeof record.id === 'string' ? { id: record.id } : {}),
        ...(typeof record.ref === 'string' ? { ref: record.ref } : {}),
        ...(Number.isInteger(record.accepted) ? { accepted: Number(record.accepted) } : {}),
      }
    } catch {
      return {}
    }
  } finally {
    clearTimeout(timer)
  }
}
