import React from 'react'
import type { Mapping } from '../../../electron/catalog/types'
import { getDesktopBridge } from '../../desktop/bridge'
import type { DreaminaStatus } from './DreaminaMemberCard'
import type { ChipModel } from './ModelChipGroups'
import { projectModelSettingsCatalog } from './modelSettingsCatalogProjection'
import type { ModelCatalogReadOnlyDto } from '../../workbench/api/modelCatalogApi'
import { vendorFieldLossNoticeAt } from '../../../electron/shared/vendorFieldLossNotice'

export type OnboardingVendorMeta = {
  name: string
  hasApiKey: boolean
  credentialVerificationPending?: boolean
  baseUrl: string
  enabled: boolean
  authType: string
  customCallOnly: boolean
  /** v12→v13 迁移盖的「这家的声明我补不了」标记时间戳；空/缺席 = 没盖过。见 vendorFieldLossRepair.ts。 */
  fieldLossNoticeAt?: string | null
  /** vendor.meta 原样——关掉上面那条提示时要把它写回、只去掉那一个键。 */
  raw?: unknown
}

const MAX_BRIDGE_RETRIES = 5
const BRIDGE_RETRY_MS = 400
const DREAMINA_UNCHECKED_STATUS: DreaminaStatus = {
  installed: false,
  loggedIn: false,
  totalCredit: null,
  vipLevel: '',
  notMaestroVip: false,
}

export function useOnboardingDrawerCatalog(): {
  models: ChipModel[]
  mappings: Mapping[]
  vendorMeta: Map<string, OnboardingVendorMeta>
  customCallScripts: Map<string, string>
  dreaminaStatus: DreaminaStatus | null
  loaded: boolean
  bridgeMissing: boolean
  /** 这一次读目录为什么失败。非空时**界面上必须看得见**——上一份数据仍然在上面那些字段里。 */
  loadError: string | null
  /** 目录为什么只能读不能改（`newer_on_disk` = 装过新版又装回旧版）。null = 一切正常。 */
  readOnly: ModelCatalogReadOnlyDto | null
  reloadFromError: () => void
  refresh: () => void
} {
  const [models, setModels] = React.useState<ChipModel[]>([])
  const [mappings, setMappings] = React.useState<Mapping[]>([])
  const [vendorMeta, setVendorMeta] = React.useState<Map<string, OnboardingVendorMeta>>(new Map())
  const [customCallScripts, setCustomCallScripts] = React.useState<Map<string, string>>(new Map())
  const [dreaminaStatus, setDreaminaStatus] = React.useState<DreaminaStatus | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [bridgeMissing, setBridgeMissing] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [readOnly, setReadOnly] = React.useState<ModelCatalogReadOnlyDto | null>(null)
  const bridgeRetries = React.useRef(0)
  const [version, setVersion] = React.useState(0)

  React.useEffect(() => {
    const bridge = getDesktopBridge()
    if (!bridge) {
      if (bridgeRetries.current < MAX_BRIDGE_RETRIES) {
        bridgeRetries.current += 1
        const timer = setTimeout(() => setVersion((value) => value + 1), BRIDGE_RETRY_MS)
        return () => clearTimeout(timer)
      }
      setBridgeMissing(true)
      setLoaded(true)
      return
    }
    bridgeRetries.current = 0
    setBridgeMissing(false)
    try {
      const storedModels = bridge.modelCatalog.listModels() as Array<Record<string, unknown>>
      const storedVendors = bridge.modelCatalog.listVendors() as Array<Record<string, unknown>>
      const storedMappings = bridge.modelCatalog.listMappings() as Mapping[]
      const metaMap = new Map<string, OnboardingVendorMeta>()
      for (const vendor of storedVendors) {
        metaMap.set(String(vendor.key), {
          name: String(vendor.name || vendor.key),
          hasApiKey: Boolean(vendor.hasApiKey),
          credentialVerificationPending: vendor.credentialVerificationPending === true,
          baseUrl: String(vendor.baseUrlHint || ''),
          enabled: vendor.enabled !== false,
          authType: String(vendor.authType || ''),
          customCallOnly: Boolean((vendor.meta as Record<string, unknown> | undefined)?.customCallOnly),
          fieldLossNoticeAt: vendorFieldLossNoticeAt(vendor),
          raw: vendor.meta,
        })
      }
      const projectedCatalog = projectModelSettingsCatalog(storedModels)
      setCustomCallScripts(projectedCatalog.fallbackScripts)
      setVendorMeta(metaMap)
      setModels(projectedCatalog.models)
      setMappings(storedMappings)
      setLoadError(null)
      setReadOnly((bridge.modelCatalog.health() as { readOnly?: ModelCatalogReadOnlyDto | null } | null)?.readOnly ?? null)
    } catch (error) {
      // 这里原本是一个裸 catch：三个列表全部置空、一个字都不说。用户看到的就是一个空白的模型设置页
      // ——那正是「所有模型配置都没了」那句反馈的来源，而盘上的文件一个字节都没少
      // （根因：scratchpad rootcause-config-loss-on-reinstall.md §0）。
      // 两件事同时改：① 上一份已知数据留在屏幕上，读失败不等于用户的东西没了；
      // ② 错误交给界面去说，由 loadError / readOnly 两个状态承载。
      setLoadError(error instanceof Error ? error.message : String(error))
      try {
        setReadOnly((bridge.modelCatalog.health() as { readOnly?: ModelCatalogReadOnlyDto | null } | null)?.readOnly ?? null)
      } catch {
        // 连健康度都读不到时，loadError 已经足够说明「这一屏现在不可信」。
      }
    }
    setLoaded(true)
    let alive = true
    const dreamina = bridge.dreamina
    if (dreamina) {
      setDreaminaStatus((current) => current ?? DREAMINA_UNCHECKED_STATUS)
      dreamina.status()
        .then((status) => { if (alive) setDreaminaStatus(status as DreaminaStatus) })
        .catch(() => { if (alive) setDreaminaStatus((current) => current ?? DREAMINA_UNCHECKED_STATUS) })
    } else {
      setDreaminaStatus(null)
    }
    return () => { alive = false }
  }, [version])

  React.useEffect(() => {
    const changed = (): void => setVersion((value) => value + 1)
    window.addEventListener('nomi-model-catalog-changed', changed)
    return () => window.removeEventListener('nomi-model-catalog-changed', changed)
  }, [])

  const reloadFromError = React.useCallback(() => {
    bridgeRetries.current = 0
    setBridgeMissing(false)
    setLoadError(null)
    setLoaded(false)
    setVersion((value) => value + 1)
  }, [])

  const refresh = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('nomi-model-catalog-changed'))
  }, [])

  return {
    models,
    mappings,
    vendorMeta,
    customCallScripts,
    dreaminaStatus,
    loaded,
    bridgeMissing,
    loadError,
    readOnly,
    reloadFromError,
    refresh,
  }
}
