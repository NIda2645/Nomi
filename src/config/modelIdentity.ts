// 模型身份（canonical model id）+ 去重聚合 —— 治本「画布弹窗一大堆模型」的领域层（单一真相）。
//
// 根因（见 docs/plan/2026-06-23-model-picker-identity-dedup.md）：同一个底层模型被每个供应商
// 各列一份（火山/apimart/kie 对 Seedream 各用不同 modelKey），弹窗只按 modelKey 字符串去重、
// 认不出是同一个 → 平铺重复。这里给模型立「版本级 canonical 身份」，同模型只呈现一次、
// 收集所有能调它的供应商（providers[]），把「选哪家」交给上层（自动选最优 + 可锁）。
//
// 去重键优先级（版本级，非 archetype 家族级——archetype 会错误合并 Seedream 5.0/4.5/4.0）：
//   1) 显式 meta.canonicalModelId（curated 给跨供应商同模型打的稳定 id，唯一真相）
//   2) 规范化 labelZh（去能力后缀/空格/大小写；火山「Seedream 4.5」与 apimart「Seedream 4.5」→ 合并）
//   3) 兜底 value/modelKey（认不出的中转模型——不合并，各自独立，符合预期）
import type { ModelOption } from './models'
import { compareVendorLanding } from '../../electron/shared/contracts/vendorPreference'

export interface ModelProviderRef {
  vendor?: string
  modelKey?: string
  modelAlias?: string | null
  option: ModelOption
}

export interface DedupedModel {
  /** 版本级 canonical 身份；全 App 同一模型唯一。 */
  canonicalId: string
  /** 展示名（取首个供应商的 label）。 */
  label: string
  /** 是否有内置档案身份（archetype）——认得的进主列表，认不出的沉「其他」。 */
  recognized: boolean
  /** 所有精确调用身份（去重相同 vendor+modelKey）；同一家可有多个明确变体。 */
  providers: ModelProviderRef[]
}

/** Shared folding policy for raw catalog rows and canonical model selectors. */
export function isLegacyCatalogMeta(meta: unknown): boolean {
  return Boolean(meta && typeof meta === 'object' && (meta as Record<string, unknown>).catalogLifecycle === 'legacy')
}

export type CatalogLifecycle = 'flagship' | 'value' | 'legacy' | 'companion'

const CATALOG_LIFECYCLE_RANK: Record<CatalogLifecycle, number> = {
  flagship: 0,
  value: 1,
  companion: 2,
  legacy: 3,
}

function explicitCatalogLifecycle(option: ModelOption): CatalogLifecycle | null {
  const value = readMeta(option).catalogLifecycle
  return value === 'flagship' || value === 'value' || value === 'legacy' || value === 'companion' ? value : null
}

/** A merged model uses its strongest explicit curated route. Unknown/custom names are never classified heuristically. */
export function modelCatalogLifecycle(model: DedupedModel): CatalogLifecycle | null {
  let lifecycle: CatalogLifecycle | null = null
  for (const provider of model.providers) {
    const candidate = explicitCatalogLifecycle(provider.option)
    if (candidate && (!lifecycle || CATALOG_LIFECYCLE_RANK[candidate] < CATALOG_LIFECYCLE_RANK[lifecycle])) {
      lifecycle = candidate
    }
  }
  return lifecycle
}

export function sortModelsByCatalogLifecycle(models: readonly DedupedModel[]): DedupedModel[] {
  return models
    .map((model, index) => ({ model, index, lifecycle: modelCatalogLifecycle(model) }))
    .sort((left, right) => {
      // Unclassified user models stay with companion routes. Stable index keeps their own order intact.
      const leftRank = left.lifecycle ? CATALOG_LIFECYCLE_RANK[left.lifecycle] : CATALOG_LIFECYCLE_RANK.companion
      const rightRank = right.lifecycle ? CATALOG_LIFECYCLE_RANK[right.lifecycle] : CATALOG_LIFECYCLE_RANK.companion
      return leftRank - rightRank || left.index - right.index
    })
    .map(({ model }) => model)
}

// 能力后缀：kie 把 GPT Image 2 拆成「· 文生图」「· 图生图」两行——去掉后缀让它们与
// apimart 的「GPT Image 2」合并成一个模型。
const CAPABILITY_SUFFIX_RE = /\s*[·•・]\s*(文生图|图生图|改图|文生视频|图生视频|首尾帧|参考图?|编辑).*$/u

function readMeta(option: ModelOption): Record<string, unknown> {
  return option?.meta && typeof option.meta === 'object' ? (option.meta as Record<string, unknown>) : {}
}

