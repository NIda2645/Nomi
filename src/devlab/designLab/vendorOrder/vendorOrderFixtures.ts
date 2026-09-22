// 设计实验室 · 供应商偏好屏的夹具（只有数据，没有渲染）。
//
// 这些是**喂给现役函数的输入**，不是画出来的假图：`keepUsableModelRows`、
// `buildModelSelectOptions` 与 `sortModelProviders` 就是真机下拉里跑的那几个函数，
// 实验室只是给它们一份固定的目录。换句话说，屏上任何一行长成什么样、哪几行**没**出现，
// 都是生产代码决定的——夹具只决定「目录里有哪些模型、哪几家，以及哪几家接入了」。
//
// 关键：夹具喂进去的是**整份目录**（含没接入的家）。先把它们筛掉再喂，屏上「没接入的不出现」
// 就成了夹具自己造的假象，改坏生产代码照样绿——那正是这间实验室要消灭的东西。
import type { ModelOption } from '../../../config/models'
import type { ModelBoxPreferenceSettings } from '../../../../electron/shared/contracts/modelBoxPreference'

/** 内置中转两家 + 官方一家 + 一家没接入的。够覆盖偏好、分级、未接入三种来源。 */
export const VENDOR_APIMART = 'apimart'
export const VENDOR_KIE = 'kie'
export const VENDOR_VOLCENGINE = 'volcengine'
export const VENDOR_RUNNINGHUB = 'runninghub'

/** 这批夹具里「已接入」的那几家。 */
export const RUNNABLE_VENDORS: ReadonlySet<string> = new Set([VENDOR_APIMART, VENDOR_KIE, VENDOR_VOLCENGINE])

/**
 * **夹具整形器，不是判据**：把「目录层压根不会下发的行」从夹具里去掉。
 *
 * 「这个模型现在能不能用」的判据住在主进程（`electron/shared/modelAvailability.ts`），
 * 由 `src/config/modelCatalogCache.ts` 的 `keepUsableModelRows` 在**进入渲染层的第一处**执行，
 * 它的证据是 `modelCatalogCache.test.ts`。选择器这一屏拿到的永远是已放行的选项，
 * 所以这里只负责把夹具喂成那个样子——渲染层不该、也不再有第二份「能不能用」。
 */
export function onlyFromVendors(models: readonly ModelOption[], vendors: ReadonlySet<string>): ModelOption[] {
  return models.filter((model) => vendors.has(String(model.vendor || '').trim().toLowerCase()))
}

type Row = {
  label: string
  canonicalId: string
  vendors: readonly string[]
}

function toOptions(rows: readonly Row[]): ModelOption[] {
  return rows.flatMap((row) => row.vendors.map((vendor) => ({
    value: `${vendor}-${row.canonicalId}`,
    modelKey: `${vendor}-${row.canonicalId}`,
    label: row.label,
    vendor,
    meta: { archetypeId: 'agnes-image', canonicalModelId: row.canonicalId },
  })))
}

/** 三家都接入了：偏好顺序与供应商分级各自的效果都能在这一份上看出来。 */
export const CONFIGURED_MODELS: ModelOption[] = toOptions([
  {
    label: 'Seedream 4.5',
    canonicalId: 'seedream-4-5',
    vendors: [VENDOR_VOLCENGINE, VENDOR_APIMART, VENDOR_KIE],
  },
  { label: 'Nano Banana 2', canonicalId: 'nano-banana-2', vendors: [VENDOR_APIMART, VENDOR_KIE] },
  // 单家 = 另一种表达（厂商短名附注，没有 chip）。同屏放一条，两种表达的边界一眼可辨。
  { label: 'FLUX.2 Pro', canonicalId: 'flux-2-pro', vendors: [VENDOR_KIE] },
])

/**
 * 混合目录：RunningHub 这一家没接入。
 * 屏上应当**看不到** Kling 3 / Wan 2.6（只有那一家能跑），Seedream 4.5 也不该出现 RunningHub 那个 chip。
 */
export const MIXED_MODELS: ModelOption[] = toOptions([
  { label: 'Seedream 4.5', canonicalId: 'seedream-4-5', vendors: [VENDOR_APIMART, VENDOR_KIE, VENDOR_RUNNINGHUB] },
  { label: 'Nano Banana 2', canonicalId: 'nano-banana-2', vendors: [VENDOR_APIMART] },
  { label: 'Kling 3', canonicalId: 'kling-3', vendors: [VENDOR_RUNNINGHUB] },
  { label: 'Wan 2.6', canonicalId: 'wan-2-6', vendors: [VENDOR_RUNNINGHUB] },
])

// ── 同一家的多条连接（issue #831 拍板：只在重名时加「· 连接名」后缀） ──
//
// 这一份的关键在 `vendorName`：兄弟连接的 key 是 `apimart--mini`，而用户看到的是它自己起的名字。
// 屏上哪几行带后缀、哪几行不带，由现役的 `providerConnectionSuffixes` 算——夹具只提供
// 「同一个模型挂在同一家的两条连接下」这个事实。
export const VENDOR_APIMART_MINI = 'apimart--mini'

