import { importModelCatalogPackage, mutateCatalog, readCatalog, upsertModelCatalogMapping, upsertModelCatalogModel, upsertModelCatalogVendor, upsertModelCatalogVendorApiKey } from './catalogStore'
import type { CatalogState, Model } from './types'
import { derivePublishedExecution, modelHasPublishedExecution } from '../shared/modelPublication'

import { validateCandidateCredential, candidateCredentialSnapshot } from './validateCandidateCredential'
import { hasBuiltinCredentialJudgement } from './builtinVendorSeeds'
import { carriesCertificationMark, isCertificationOwnedConnection } from './certificationOwnership'
import { publishBuiltinCuratedVendor } from './directKeyCredential'
import { bindCredentialDestination, judgeCredentialDestination, readCredentialBinding } from './credentialBinding'
import { codeDeclaredFallbackOrigins } from '../vendor/vendorBaseFallback'
import { desktopT } from '../i18n'

type Json = Record<string, unknown>

function record(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
}

/** 认证连接上设置页改不了的字段。接口地址不在其中：它归用户在设置里亲手改（2026-09-29，主域被墙要能换线路）。 */
const SECURITY_SCOPE_FIELDS = ['authType', 'authHeader', 'authQueryParam', 'providerKind'] as const

function normalizedScopeValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value ?? null
}

function assertMutableConnectionScope(raw: Json, existing: CatalogState['vendors'][number] | undefined, state: CatalogState): void {
  if (!existing || !isCertificationOwnedConnection(state, existing.key)) return
  const changed = SECURITY_SCOPE_FIELDS.some((key) =>
    Object.prototype.hasOwnProperty.call(raw, key)
      && normalizedScopeValue(raw[key]) !== normalizedScopeValue(existing[key]),
  )
  if (changed) throw new Error(desktopT('catalog.connectionScopeLocked'))
}

/** Renderer may edit presentation/config fields, never certification ownership. */
function preserveCertificationMeta(incoming: unknown, existing: unknown): Json | undefined {
  const next = { ...record(incoming) }
  delete next.adapter
  const current = record(existing)
  if (carriesCertificationMark(current)) next.adapter = current.adapter
  return Object.keys(next).length ? next : undefined
}

export function sanitizeRendererVendorMutation(payload: unknown, state: CatalogState): Json {
  const raw = record(payload)
  const key = String(raw.key || '').trim()
  const existing = state.vendors.find((vendor) => vendor.key === key)
  assertMutableConnectionScope(raw, existing, state)
  const hasPublishedModel = state.models.some((model) => model.vendorKey === key
    && modelHasPublishedExecution(model, { mappings: state.mappings }))
  return {
    ...raw,
    ...(raw.enabled === true && !hasPublishedModel ? { enabled: false } : {}),
    meta: preserveCertificationMeta(raw.meta, existing?.meta),
  }
}

export function sanitizeRendererModelMutation(payload: unknown, state: CatalogState): Json {
  const raw = record(payload)
  const vendorKey = String(raw.vendorKey || '').trim()
  const modelKey = String(raw.modelKey || '').trim()
  const existing = state.models.find((model) => model.vendorKey === vendorKey && model.modelKey === modelKey)
  const preservedMeta = preserveCertificationMeta(raw.meta, existing?.meta)
  const meta = existing ? preservedMeta : {
    ...record(preservedMeta),
    adapter: { state: 'unverified', modes: [] },
  }
  const proposed = { ...(existing || {}), ...raw, vendorKey, modelKey, meta } as Model
  return {
    ...raw,
    vendorKey,
    modelKey,
    meta,
    ...(raw.enabled === true && !modelHasPublishedExecution(proposed, { mappings: state.mappings }) ? { enabled: false } : {}),
  }
}

export function sanitizeRendererMappingMutation(payload: unknown, state: CatalogState): Json {
  const raw = record(payload)
  if (raw.enabled !== true) return raw
  const vendorKey = String(raw.vendorKey || '').trim()
  const modelKey = String(raw.modelKey || '').trim()
  const taskKind = String(raw.taskKind || '').trim()
  const targets = state.models.filter((model) => model.vendorKey === vendorKey
    && (!modelKey || model.modelKey === modelKey) && carriesCertificationMark(model.meta))
  if (targets.length === 0) return raw
  const publishedForTask = targets.some((model) => derivePublishedExecution(model, { mappings: state.mappings })
    .publishedModes.includes(taskKind as never))
  return publishedForTask ? raw : { ...raw, enabled: false }
}

export function sanitizeRendererCatalogImport(payload: unknown): Json {
  const raw = record(payload)
  const vendors = Array.isArray(raw.vendors) ? raw.vendors.map((value) => {
    const bundle = record(value)
    const vendor = record(bundle.vendor)
    return {
      ...bundle,
      vendor: { ...vendor, enabled: false, meta: preserveCertificationMeta(vendor.meta, undefined) },
      models: Array.isArray(bundle.models) ? bundle.models.map((value) => {
        const model = record(value)
        return {
          ...model,
          enabled: false,
          meta: {
            ...record(preserveCertificationMeta(model.meta, undefined)),
            adapter: { state: 'unverified', modes: [] },
          },
        }
      }) : [],
      mappings: Array.isArray(bundle.mappings)
        ? bundle.mappings.map((value) => ({ ...record(value), enabled: false }))
        : [],
    }
  }) : []
  return { ...raw, vendors }
}