export function normalizeModelLabel(label: string): string {
  return label
    .replace(CAPABILITY_SUFFIX_RE, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function deriveCanonicalModelId(option: ModelOption): string {
  const meta = readMeta(option)
  const explicit = typeof meta.canonicalModelId === 'string' ? meta.canonicalModelId.trim() : ''
  if (explicit) return explicit
  const label = typeof option?.label === 'string' ? option.label : ''
  const norm = normalizeModelLabel(label)
  if (norm) return norm
  return (option?.value || option?.modelKey || '').trim()
}

export function isRecognizedModel(option: ModelOption): boolean {
  const meta = readMeta(option)
  return typeof meta.archetypeId === 'string' && meta.archetypeId.trim().length > 0
}

// 供应商分级与「先走哪家」的比较子都住 `electron/shared/contracts/vendorPreference.ts`：
// 渲染层的选择器和主进程的执行侧必须是逐字同一把尺，否则「界面显示一家、钱花另一家」。
// 这里只转出去给渲染层现有的导入方用，本文件不再写第二份表（2026-09-22 总合并）。
export { vendorTier } from '../../electron/shared/contracts/vendorPreference'

/** 按 canonical 身份聚合：同模型只一条，收集所有供应商；保持首次出现顺序。 */
export function dedupeModelOptions(options: ModelOption[]): DedupedModel[] {
  if (!Array.isArray(options)) return []
  const byId = new Map<string, DedupedModel>()
  const order: string[] = []
  for (const option of options) {
    if (!option) continue
    const canonicalId = deriveCanonicalModelId(option)
    if (!canonicalId) continue
    const ref: ModelProviderRef = {
      vendor: option.vendor,
      modelKey: option.modelKey,
      modelAlias: option.modelAlias ?? null,
      option,
    }
    const existing = byId.get(canonicalId)
    if (existing) {
      const dup = existing.providers.some((p) => p.vendor === ref.vendor && p.modelKey === ref.modelKey)
      if (!dup) existing.providers.push(ref)
      existing.recognized = existing.recognized || isRecognizedModel(option)
      continue
    }
    byId.set(canonicalId, {
      canonicalId,
      // 展示名去能力后缀（kie 把 GPT Image 2 拆「· 文生图/· 图生图」两行，合并成一条后
      // 不该带着首家的后缀当组名）；无后缀的 label 原样。
      label: option.variant?.familyLabel || (option.label || canonicalId).replace(CAPABILITY_SUFFIX_RE, '').trim() || canonicalId,
      recognized: isRecognizedModel(option),
      providers: [ref],
    })
    order.push(canonicalId)
  }
  return sortModelsByCatalogLifecycle(order.map((id) => byId.get(id) as DedupedModel))
}

/**
 * 一条**只记了模型名、没记供应商**的已存选择（旧镜头 / 旧锚 / 旧节点），而目录里有好几家同名——读回哪一家。
 *
 * 这是全仓的**唯一**判定口：分镜/画布的回显（`findModelOptionByIdentifier` → 模型框）与执行
 * （`buildModelEntryIndex` 的裸 key 回落 → 真正发请求的那家）都调它，所以**界面上显示哪家，钱就花在哪家**。
 *
 * 规则（从强到弱）：
 *   1. 用户在设置里排的供应商顺序；
 *   2. `vendorTier`：官方 > 内置中转（apimart/kie/newapi）> 用户自接/未知；
 *   3. 目录原序（纯为稳定）。
 *
 * 为什么不是「目录里第一条」：目录是新接入的在前，用户刚自定义了一个同名模型，它就会悄悄顶掉
 * 原来那家（2026-09-21 群反馈：自定义 gpt-image-2 之后 APIMart 那条「选不上」、钱花去了自定义那家）。
 * 为什么不含 `sortModelProviders` 的「显示名字母序」那一级：执行侧的模型清单没有显示名，
 * 两边必须是逐字同一把尺，否则回显与请求会在同级的两家之间分叉。
 *
 * 只在「没记供应商」时才用得上：记了供应商的选择永远按 (modelKey, vendor) 精确命中，不许经这里换家。
 */
export function pickImplicitVendorMatch<T>(
  matches: readonly T[],
  vendorOf: (match: T) => string | null | undefined,
  orderedVendorKeys: readonly string[] = [],
): T | undefined {
  if (matches.length <= 1) return matches[0]
  // 前两级（用户排过的顺序 → 供应商分级）住 `electron/shared/contracts/vendorPreference.ts`，
  // 执行侧用的是同一个比较子；这里只补第三级「目录原序」。
  const scored = matches.map((match, index) => ({ match, index, vendor: vendorOf(match) }))
  scored.sort((a, b) => compareVendorLanding(a.vendor, b.vendor, orderedVendorKeys) || (a.index - b.index))
  return scored[0]!.match
}

/**
 * 「同一个模型，先走哪家」的**唯一**排序规则——每个模型选择器、自动选家、批量摊平都用这一份。
 *
 * 三级判据，从强到弱：
 *   1. **用户的优先供应商顺序**（设置 → AI 策略）。用户明说过的话，就按他说的来。
 *   2. **供应商分级** `vendorTier`：官方 > 内置中转 > 用户自接/未知。用户没说过话时的默认，
 *      也是 2026-06-23 起「自动选最优」一直用的那把尺——**这一级不能省**：省掉它就退化成按厂商名
 *      字母序，同一个模型的默认家会从火山方舟静默漂到 apimart，而没有任何人做过这个决定。
 *   3. 厂商显示名字母序 → catalog 原序（纯为稳定，不携带任何偏好语义）。
 *
 * 这里**不再有**「能不能跑」那一级：没接入的家在 catalog 派生层
 * （`keepUsableModelRows`，判据在主进程 `electron/shared/modelAvailability.ts`）就已经不存在了，排到这里的每一家都能跑。
 */
export function sortModelProviders<T extends ModelProviderRef>(providers: readonly T[], orderedVendorKeys: readonly string[] = []): T[] {
  // 前两级（用户排过的顺序 → `vendorTier` 分级）由共享比较子给，与执行侧逐字同一把尺；
  // 这里只补第三级「厂商显示名字母序 → 目录原序」（纯为稳定，不携带任何偏好语义）。
  return providers.map((provider, index) => ({ provider, index })).sort((a, b) => {
    const landing = compareVendorLanding(a.provider.vendor, b.provider.vendor, orderedVendorKeys)
    if (landing) return landing
    return (a.provider.option.vendorName || a.provider.vendor || '').localeCompare(b.provider.option.vendorName || b.provider.vendor || '', undefined, { sensitivity: 'base' }) || a.index - b.index
  }).map(({ provider }) => provider)
}

