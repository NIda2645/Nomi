/**
 * 模型设置面板内容（已接入 / 可接入 分层 + 方案2 分组折叠 + 自适应默认，见
 * docs/plan/2026-06-25-model-onboarding-connected-available-split.md）。
 *
 * 从上到下：
 *  - 顶部「你现在已经能生成」能力概览条（图/视频/文本/配音，由已连通供应商的模型 kind 派生，effect-first）
 *  - 【已接入】跨类扁平排你接好的家（连通 vendor / 其他自定义模型 / 即梦已登录 / 编程助手已接）；无已接入项则整段不显
 *  - 【可接入】保留原分组（接入生成模型 / 有即梦会员？/ 接入编程助手），每组是带数量的折叠组（AvailableGroup）；
 *    自适应默认：有已接入 → 各组收起；零已接入的新用户 → 首组「接入生成模型」自动展开
 *
 * 连接状态单一来源（plan §4.1）：vendor.hasApiKey 本就在父组件；即梦/编程助手的连接状态由父组件统一 fetch
 * 后下传给受控卡（DreaminaMemberCard / ConnectAssistantCard），变更经 onChanged 冒泡回来重查 + 重新分桶。
 * 不改后端 catalog / IPC / 三套 vendor 名单（不合并、不去重）。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronRight, IconPlus, IconPhoto, IconVideo, IconMessageCircle, IconMusic, IconRefresh } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { OnboardingWizard } from './OnboardingWizard'
import { VendorOnboardCard } from './VendorOnboardCard'
import { AvailableGroup } from './AvailableGroup'
import { type ChipModel } from './ModelChipGroups'
import { CustomVendorCard } from './CustomVendorCard'
import { CustomCallEditor, type CustomCallTarget } from './CustomCallEditor'
import { consumePendingCustomCallIntent } from './customCallIntent'
import { confirmAndDeleteVendor } from './vendorDeleteAction'
import { ConnectAssistantCard, type McpInfo } from './ConnectAssistantCard'
import { DreaminaMemberCard, type DreaminaStatus } from './DreaminaMemberCard'
import { ComfyuiLocalCard, COMFYUI_VENDOR_KEY } from './ComfyuiLocalCard'
import { AddComfyuiInstanceButton } from './AddComfyuiInstanceButton'
import { isComfyuiVendorKey } from '../../workbench/generationCanvas/runner/comfyuiTaskControl'
import { NetworkSection } from './NetworkSection'
import { CODEX_LOCAL_VENDOR_KEY } from './codexLocalProvider'
import { CodexLocalImageCard } from './CodexLocalImageCard'
import { KNOWN_VENDORS, isKnownVendor } from '../../config/knownVendors'
import { getDesktopBridge } from '../../desktop/bridge'
import { notifyModelOptionsRefresh } from '../../config/useModelOptions'
import { alertDialog, confirmDialog } from '../../design'

type VendorMeta = {
  name: string
  hasApiKey: boolean
  baseUrl: string
  enabled: boolean
  authType: string
}

// 能力概览：四类产物 → 图标/文案。covered 由已连通供应商的模型 kind 派生（derive 不 hardcode）。
// labelKey 指向 onboardingProviders.drawer.kind.*，在渲染时用 t() 取文案。
const KIND_CAPS = [
  { kind: 'image', labelKey: 'onboardingProviders.drawer.kind.image', Icon: IconPhoto },
  { kind: 'video', labelKey: 'onboardingProviders.drawer.kind.video', Icon: IconVideo },
  { kind: 'text', labelKey: 'onboardingProviders.drawer.kind.text', Icon: IconMessageCircle },
  { kind: 'audio', labelKey: 'onboardingProviders.drawer.kind.audio', Icon: IconMusic },
] as const

// Issue #42:后台桥（preload 注入的 window.nomiDesktop）偶发未就绪时，别把用户永久卡在「加载中…」。
// 有界重试（总窗口 ≈ 5×400ms = 2s，覆盖启动竞态），仍拿不到才判真故障、给可操作错误态。
const MAX_BRIDGE_RETRIES = 5
const BRIDGE_RETRY_MS = 400

export function OnboardingDrawer(): JSX.Element {
  const { t } = useTranslation()
  const [wizardOpen, setWizardOpen] = React.useState(false)
  const [wizardPreset, setWizardPreset] = React.useState<string | undefined>(undefined)
  const openWizard = React.useCallback((preset?: string) => { setWizardPreset(preset); setWizardOpen(true) }, [])
  const [models, setModels] = React.useState<ChipModel[]>([])
  const [mappings, setMappings] = React.useState<Array<Record<string, unknown>>>([])
  const [vendorMeta, setVendorMeta] = React.useState<Map<string, VendorMeta>>(new Map())
  // 自定义调用：脚本正文表 + 编辑器目标（null=关）。
  const [customCallScripts, setCustomCallScripts] = React.useState<Map<string, string>>(new Map())
  const [customCallTarget, setCustomCallTarget] = React.useState<CustomCallTarget | null>(null)
  // 即梦 / 编程助手的连接状态上提到父组件（单一来源，plan §4.1）。null = 不可用/加载中（卡不显）。
  const [dreaminaStatus, setDreaminaStatus] = React.useState<DreaminaStatus | null>(null)
  const [mcpInfo, setMcpInfo] = React.useState<McpInfo | null>(null)
  // 同步数据就绪标志：分组折叠的「自适应默认」依赖 hasConnected，必须等目录/MCP 同步加载完再挂
  // AvailableGroup，否则它在首帧空态（hasConnected=false）就把默认展开态固定下来（plan §4.3 mount-before-load）。
  const [loaded, setLoaded] = React.useState(false)
  // Issue #42:后台桥缺失（多为启动竞态/多窗口 preload 未挂）→ 有界重试；仍无则给可操作错误态，不无限「加载中…」。
  const [bridgeMissing, setBridgeMissing] = React.useState(false)
  const bridgeRetries = React.useRef(0)
  const [version, setVersion] = React.useState(0) // bump to refetch

  React.useEffect(() => {
    const bridge = getDesktopBridge()
    if (!bridge) {
      if (bridgeRetries.current < MAX_BRIDGE_RETRIES) {
        bridgeRetries.current += 1
        const t = setTimeout(() => setVersion((v) => v + 1), BRIDGE_RETRY_MS)
        return () => clearTimeout(t)
      }
      setBridgeMissing(true)
      setLoaded(true) // 结束加载态，交给错误态渲染（下面 bridgeMissing 分支）。
      return
    }
    bridgeRetries.current = 0
    setBridgeMissing(false)
    // 生成模型目录（同步）。
    try {
      const ms = bridge.modelCatalog.listModels() as Array<Record<string, unknown>>
      const vs = bridge.modelCatalog.listVendors() as Array<Record<string, unknown>>
      const maps = bridge.modelCatalog.listMappings({ vendorKey: COMFYUI_VENDOR_KEY }) as Array<Record<string, unknown>>
      // 注意：这里**不再**把 codex-local 的 enabled 掰成 MCP 接入状态。两者方向相反——
      // MCP =「助手来用 Nomi」，codex-local =「Nomi 去用 Codex 出图」。旧实现把后者当前者的副作用，
      // 且每次刷新都强制回写 → 用户在模型列表/卡里自己关掉，下次打开面板又被打开（冲用户数据）。
      // 现在 codex-local 有自己的卡（CodexLocalImageCard），开关归用户。别再把这段接回来。
      const metaMap = new Map<string, VendorMeta>()
      for (const v of vs) {
        metaMap.set(String(v.key), {
          name: String(v.name || v.key),
          hasApiKey: Boolean(v.hasApiKey),
          baseUrl: String(v.baseUrlHint || ''),
          enabled: v.enabled !== false,
          authType: String(v.authType || ''),
        })
      }
      const rows: ChipModel[] = ms.map((m) => ({
        modelKey: String(m.modelKey),
        vendorKey: String(m.vendorKey),
        labelZh: String(m.labelZh || m.modelKey),
        kind: m.kind as ChipModel['kind'],
        // enabled 缺省视为 true（老快照/DTO 未带时不误停用）。
        enabled: m.enabled !== false,
        meta: m.meta,
        hasCustomCall: Boolean((m.customCall as { script?: unknown } | undefined)?.script),
        // 只有手动/中转拉取路接进来的模型可改类型——正好也只有那条路会按 id 关键词猜类型（会猜错）。
        canRetype: (m.onboarding as { addedVia?: unknown } | undefined)?.addedVia === 'manual',
      }))
      // 自定义调用脚本正文（编辑器回填用）；行上只带 hasCustomCall 布尔，正文单独成表不肥 ChipModel。
      const scripts = new Map<string, string>()
      for (const m of ms) {
        const script = (m.customCall as { script?: unknown } | undefined)?.script
        if (typeof script === 'string' && script.trim()) scripts.set(`${String(m.vendorKey)}/${String(m.modelKey)}`, script)
      }
      setCustomCallScripts(scripts)
      setVendorMeta(metaMap)
      setModels(rows)
      setMappings(maps)
    } catch {
      setVendorMeta(new Map())
      setModels([])
      setMappings([])
    }
    // 编程助手 MCP 状态（同步）。
    try {
      setMcpInfo((bridge.capability?.mcpInfo?.() as McpInfo | undefined) ?? null)
    } catch {
      setMcpInfo(null)
    }
    setLoaded(true) // 同步数据已就位 → 可挂分组（自适应默认按真实 hasConnected 算）。
    // 即梦状态（异步）。
    let alive = true
    const dreamina = bridge.dreamina
    if (dreamina) {
      dreamina.status()
        .then((s) => { if (alive) setDreaminaStatus(s as DreaminaStatus) })
        .catch(() => { if (alive) setDreaminaStatus(null) })
    } else {
      setDreaminaStatus(null)
    }
    return () => { alive = false }
  }, [version])

  // 自定义调用编辑器（从模型行或报错卡进入；编辑器是全局弹窗，不依赖卡展开态）。
  const openCustomCall = React.useCallback(
    (vendorKey: string, modelKey: string) => {
      setCustomCallTarget({
        vendorKey,
        modelKey,
        label: models.find((m) => m.vendorKey === vendorKey && m.modelKey === modelKey)?.labelZh || modelKey,
        script: customCallScripts.get(`${vendorKey}/${modelKey}`) || '',
      })
    },
    [models, customCallScripts],
  )

  // 报错卡跳转意图：挂载后（数据就绪）消费一次；抽屉已开着时再点报错卡 → 事件再消费。
  React.useEffect(() => {
    if (!loaded) return
    const consume = () => {
      const intent = consumePendingCustomCallIntent()
      if (intent) openCustomCall(intent.vendorKey, intent.modelKey)
    }
    consume()
    window.addEventListener('nomi-open-model-catalog', consume)
    return () => window.removeEventListener('nomi-open-model-catalog', consume)
  }, [loaded, openCustomCall])

  // Issue #42:错误态「重新加载」——清零重试计数，重新走一遍取桥流程。
  const reloadFromError = React.useCallback(() => {
    bridgeRetries.current = 0
    setBridgeMissing(false)
    setLoaded(false)
    setVersion((v) => v + 1)
  }, [])

  const refresh = React.useCallback(() => {
    notifyModelOptionsRefresh('all')
    setVersion((v) => v + 1)
    // 广播目录变更：库页缺模型状态条/弱入口靠它即时重查（单一信号源）。
    window.dispatchEvent(new CustomEvent('nomi-model-catalog-changed'))
  }, [])

  // 单删=1 行；批删=多行。一次确认框 + 一次 deleteModels（合成单次 read/write）+ 一次 refresh。
  const handleDelete = React.useCallback(async (rows: ChipModel[]) => {
    const bridge = getDesktopBridge()
    if (!bridge || rows.length === 0) return
    const single = rows.length === 1
    const ok = await confirmDialog({
      title: single ? t('onboardingProviders.drawer.deleteModel') : t('onboardingProviders.drawer.deleteModels', { count: rows.length }),
      message: single
        ? t('onboardingProviders.drawer.deleteSingleMessage', { name: rows[0].labelZh })
        : t('onboardingProviders.drawer.deleteMultipleMessage', { count: rows.length }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      bridge.modelCatalog.deleteModels(rows.map((r) => ({ vendorKey: r.vendorKey, modelKey: r.modelKey })))
      refresh()
    } catch (e) {
      void alertDialog({ title: t('onboardingProviders.drawer.deleteFailed'), message: e instanceof Error ? e.message : String(e) })
    }
  }, [refresh, t])

  // 启用/停用模型（可逆，保留清单）：逐行只翻 enabled（upsert 保留其余字段），末尾一次 refresh。
  // enabled:false 的模型天然从生成下拉/runtime 消失（selectExecutableModel 只选 enabled）。
  // 单个 = 传 1 行；批量（全选/全不选）= 传多行，避免 N 次 refresh。
  const handleSetEnabled = React.useCallback((rows: ChipModel[], enabled: boolean) => {
    const bridge = getDesktopBridge()
    if (!bridge || rows.length === 0) return
    try {
      for (const row of rows) {
        bridge.modelCatalog.upsertModel({ vendorKey: row.vendorKey, modelKey: row.modelKey, enabled })
      }
      refresh()
    } catch (e) {
      void alertDialog({ title: t('onboardingProviders.drawer.operationFailed'), message: e instanceof Error ? e.message : String(e) })
    }
  }, [refresh, t])

  /**
   * 改类型（接入时按 id 猜错了的那批）。**不是 upsert 一个字段**：走专用 IPC，主进程会在同一事务里
   * 按新 kind 重建调用通道 —— 只翻标签不重建通道的话，模型立刻能进对应下拉、点生成却撞「没有通道」，
   * 等于把用户从一个坑挪到另一个坑（见 electron/catalog/modelRetype.ts 文件头）。
   */
  const handleRetype = React.useCallback((row: ChipModel, kind: string) => {
    const bridge = getDesktopBridge()
    const retype = bridge?.modelCatalog.retypeModel
    if (!retype) return
    try {
      retype({ vendorKey: row.vendorKey, modelKey: row.modelKey, kind })
      refresh()
    } catch (e) {
      void alertDialog({ title: t('onboardingProviders.drawer.operationFailed'), message: e instanceof Error ? e.message : String(e) })
    }
  }, [refresh, t])

  // 卡头快捷删除整家供应商（与 CustomVendorManage 的删除按钮共用 confirmAndDeleteVendor，P1）。
  const handleDeleteVendor = React.useCallback(async (vendorKey: string, vendorName: string, modelCount: number) => {
    const res = await confirmAndDeleteVendor({ vendorKey, vendorName, modelCount, onChanged: refresh })
    if (res.error) void alertDialog({ title: t('onboardingProviders.drawer.deleteFailed'), message: res.error })
  }, [refresh, t])

  // 已知供应商：catalog 里存在该 vendor 才渲染卡片。
  const knownCards = KNOWN_VENDORS
    .map((directory) => {
      const meta = vendorMeta.get(directory.vendorKey)
      if (!meta) return null
      const vendorModels = models.filter((m) => m.vendorKey === directory.vendorKey)
      return { directory, meta, vendorModels }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // 分桶（derive，plan §4.4）：已连通 vendor 上「已接入」，未连通归「可接入」生成模型组。
  const connectedKnown = knownCards.filter((c) => c.meta.hasApiKey)
  const availableKnown = knownCards.filter((c) => !c.meta.hasApiKey)
  // 其他模型：用户自定义接入（有 key 才存在）→ 视为已接入。排除有专属卡的内置家：
  // 5 个 KNOWN_VENDORS + 即梦 dreamina（走 DreaminaMemberCard，其 seeded 模型不是"自定义"，
  // 否则与即梦会员卡重复且被误标"已配置"——真机走查抓到，dreamina 种了 4 个模型）。
  // 排除有专属卡/派生状态的内置家：dreamina（会员卡）+ comfyui-local（本地后端启用卡）+
  // codex-local（由「接入 AI 编程助手」里的 Codex 接入状态派生）。否则本地 provider 会落进
  // 通用「自定义中转」卡（那卡的 key/BaseURL 手填隐喻对无 key 本地后端是错的）。
  const otherModels = models.filter((m) =>
    !isKnownVendor(m.vendorKey) &&
    m.vendorKey !== 'dreamina' &&
    m.vendorKey !== COMFYUI_VENDOR_KEY &&
    m.vendorKey !== CODEX_LOCAL_VENDOR_KEY,
  )

  // 本地 ComfyUI（无 key 本地后端，专属卡）：**多实例**——第一台是 comfyui-local，第 2+ 台是
  // comfyui-local-*（isComfyuiVendorKey 与主进程 isComfyuiVendor 同口径）。每台一张卡，各自的
  // enabled 决定归「已接入 / 可接入」，各自的工作流按 vendorKey 归属、互不串台。
  const comfyuiInstances = React.useMemo(
    () =>
      [...vendorMeta.entries()]
        .filter(([key]) => isComfyuiVendorKey(key))
        // 第一台恒排最前，其余按 key 稳定排序（避免 Map 顺序抖动导致卡片跳位）。
        .sort(([a], [b]) => (a === COMFYUI_VENDOR_KEY ? -1 : b === COMFYUI_VENDOR_KEY ? 1 : a.localeCompare(b)))
        .map(([key, meta]) => ({ key, meta, models: models.filter((m) => m.vendorKey === key) })),
    [vendorMeta, models],
  )
  const comfyuiConnected = comfyuiInstances.filter((i) => i.meta.enabled)
  const comfyuiAvailableList = comfyuiInstances.filter((i) => !i.meta.enabled)

  // 即梦 / 编程助手连接判定 + 可用性（卡是否该出现）。
  const dreaminaAvailable = dreaminaStatus !== null
  const dreaminaConnected = !!(dreaminaStatus?.installed && dreaminaStatus?.loggedIn)
  const assistantAvailable = mcpInfo !== null
  // 「已接入」= 真写了某客户端配置；仅 tokenReady（就绪未接）归「可接入」。
  const assistantConnected = !!(mcpInfo && Object.values(mcpInfo.clients).some((c) => c.installed))
  // Codex 本地生图（Nomi 去用 Codex 出图，与上面的 MCP 方向相反）：种子存在才显卡，enabled 归用户。
  const codexImageMeta = vendorMeta.get(CODEX_LOCAL_VENDOR_KEY)
  const codexImageAvailable = codexImageMeta !== undefined
  const codexImageEnabled = codexImageMeta?.enabled === true

  const hasConnected =
    connectedKnown.length > 0 ||
    otherModels.length > 0 ||
    comfyuiConnected.length > 0 ||
    dreaminaConnected ||
    assistantConnected ||
    codexImageEnabled

  // 能力覆盖：某 kind 有「已连通供应商（hasApiKey）+ 已启用」的模型 = 现在就能生成（诚实，未连通不算）。
  // 计数 = 该 kind 下已启用且可用的模型数（用户 2026-07-17：能力条要显示选中的不同类型模型数量）。
  const coveredKindCounts = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of models) {
      if (!m.enabled) continue
      const meta = vendorMeta.get(m.vendorKey)
      if (!meta?.hasApiKey && !(m.vendorKey === CODEX_LOCAL_VENDOR_KEY && meta?.authType === 'none' && meta.enabled)) continue
      const k = String(m.kind)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return counts
  }, [models, vendorMeta])

  /**
   * 「类型可能被猜错了」的诊断（本次修复的主症状入口）。
   *
   * 病象：中转一次拉几十个模型，类型是按 id 关键词猜的，猜不中一律落 text。猜错之后模型不会报错，
   * 而是**从对应下拉里消失**（生成侧每层都按 kind 过滤）——用户看到的是「没有可用图像模型」，
   * 但设置页一片绿、模型也都在列表里，没有一个字指向真实缺口。这条横幅就是那个缺失的字。
   *
   * 判据刻意收窄成这个 bug 的**指纹**，不是「哪类为零就喊」（那会变成常年噪音：只接文本模型的
   * 用户本来就该是零）。三条同时成立才提示：
   *   ① 有一批可改类型的模型（≥3 条，说明是拉取进来的批量，不是手挑两个）；
   *   ② 它们几乎全挤在同一类（≥80%）——这正是「猜不中→全落 text」的形状；
   *   ③ 至少还有一类是零。
   * 即便如此也**不下结论**：文案说「里面若有 X 模型，点右边改过来」，给线索不替用户断言（D4）。
   */
  const kindGuessGap = React.useMemo(() => {
    const retypeable = models.filter((m) => m.canRetype && m.enabled)
    if (retypeable.length < 3) return null
    const byKind = new Map<string, number>()
    for (const m of retypeable) byKind.set(String(m.kind), (byKind.get(String(m.kind)) ?? 0) + 1)
    const [dominantKind, dominantCount] = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0]
    if (dominantCount / retypeable.length < 0.8) return null
    const missing = KIND_CAPS.filter(({ kind }) => kind !== dominantKind && (coveredKindCounts.get(kind) ?? 0) === 0)
    if (missing.length === 0) return null
    return { dominantKind, count: retypeable.length, missing: missing.map((c) => c.labelKey) }
  }, [models, coveredKindCounts])

  // 其他（自定义中转）按 vendor 拆成每家一张卡，卡名用用户在接入时填的「来源名称」（vendorMeta.name）。
  // 根因修复：此前全塞进单张「其他模型」卡、只按 kind 分组，多家糊一起分不清哪个 key 对哪家。
  // name 字段本就存在（接入向导「来源名称」→ Vendor.name），这里只是把它显示出来、按家拆开。
  const otherVendorGroups: Array<{ vendorKey: string; name: string; models: ChipModel[] }> = []
  {
    const indexByVendor = new Map<string, number>()
    for (const m of otherModels) {
      let idx = indexByVendor.get(m.vendorKey)
      if (idx === undefined) {
        idx = otherVendorGroups.length
        indexByVendor.set(m.vendorKey, idx)
        otherVendorGroups.push({ vendorKey: m.vendorKey, name: vendorMeta.get(m.vendorKey)?.name || m.vendorKey, models: [] })
      }
      otherVendorGroups[idx].models.push(m)
    }
  }

  const renderVendorCard = (card: typeof knownCards[number]) => (
    <VendorOnboardCard
      key={card.directory.vendorKey}
      directory={card.directory}
      vendorName={card.meta.name}
      baseUrl={card.meta.baseUrl}
      hasApiKey={card.meta.hasApiKey}
      models={card.vendorModels}
      onToggleModel={(model, enabled) => handleSetEnabled([model], enabled)}
      onChanged={refresh}
    />
  )

  return (
    <div className="flex flex-col">
      {/* 顶部能力概览：先告诉用户「你现在能生成什么」（effect-first），再谈配置。 */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-micro text-nomi-ink-40 mb-1.5">{t('onboardingProviders.drawer.capabilities')}</div>
        <div className="flex flex-wrap gap-1.5">
          {KIND_CAPS.map(({ kind, labelKey, Icon }) => {
            const count = coveredKindCounts.get(kind) ?? 0
            const on = count > 0
            return (
              <span
                key={kind}
                className={cn(
                  'inline-flex items-center gap-1 text-caption rounded-nomi-sm px-2 py-1',
                  on ? 'bg-nomi-accent-soft text-nomi-accent' : 'bg-nomi-ink-05 text-nomi-ink-40',
                )}
              >
                <Icon size={13} stroke={1.7} />
                {t(labelKey)}
                {/* 数量 = 该类型下已启用且厂商已连通的模型数（用户 2026-07-17 要求）。 */}
                {on ? <span className="font-semibold tabular-nums">{count}</span> : <span className="text-nomi-ink-30">{t('onboardingProviders.drawer.notConnected')}</span>}
              </span>
            )
          })}
        </div>
      </div>

      {/* 类型猜错诊断：紧贴能力条下方——用户正是被那条「图片 未接」逼过来的，答案就该在它旁边。
          左描边 + 弱底（非整块警告色）：这是线索不是报错，别喧宾夺主（判据与措辞理由见 kindGuessGap）。 */}
      {kindGuessGap ? (
        <div className="px-4 pb-2" data-drawer-kind-gap>
          <div className="border-l-2 border-nomi-warning bg-[color-mix(in_oklch,var(--nomi-warning)_10%,var(--nomi-paper))] px-2.5 py-2">
            <div className="text-caption font-medium text-nomi-ink">
              {t('onboardingProviders.drawer.kindGapTitle', {
                kinds: kindGuessGap.missing.map((k) => t(k)).join(' / '),
              })}
            </div>
            <div className="mt-0.5 text-micro leading-relaxed text-nomi-ink-60">
              {t('onboardingProviders.drawer.kindGapBody', {
                count: kindGuessGap.count,
                kind: t(`onboardingProviders.modelControls.kind.${kindGuessGap.dominantKind}` as 'onboardingProviders.modelControls.kind.text'),
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* 网络（代理）行：能力条之下、「已接入」之上。位置理由见 NetworkSection 头注释——
          面板已顶到视口高度上限，放底部就等于「用户最急的时候要滚过十几张卡才找得到」。 */}
      <NetworkSection />

      {bridgeMissing ? (
        <div className="px-4 py-6 flex flex-col items-start gap-2">
          <div className="text-body-sm font-semibold text-nomi-ink">{t('onboardingProviders.drawer.bridgeMissingTitle')}</div>
          <div className="text-caption text-nomi-ink-60 leading-relaxed">
            {t('onboardingProviders.drawer.bridgeMissingBody')}
          </div>
          <button
            type="button"
            onClick={reloadFromError}
            className={cn(
              'mt-1 inline-flex items-center gap-1.5 h-8 px-3 rounded-nomi-sm',
              'bg-nomi-ink text-nomi-paper text-caption font-semibold hover:bg-nomi-accent',
            )}
          >
            <IconRefresh size={14} stroke={1.8} />{t('common.reload')}
          </button>
        </div>
      ) : !loaded ? (
        <div className="px-4 py-6 text-caption text-nomi-ink-40">{t('onboardingProviders.drawer.loading')}</div>
      ) : (
      <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
        {/* ── 已接入：你接好的家浮顶，一眼可见（无已接入项则整段不显）── */}
        {hasConnected ? (
          <>
            <div className="text-micro font-semibold text-nomi-ink-40 pt-1 px-0.5">{t('onboardingProviders.drawer.connected')}</div>
            {connectedKnown.map(renderVendorCard)}
            {otherVendorGroups.map((group) => {
              const meta = vendorMeta.get(group.vendorKey)
              return (
                <CustomVendorCard
                  key={group.vendorKey}
                  vendorKey={group.vendorKey}
                  name={group.name}
                  models={group.models}
                  baseUrl={meta?.baseUrl ?? ''}
                  hasApiKey={meta?.hasApiKey ?? true}
                  onToggle={handleSetEnabled}
                  onDelete={handleDelete}
                  onCustomCall={(row) => openCustomCall(row.vendorKey, row.modelKey)}
                  onRetype={handleRetype}
                  onDeleteVendor={() => void handleDeleteVendor(group.vendorKey, group.name, group.models.length)}
                  onChanged={refresh}
                />
              )
            })}
            {comfyuiConnected.map((inst) => (
              <ComfyuiLocalCard
                key={inst.key}
                vendorKey={inst.key}
                instanceName={inst.meta.name}
                enabled
                baseUrl={inst.meta.baseUrl}
                models={inst.models}
                mappings={mappings}
                onChanged={refresh}
              />
            ))}
            {comfyuiConnected.length > 0 ? <AddComfyuiInstanceButton onAdded={refresh} /> : null}
            {dreaminaAvailable && dreaminaConnected ? (
              <DreaminaMemberCard status={dreaminaStatus} onChanged={refresh} />
            ) : null}
            {assistantAvailable && assistantConnected ? (
              <ConnectAssistantCard info={mcpInfo} onChanged={refresh} />
            ) : null}
            {codexImageAvailable && codexImageEnabled ? (
              <CodexLocalImageCard enabled onChanged={refresh} />
            ) : null}
          </>
        ) : null}

        {/* ── 可接入：保留原分组，每组折叠 + 数量；首组自适应默认展开（无已接入时）── */}
        <div className="text-micro font-semibold text-nomi-ink-40 pt-2 px-0.5">{t('onboardingProviders.drawer.available')}</div>

        <AvailableGroup title={t('onboardingProviders.drawer.connectGenerationModels')} count={availableKnown.length} defaultExpanded={!hasConnected}>
          {availableKnown.map(renderVendorCard)}
          <button
            type="button"
            onClick={() => openWizard(undefined)}
            className={cn(
              'group flex items-center gap-2.5 px-3 h-11 w-full text-left mt-0.5',
              'bg-nomi-ink text-nomi-paper rounded-nomi text-body-sm font-semibold',
              'hover:bg-nomi-accent transition-colors duration-[var(--nomi-transition-fast)]',
            )}
          >
            <IconPlus size={16} stroke={1.9} />
            <span className="flex-1 min-w-0">{t('onboardingProviders.drawer.addModel')}</span>
            <IconChevronRight size={15} className="shrink-0 opacity-60" />
          </button>
          <div className="text-micro text-nomi-ink-40 px-1 -mt-0.5">{t('onboardingProviders.drawer.addModelHint')}</div>
        </AvailableGroup>

        {comfyuiAvailableList.length > 0 ? (
          <AvailableGroup title={t('onboardingProviders.drawer.localComfyui')} count={comfyuiAvailableList.length} defaultExpanded={false}>
            {comfyuiAvailableList.map((inst) => (
              <ComfyuiLocalCard
                key={inst.key}
                vendorKey={inst.key}
                instanceName={inst.meta.name}
                enabled={false}
                baseUrl={inst.meta.baseUrl}
                models={inst.models}
                mappings={mappings}
                onChanged={refresh}
              />
            ))}
          </AvailableGroup>
        ) : null}

        {dreaminaAvailable && !dreaminaConnected ? (
          <AvailableGroup title={t('onboardingProviders.drawer.dreaminaMember')} count={1} defaultExpanded={false}>
            <DreaminaMemberCard status={dreaminaStatus} onChanged={refresh} />
          </AvailableGroup>
        ) : null}

        {assistantAvailable && !assistantConnected ? (
          <AvailableGroup title={t('onboardingProviders.drawer.connectAssistant')} count={1} defaultExpanded={false}>
            <ConnectAssistantCard info={mcpInfo} onChanged={refresh} />
          </AvailableGroup>
        ) : null}

        {codexImageAvailable && !codexImageEnabled ? (
          <AvailableGroup title={t('onboardingProviders.drawer.localCodexImage')} count={1} defaultExpanded={false}>
            <CodexLocalImageCard enabled={false} onChanged={refresh} />
          </AvailableGroup>
        ) : null}
      </div>
      )}

      <OnboardingWizard
        opened={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCommitted={refresh}
        initialPreset={wizardPreset}
        // 验证失败时的终极逃生口：复用抽屉已有的 openCustomCall，不另造入口（§1.5 一功能一个家）。
        onSelfConnect={openCustomCall}
      />
      <CustomCallEditor target={customCallTarget} onClose={() => setCustomCallTarget(null)} onSaved={refresh} />
    </div>
  )
}
