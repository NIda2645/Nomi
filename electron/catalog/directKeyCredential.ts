// 内置供应商凭据的验证与发布 —— 2026-09-10 走查反馈回归修复（第二刀：从 apimart 一家扩到整类）。
//
// 根因（docs/plan/2026-09-10-ux-feedback-triage.md §5）：direct-key 供应商（apimart）
// 的设计契约是「填 key 即解锁全部预置模型」，但两道门把它拦死：
//   ① 验证用 `GET /v1/models` 的可达性当 key 有效性判据，而 apimart 对该端点回 401
//     （vendorBaseFallback.ts 有注释确认）→ 存 key 转圈 12s 后报「验证失败」；
//   ② 渲染层 key 写入强制 `enabled:false` + `verificationPending`，凭据停用又把
//     vendor 整体 de-publish → 模型从选择器和 agent 可用清单里全部消失。
// key 明明能用（直连生成没问题），目录却藏着——名实不一的假阴性。
//
// 本文件给出 direct-key 的两条正路（只对 isBuiltinDirectKeyVendor 且带 credentialProbe
// 的种子生效，certification 供应商一律走原路，诚实门不变量不放松）：
//   ① 验证 = 种子里代码拥有的 credentialProbe。**2026-09-22（T-MO-10）起它必须是免费的，
//     否则先问**：apimart 已从 `POST /api/v1/chat/completions`（真实生成、扣用户积分）换成
//     `GET /v1/balance`（零费用、坏 key 回 401，实测有对照组），并与每周雷达的逐模型
//     存活探针 `livenessProbe` 彻底分家。发不发、花不花钱由
//     `credentialProbePolicy.ts` 单点决定，本文件只执行。
//     401/403 → key 无效（throw）；探测成功 → verified；网络/上游其它失败 → pending
//     （诚实：不假装可用，也不把网络抖动误报成 key 错误）；用户拒绝付费探测 → declined。
//   ② 发布 = 凭据落盘后把 vendor 行重新 enable（内置家的「认证」就是代码拥有的契约本身：
//     scope 匹配 + 无认证占用 + curated 执行契约还在，三者缺一就不发布，供应商改过
//     baseUrl / 契约漂移照样 fail-closed）。
//
// 2026-09-10 第二刀：以上两条原来只对 apimart 生效（发布判据写死 vendorKey、验证判据写死
// /v1/models），另外 17 家内置供应商填 key 后整家下架且重启不自愈。现在两条判据都由**种子声明**
// 派生：`credentialProbePolicy` 决定怎么验、花不花钱，`hasBuiltinCuratedExecution`（登记表驱动）
// 决定能不能发布。见 docs/plan/2026-09-10-vendor-key-publish-class.md。

import { mutateCatalog, readCatalog } from './catalogStore'
import { builtinVendorSeed, builtinVendorScopeMatches } from './builtinVendorSeeds'
import { credentialProbePlan } from './credentialProbePolicy'
import { confirmCredentialProbeSpend } from './credentialProbeConfirm'
import { hasBuiltinCuratedExecution } from './seedBuiltins'
import { buildHttpRequest, appendQueryParams } from '../ai/requestPipeline'
import { readNestedRecord } from '../jsonUtils'
import { appFetch } from '../appFetch'
import type { Vendor } from './types'

export type DirectKeyProbeOutcome = 'verified' | 'invalid-key' | 'pending' | 'declined'

export function directKeyProbeModelId(state: ReturnType<typeof readCatalog>, vendorKey: string): string | null {
  const models = state.models.filter((model) => model.vendorKey === vendorKey && model.enabled)
  const text = models.find((model) => model.kind === 'text')
  return (text ?? models[0])?.modelKey ?? null
}

export type DirectKeyProbeOptions = {
  fetchImpl?: typeof fetch
  /**
   * 「这次验证会花钱，发不发」的问人函数。缺省走全仓那张付费确认卡
   * （`credentialProbeConfirm.ts` → `requestRendererDecision('spend.confirm')`）。
   */
  confirmSpend?: (input: { vendorKey: string; vendorName?: string; modelKey: string }) => Promise<boolean>
}

