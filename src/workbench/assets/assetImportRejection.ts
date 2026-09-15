// 素材导入被拒的**码 → 人话**：这一族的唯一 owner。
//
// 为什么要有它（2026-09-15）：导入被拒是四个失败面之一，失败面上那颗「反馈」钮需要两样东西
// —— 一个稳定的机器码（用来在接收端按码聚类）和一句人话（印在摘要行上）。
// 人话**必须来自已经在用的那张表**（`src/i18n/locales/assetLibrary.ts` 的 `skipped*` 词条，
// 用户此刻就在内联行上读着它），不许为反馈另写一句：另写一句就是仓库里的第六张
// 错误码→人话表，而那一族的下场写在 `electron/shared/agentLane/laneErrorCodes.ts` 的头注释里。
//
// 所以这份文件里**一个新文案都没有**，只有「哪个计数对应哪个既有词条」这一层映射。
// 整键字面量存在这里而不是在用处拼 `assetLibrary.skipped${X}`：拼出来的动态前缀会盖掉
// 整个命名空间的死键检测（`src/i18n/translationKey.ts` 的理由）。
import i18n from '../../i18n'
import type { TranslationKey } from '../../i18n/translationKey'
import type { AudioImportResult } from './importAudioToLibrary'
import type { GenerationAssetImportResult } from '../generationCanvas/adapters/assetImportAdapter'
import { mediaImportRejectionMessages } from './mediaImportMessage'
import type { MediaImportRejection } from '../../../electron/shared/contracts/mediaImportPolicy'

/** 交给失败面那颗「反馈」钮的两样东西：给接收端聚类的码 + 印在摘要行上的人话。 */
export type AssetImportRejectionReport = { errorKind: string; summary: string }

/**
 * 被拒的原因 → **整键**。这张表同时是**闭合的原因清单**（类型从它派生，不另立一个只为派型
 * 而存在的数组）。`satisfies` 让编译器保证每个键真的在词典里。
 *
 * `skippedDuplicate` 故意不在里面：重复素材被跳过时，用户想要的那份**已经在库里**，
 * 什么都没被挡住。给它一个「反馈」入口会把一个正常结果说成问题。
 */
export const ASSET_IMPORT_REJECTION_TEXT_KEY = {
  'too-large': 'assetLibrary.skippedTooLarge',
  'over-limit': 'assetLibrary.skippedOverLimit',
  unsupported: 'assetLibrary.skippedUnsupported',
  failed: 'assetLibrary.skippedFailed',
} as const satisfies Record<string, TranslationKey>

export type AssetImportRejection = keyof typeof ASSET_IMPORT_REJECTION_TEXT_KEY

/**
 * 出门给接收端的机器码。`asset-import-*` 这个前缀是刻意的：它与
 * `electron/shared/nomiErrorCodes.ts` 的 `asset-too-large` **不是同一件事**——
 * 那个说的是生成时上传通道全挂（HTTP 413），这里说的是素材库导入被本地策略挡住。
 * 两者的下一步动作不同（一个得压缩换模型、一个得换文件），共用一个码会让分诊读错。
 */
export function assetImportRejectionCode(rejection: AssetImportRejection): string {
  return `asset-import-${rejection}`
}

type RejectionCounts = {
  /** #792 起「太大/装不下/类型不对」不再是一个计数，而是结构化的逐条拒收。 */
  readonly rejected?: readonly { readonly rejection: MediaImportRejection }[]
  readonly skippedOverLimitCount?: number
  readonly failedCount?: number
}

/**
 * 这次导入里**第一个挡住用户的**原因，连它的数量一起给。
 *
 * 只取第一个而不是全部：摘要行是一句话，而「为什么这次没进来」的第一个原因就足以定位；
 * 完整的计数用户仍在内联行上看得到（`skippedSummary` 把它们全列了）。
 * 顺序按「用户最可能想问为什么」排：超大 → 超单次上限 → 失败。
 *
 * `unsupported` 不在这里判：那一族在进导入器**之前**就被分流掉了
 * （`AssetLibraryPanel` 的 `splitFiles`），所以它由调用处直接报，不经过这份计数。
 */