export function upsertRendererCatalogVendor(payload: unknown) {
  const saved = upsertModelCatalogVendor(sanitizeRendererVendorMutation(payload, readCatalog()))
  if (Object.prototype.hasOwnProperty.call(record(payload), 'baseUrlHint')) followSavedAddressWithCredential(saved.key)
  return saved
}

/**
 * 用户在设置里亲手存了新地址，而已存的 key 还绑在旧地址上——凭据守卫会把去新地址的请求全拦下。
 * 这一次保存就是他的确认，所以绑定跟到新地址（写法只有 `bindCredentialDestination` 那一个）。
 * 新地址本来就放行（绑定的那个 origin 或代码里写死的官方备用域）时不动；没存过 key 的连接没有绑定可跟。
 */
function followSavedAddressWithCredential(vendorKey: string): void {
  const vendor = readCatalog().vendors.find((item) => item.key === vendorKey)
  const binding = readCredentialBinding(vendor)
  if (!vendor?.baseUrlHint || !binding) return
  if (judgeCredentialDestination({ binding, url: vendor.baseUrlHint, codeDeclaredOrigins: codeDeclaredFallbackOrigins(vendorKey) }).allowed) return
  mutateCatalog((_tx, state) => bindCredentialDestination(state.vendors.find((item) => item.key === vendorKey), new Date().toISOString()))
}

/** Renderer credential writes are configuration only.  For certification vendors a key
 * can never promote the vendor — certification owns the later enabled transition.  The
 * paired vendor de-publish is inherited from the store, not done here — see
 * `credentialPublication.ts`.  direct-key vendors (apimart) are the designed exception:
 * the code-owned contract *is* the certification, so a verified key publishes the
 * credential and the vendor in the same step (see `directKeyCredential.ts`). */
export async function upsertRendererCatalogVendorApiKey(vendorKey: string, payload: unknown) {
  const candidate = sanitizeRendererVendorApiKeyMutation(payload)
  const vendor = readCatalog().vendors.find((item) => item.key === vendorKey)
  if (!vendor) throw new Error(desktopT('credential.validationUnavailable'))
  const snapshot = candidateCredentialSnapshot(vendorKey)
  const verificationPending = await validateCandidateCredential(vendor, String(candidate.apiKey || '').trim())
  if (snapshot !== candidateCredentialSnapshot(vendorKey)) throw new Error(desktopT('credential.changed'))
  // 内置家：验证通过 → 凭据 enabled:true + vendor 重新发布；探测型的 pending（网络/上游抖动）
  // → 诚实保持停用 + verificationPending，首用前 revalidatePendingCredential 再转正。
  // `first-use` 那一类没有可信的预检可跑，validateCandidateCredential 直接判「不 pending」，照常发布。
  // 自定义 / 中转供应商（无内置种子）行为完全不变：仍由认证晋升决定发布。
  // 渲染层传来的 enabled 永远不算数（恒 false，manualCertificationBoundary.test.ts 锁着），
  // 启用与否只由这里的主进程验证结果决定。
  const strategy = hasBuiltinCredentialJudgement(vendorKey)
  // `authType: 'none'`（本地 ComfyUI / Ollama 这类免鉴权的家）没有「验过没验过」这个状态：
  // 它压根不发鉴权头。以前这里把它和「自定义家等认证晋升」并作一档，凭据落成 enabled:false，
  // 而 `credentialRecordCounts` 读 `enabled !== false` —— 于是**存进去的 key 恒不算数**，
  // `hasApiKey` 恒 false，vendor 还被 `depublishVendorForDisabledCredential` 顺手下架。
  //
  // 这是 2026-09-10「verificationPending 不等于已停用」那条裁决（见 credentialPublication.ts）
  // 的同一形状：`ApiKeyRecord.enabled` 同时被当成「用户停用了」和「还没验过」两个意思用。
  // 免鉴权这一档没有第二种意思可讲，先归位；剩下的自定义家仍由认证晋升决定发布（不变）。
  const nothingToVerify = vendor.authType === 'none'
  const publishNow = (strategy || nothingToVerify) && !verificationPending
  const result = upsertModelCatalogVendorApiKey(vendorKey, {
    ...candidate,
    ...(verificationPending ? { verificationPending: true } : {}),
    ...(publishNow ? { enabled: true } : {}),
  })
  if (publishNow) publishBuiltinCuratedVendor(vendorKey)
  return result
}

export function sanitizeRendererVendorApiKeyMutation(payload: unknown): Json {
  const { verificationPending: _ignored, ...candidate } = record(payload)
  return { ...candidate, enabled: false }
}

export function upsertRendererCatalogModel(payload: unknown) {
  return upsertModelCatalogModel(sanitizeRendererModelMutation(payload, readCatalog()))
}

export function upsertRendererCatalogMapping(payload: unknown) {
  return upsertModelCatalogMapping(sanitizeRendererMappingMutation(payload, readCatalog()))
}

export function importRendererCatalogPackage(payload: unknown) {
  return importModelCatalogPackage(sanitizeRendererCatalogImport(payload))
}