function toNamedOptions(rows: readonly { label: string; canonicalId: string; vendors: readonly { key: string; name: string }[] }[]): ModelOption[] {
  return rows.flatMap((row) => row.vendors.map((vendor) => ({
    value: `${vendor.key}-${row.canonicalId}`,
    modelKey: `${vendor.key}-${row.canonicalId}`,
    label: row.label,
    vendor: vendor.key,
    vendorName: vendor.name,
    meta: { archetypeId: 'agnes-image', canonicalModelId: row.canonicalId },
  })))
}

const APIMART_FULL = { key: VENDOR_APIMART, name: '满血组' }
const APIMART_MINI = { key: VENDOR_APIMART_MINI, name: 'Mini 特价组' }
const KIE_ONLY = { key: VENDOR_KIE, name: 'Kie' }
// EN 侧的连接名天然更长（R15：EN 串长是中文的 1.5-2 倍）。同屏放一行长名，
// 「chip 放得下吗」这件事就不用再靠另开一屏去验——第一版拼成「APIMart · 满血组」
// 正是栽在放不下上。
const APIMART_FULL_EN = { key: VENDOR_APIMART, name: 'Full tier' }
const APIMART_MINI_EN = { key: VENDOR_APIMART_MINI, name: 'Mini budget tier' }

/**
 * 三行，各钉一种情形：
 *  · Seedance 2.0     同一家两条连接 → 两个 chip 各显示**自己的连接名**；
 *  · Nano Banana 2    两家不同 root（APIMart / Kie）→ 仍是厂商短名，一个字都不改；
 *  · FLUX.2 Pro       只有一条连接 → 连 chip 都没有；
 *  · Kling 2.5        同 Seedance，但连接名是 EN 长串 → 钉住「放得下」。
 */
export const SIBLING_CONNECTION_MODELS: ModelOption[] = toNamedOptions([
  { label: 'Seedance 2.0', canonicalId: 'seedance-2-0', vendors: [APIMART_FULL, APIMART_MINI] },
  { label: 'Nano Banana 2', canonicalId: 'nano-banana-2', vendors: [APIMART_FULL, KIE_ONLY] },
  { label: 'FLUX.2 Pro', canonicalId: 'flux-2-pro', vendors: [KIE_ONLY] },
  { label: 'Kling 2.5', canonicalId: 'kling-2-5', vendors: [APIMART_FULL_EN, APIMART_MINI_EN] },
])

export const CONFIGURED_VENDOR_ENTRIES = [
  { vendorKey: VENDOR_APIMART, name: 'APIMart' },
  { vendorKey: VENDOR_KIE, name: 'Kie' },
  { vendorKey: VENDOR_VOLCENGINE, name: '火山方舟' },
]

// ── 模型框整理（2026-09-11 用户拍板的样张 Main.dc.html / PickerAfter.dc.html） ──
//
// 这一份夹具只决定「目录里有哪些模型、哪几家」；显示哪些、排在哪、哪个标签是蓝的，
// 全部由现役的 `partitionByModelBoxPreference` + `sortModelProviders` 算出来。
export const MODEL_BOX_MODELS: ModelOption[] = toOptions([
  { label: 'GPT Image 2', canonicalId: 'gpt-image-2', vendors: [VENDOR_APIMART, VENDOR_KIE] },
  { label: 'Nano Banana 2', canonicalId: 'nano-banana-2', vendors: [VENDOR_APIMART, VENDOR_KIE] },
  { label: 'Seedream 5.0 Pro', canonicalId: 'seedream-5-0-pro', vendors: [VENDOR_APIMART, VENDOR_KIE] },
  { label: 'FLUX.2 Pro', canonicalId: 'flux-2-pro', vendors: [VENDOR_KIE] },
  { label: 'Qwen-Image 3.0', canonicalId: 'qwen-image-3-0', vendors: [VENDOR_APIMART] },
  { label: 'Nano Banana 2 Lite', canonicalId: 'nano-banana-2-lite', vendors: [VENDOR_KIE] },
  { label: 'Seedream 5.0 Lite', canonicalId: 'seedream-5-0-lite', vendors: [VENDOR_KIE] },
  { label: 'Z-Image Turbo', canonicalId: 'z-image-turbo', vendors: [VENDOR_APIMART] },
])

/**
 * 样张里那台机器的偏好：藏了两个、手排过顺序、在 Nano Banana 2 上手点过 Kie。
 * 三个字段同时非空是有意的——它们在真机上本来就住同一张表、同一次读出来。
 */
export const MODEL_BOX_PREFERENCE: ModelBoxPreferenceSettings = {
  schemaVersion: 1,
  modelOrder: ['gpt-image-2', 'nano-banana-2', 'seedream-5-0-pro', 'flux-2-pro', 'qwen-image-3-0', 'nano-banana-2-lite'],
  hiddenModelIds: ['seedream-5-0-lite', 'z-image-turbo'],
  preferredVendorByModel: { 'nano-banana-2': VENDOR_KIE },
}
