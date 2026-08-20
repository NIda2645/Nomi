// 角色圣经 · 锚 meta 键名 + 冻结/身份判据（渲染层镜像）。
//
// 单一真相源在 electron 侧 `electron/capabilityCore/anchorBible.ts`（headless/production 冻结门读它）；
// 渲染层反向 import 不了 electron 主进程模块，故这里放一份**纯镜像**（键名 + 判据），由
// `electron/capabilityCore/anchorBible.equivalence.test.ts` 逐项钉死 === electron 常量/判据——
// 漂移即测试红（照 nodeKindDomain 的「重复 + 等价测试守恒」先例）。这样 GUI 依赖波次（dependencyWaves）
// 与 headless 冻结门读的是**语义等价**的同一份判据，杜绝「GUI 写 staticFeatures、headless 读 static_features」。

/** 锚 meta 的语义键名（镜像 electron ANCHOR_META_KEYS）。 */
export const ANCHOR_META_KEYS = {
  referenceSheet: 'referenceSheet',
  staticFeatures: 'staticFeatures',
  dynamicFeatures: 'dynamicFeatures',
  frozen: 'frozen',
} as const

/** 视觉锚 kind：只有角色/场景/道具会生成参考卡、需要冻结；style 是文本锚不走冻结门。 */
const VISUAL_ANCHOR_KINDS: ReadonlySet<string> = new Set(['character', 'scene', 'prop'])

type AnchorNodeLike = {
  kind?: string
  meta?: Record<string, unknown> | null
  prompt?: string
}

function metaOf(node: AnchorNodeLike | undefined | null): Record<string, unknown> | undefined {
  const meta = node?.meta
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : undefined
}

/** 是否是「需要冻结的视觉锚」（镜像 electron isVisualAnchorNode）。 */
export function isVisualAnchorNode(node: AnchorNodeLike | undefined | null): boolean {
  const meta = metaOf(node)
  if (!meta || meta[ANCHOR_META_KEYS.referenceSheet] !== true) return false
  return VISUAL_ANCHOR_KINDS.has(String(node?.kind || ''))
}

/** 冻结判据（镜像 electron isAnchorFrozen）：frozen 是带正时间戳的对象才算已冻结。 */
export function isAnchorFrozen(node: AnchorNodeLike | undefined | null): boolean {
  const meta = metaOf(node)
  const mark = meta?.[ANCHOR_META_KEYS.frozen]
  if (!mark || typeof mark !== 'object' || Array.isArray(mark)) return false
  const at = (mark as Record<string, unknown>).at
  return typeof at === 'number' && Number.isFinite(at) && at > 0
}

/** 身份轴基准（镜像 electron anchorStaticFeatures）：优先 staticFeatures，退化到 prompt。 */
export function anchorStaticFeatures(node: AnchorNodeLike | undefined | null): string {
  const meta = metaOf(node)
  const staticFeatures = meta?.[ANCHOR_META_KEYS.staticFeatures]
  if (typeof staticFeatures === 'string' && staticFeatures.trim()) return staticFeatures.trim()
  const prompt = node?.prompt
  return typeof prompt === 'string' ? prompt.trim() : ''
}
