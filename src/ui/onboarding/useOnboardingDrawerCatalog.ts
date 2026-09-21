import React from 'react'
import type { Mapping } from '../../../electron/catalog/types'
import { getDesktopBridge } from '../../desktop/bridge'
import type { DreaminaStatus } from './DreaminaMemberCard'
import type { ChipModel } from './ModelChipGroups'
import { projectModelSettingsCatalog } from './modelSettingsCatalogProjection'
import { vendorFieldLossNoticeAt } from '../../../electron/shared/vendorFieldLossNotice'

/**
 * 目录「这一次读不了 / 只能读」的两种状态（名字与主进程 lane 的报告一致，合并后对账）。
 *
 * `readOnly` 由健康度 IPC 给：盘上那份配置由**更新版本**写入，或者文件被锁着打不开。
 * 类型写成可选的，是因为本分支还没并入产出它的那一半——并进来之后这里不用改一个字。
 */
export type OnboardingCatalogReadOnly = {
  reason: string
  diskVersion?: number
  appVersion?: number
  detail?: string
  quarantinedPath?: string
}

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
  /** 这一次读为什么失败；非空时**上一份数据仍在其余字段里**，不是空目录。 */
  loadError: string | null
  /** 目录处于只读时的原因；null = 可写。 */
  readOnly: OnboardingCatalogReadOnly | null
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
  const [readOnly, setReadOnly] = React.useState<OnboardingCatalogReadOnly | null>(null)
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
    } catch (error) {
      /**
       * **读失败不许把界面清空。**
       *
       * 用户那句「重装之后所有模型配置都没了」就是从这里出来的：配置一条都没丢，是读通道上
       * 挂了一次写、写被拒、抛错，而这里把异常吞成了一片空白页。空白页说的是「你什么都没有」，
       * 而真相是「这一次没读到」——两句话让用户做的事完全相反（一个去重配，一个去看看怎么了）。
       *
       * 所以：**上一份数据原样留着**（不 set 任何一个数据状态），只多出一条说得出原因的错。
       */
      setLoadError(error instanceof Error ? error.message : String(error))
    }
    try {
      const health = bridge.modelCatalog.health?.() as { readOnly?: OnboardingCatalogReadOnly | null } | undefined
      setReadOnly(health?.readOnly ?? null)
    } catch {
      // 健康度读不到不改变「目录能不能编辑」这个判断——宁可当可写，也不要凭一次失败把用户锁成只读。
      setReadOnly(null)
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