export function firstAssetImportRejection(
  counts: RejectionCounts,
): { rejection: AssetImportRejection; count: number } | null {
  // 硬上限/磁盘装不下都是「太大」这一族（#792 的 over-hard-cap / no-disk-space）。
  const tooLarge = (counts.rejected ?? []).filter(
    (item) => item.rejection.reason === 'over-hard-cap' || item.rejection.reason === 'no-disk-space',
  ).length
  if (tooLarge) return { rejection: 'too-large', count: tooLarge }
  if (counts.skippedOverLimitCount) return { rejection: 'over-limit', count: counts.skippedOverLimitCount }
  if (counts.failedCount) return { rejection: 'failed', count: counts.failedCount }
  return null
}

/* ── 导入结果 → 用户看到的那句话 + 失败面那颗钮要的上下文 ──────────────────────────
 *
 * 这三个函数 2026-09-15 从 `AssetLibraryPanel.tsx` 搬过来（那份文件 851 行、破了 800 行上限）。
 * 搬到这里不只是为了让门岗绿：它们算的东西（哪个原因挡住了用户、那句人话是哪一条词条）
 * 本来就是这份 owner 的职责，留在组件里等于把这一族的判据劈成两半。
 *
 * 那句人话不在这里新写——它就是内联行上用户此刻正读着的同一句
 * （`ASSET_IMPORT_REJECTION_TEXT_KEY` 指回既有的 `assetLibrary.skipped*` 词条）。
 */
export function rejectionOf(rejection: AssetImportRejection, count: number): AssetImportRejectionReport {
  const sentence = i18n.t(ASSET_IMPORT_REJECTION_TEXT_KEY[rejection], { count })
  return {
    errorKind: assetImportRejectionCode(rejection),
    // `unsupported` 的词条本身已是整句（「已跳过 N 个不支持的文件」）；另外三条是片段，
    // 由 `skippedSummary` 包成整句 —— 和内联行里看到的逐字一致。
    summary: rejection === 'unsupported' ? sentence : i18n.t('assetLibrary.skippedSummary', { items: sentence }),
  }
}

export function reportMediaImport(
  result: GenerationAssetImportResult,
  present: (message: string) => void,
  onRejection?: (rejection: AssetImportRejectionReport) => void,
): void {
  const skipped: string[] = []
  for (const message of mediaImportRejectionMessages(result.rejected)) skipped.push(message)
  if (result.skippedOverLimitCount) skipped.push(i18n.t('assetLibrary.skippedOverLimit', { count: result.skippedOverLimitCount }))
  if (result.skippedDuplicateCount) skipped.push(i18n.t('assetLibrary.skippedDuplicate', { count: result.skippedDuplicateCount }))
  if (result.failedCount) skipped.push(i18n.t('assetLibrary.skippedFailed', { count: result.failedCount }))
  if (skipped.length) present(i18n.t('assetLibrary.skippedSummary', { items: skipped.join(i18n.t('assetLibrary.listSeparator')) }))
  const blocking = firstAssetImportRejection(result)
  if (blocking) onRejection?.(rejectionOf(blocking.rejection, blocking.count))
}

export function reportAudioImport(
  result: AudioImportResult,
  present: (message: string) => void,
  onRejection?: (rejection: AssetImportRejectionReport) => void,
): void {
  const skipped: string[] = []
  for (const message of mediaImportRejectionMessages(result.rejected)) skipped.push(message)
  if (result.skippedDuplicateCount) skipped.push(i18n.t('assetLibrary.skippedDuplicate', { count: result.skippedDuplicateCount }))
  if (result.failedCount) skipped.push(i18n.t('assetLibrary.skippedFailed', { count: result.failedCount }))
  if (skipped.length) present(i18n.t('assetLibrary.skippedSummary', { items: skipped.join(i18n.t('assetLibrary.listSeparator')) }))
  const blocking = firstAssetImportRejection(result)
  if (blocking) onRejection?.(rejectionOf(blocking.rejection, blocking.count))
}
