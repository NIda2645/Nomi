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
import type { TranslationKey } from '../../i18n/translationKey'

/**
 * 被拒的**原因**。刻意只收「挡住了用户本来想导入的东西」那几种。
 *
 * `skippedDuplicate` 故意不在里面：重复素材被跳过时，用户想要的那份**已经在库里**，
 * 什么都没被挡住。给它一个「反馈」入口会把一个正常结果说成问题。
 */
export const ASSET_IMPORT_REJECTIONS = ['too-large', 'over-limit', 'unsupported', 'failed'] as const
export type AssetImportRejection = (typeof ASSET_IMPORT_REJECTIONS)[number]

/** 码 → **整键**。`satisfies` 让编译器保证一个码都不漏、且每个键真的在词典里。 */
export const ASSET_IMPORT_REJECTION_TEXT_KEY = {
  'too-large': 'assetLibrary.skippedTooLarge',
  'over-limit': 'assetLibrary.skippedOverLimit',
  unsupported: 'assetLibrary.skippedUnsupported',
  failed: 'assetLibrary.skippedFailed',
} as const satisfies Record<AssetImportRejection, TranslationKey>

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
  readonly skippedTooLargeCount?: number
  readonly skippedOverLimitCount?: number
  readonly failedCount?: number
}

/**
 * 这次导入里**第一个挡住用户的**原因，连它的数量一起给。
 *
 * 只取第一个而不是全部：摘要行是一句话，而「为什么这次没进来」的第一个原因就足以定位；
 * 完整的计数用户仍在内联行上看得到（`skippedSummary` 把它们全列了）。
 * 顺序按「用户最可能想问为什么」排：超大 → 超单次上限 → 失败。
 */
export function firstAssetImportRejection(
  counts: RejectionCounts,
  unsupportedCount = 0,
): { rejection: AssetImportRejection; count: number } | null {
  if (counts.skippedTooLargeCount) return { rejection: 'too-large', count: counts.skippedTooLargeCount }
  if (counts.skippedOverLimitCount) return { rejection: 'over-limit', count: counts.skippedOverLimitCount }
  if (unsupportedCount > 0) return { rejection: 'unsupported', count: unsupportedCount }
  if (counts.failedCount) return { rejection: 'failed', count: counts.failedCount }
  return null
}