/**
 * 跑种子声明的凭据探测（`credentialProbe`，**不是**每周雷达那条 `livenessProbe`）。**发不发、花不花钱，由 `credentialProbePolicy` 一家说了算**
 * （T-MO-10，用户 2026-09-22 拍板「免费探测」）：
 *
 *   · 免费档（apimart 的 `GET /v1/balance`、higgsfield 的 estimate）→ 直接发，不打扰用户；
 *   · 付费档（含**缺省**：种子没声明 `cost` 的一律按付费）→ 先经确认面问一句，
 *     用户没点同意就 `declined`，**一个字节都不发**。
 *
 * 2026-09-22 之前这里无条件发种子声明的请求，而 apimart 声明的是一次真实
 * `POST /chat/completions`：用户点「保存验证」就扣他的积分，且这条路经 `appFetch` 直接出门、
 * 没有 `grantId`，报价卡在结构上永远不可能为它出现（09-11 群反馈）。
 *
 * 永不落盘上游响应体、请求头或异常信息（它们可能回显凭据）——与每周雷达探针同一纪律。
 */
export async function probeDirectKeyCredential(vendor: Vendor, apiKey: string, options: DirectKeyProbeOptions = {}): Promise<DirectKeyProbeOutcome> {
  const fetchImpl = options.fetchImpl ?? appFetch
  const plan = credentialProbePlan(vendor.key)
  if (plan.kind !== 'seed-probe') return 'pending'
  const declaration = plan.probe
  const model = directKeyProbeModelId(readCatalog(), vendor.key)
  if (!model) return 'pending'
  // 花钱的那一档：先问人，再决定发不发。问不到人 = 不发（fail-closed）。
  if (plan.cost === 'paid') {
    const confirm = options.confirmSpend ?? confirmCredentialProbeSpend
    const approved = await confirm({ vendorKey: vendor.key, vendorName: vendor.name, modelKey: model })
    if (!approved) return 'declined'
  }
  try {
    const request = buildHttpRequest({
      baseUrl: vendor.baseUrlHint || builtinVendorSeed(vendor.key)!.baseUrl,
      authType: vendor.authType || 'bearer',
      authHeaderName: vendor.authHeader ?? undefined,
      authScheme: vendor.authScheme ?? undefined,
      authQueryParam: vendor.authQueryParam ?? undefined,
      apiKey,
      context: { model },
      operation: declaration.request,
    })
    const response = await fetchImpl(appendQueryParams(request.url, request.query), {
      method: request.method,
      headers: request.headers,
      // 免费探测多半是 GET（apimart 的余额查询就是），带 body 的 GET 会被 undici 直接拒。
      // 声明里没有 body 就不要造一个 "undefined" 出来。
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 401 || response.status === 403) return 'invalid-key'
    if (!response.ok) return 'pending'
    const result: unknown = await response.json()
    const value = readNestedRecord(result, declaration.successPath.split('.'))
    return value !== undefined && value !== null ? 'verified' : 'pending'
  } catch {
    return 'pending'
  }
}

function hasCertificationOwnedAdapter(state: Parameters<typeof hasBuiltinCuratedExecution>[0], vendorKey: string): boolean {
  const hasAdapter = (meta: unknown): boolean => Boolean(meta && typeof meta === 'object' && !Array.isArray(meta)
    && Object.prototype.hasOwnProperty.call(meta, 'adapter'))
  return state.vendors.some((vendor) => vendor.key === vendorKey && hasAdapter(vendor.meta))
    || state.models.some((model) => model.vendorKey === vendorKey && hasAdapter(model.meta))
}

/**
 * 把这家内置供应商重新置为已发布（凭据存下来之后调用）。
 *
 * 守卫仍是 bootstrap 检查的同一组三条（scope 匹配 / 无认证适配器接管 / 代码拥有的执行契约完好），
 * 缺一就不发布——供应商改过 baseUrl、契约漂移、被认证接管，照样 fail-closed。
 *
 * 2026-09-10：去掉 `isBuiltinDirectKeyVendor` 前置。发布该由**种子声明的契约**决定，
 * 不该由 vendor 名的白名单决定：18 家内置里只有 apimart 是 direct-key，于是另外 17 家
 * 填完 key 就整家下架且重启不自愈（seedVendor 存在即跳过）。判据换成登记表之后，
 * 「新接一家忘了改发布判据」这一族在装配期就没有了。
 */
export function publishBuiltinCuratedVendor(vendorKey: string): void {
  if (!builtinVendorSeed(vendorKey)) return
  mutateCatalog((_tx, current) => {
    const vendor = current.vendors.find((item) => item.key === vendorKey)
    if (!vendor || vendor.enabled) return
    if (hasCertificationOwnedAdapter(current, vendorKey)) return
    if (!builtinVendorScopeMatches(vendor)) return
    if (!hasBuiltinCuratedExecution(current, vendorKey)) return
    vendor.enabled = true
    vendor.updatedAt = new Date().toISOString()
  })
}
