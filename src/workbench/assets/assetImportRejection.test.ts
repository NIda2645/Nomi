import { describe, expect, it } from 'vitest'
import {
  ASSET_IMPORT_REJECTION_TEXT_KEY,
  assetImportRejectionCode,
  firstAssetImportRejection,
} from './assetImportRejection'

// 「每个码都指回一条真实存在的词条」由 `satisfies Record<string, TranslationKey>` 在编译期管住，
// 所以这里不再写那条运行时循环——它只会在 tsc 已经红了的时候再红一次。

describe('导入被拒：码 → 人话的唯一 owner', () => {
  it('重复素材**不是**被拒：它那一份已经在库里，什么都没被挡住', () => {
    expect(Object.keys(ASSET_IMPORT_REJECTION_TEXT_KEY)).not.toContain('duplicate')
    // 「过大 / 没磁盘 / 类型不收」也不在这张计数表里：它们的人话由准入闸派生（带真实数字）。
    expect(Object.keys(ASSET_IMPORT_REJECTION_TEXT_KEY)).not.toContain('too-large')
  })

  it('按「用户最想问为什么」排序取第一个：准入闸挡下 → 超单次上限 → 失败', () => {
    // 准入闸那支的人话来自 mediaImportMessage（带真实字节数与上限），码带 policy 的 reason。
    const policy = firstAssetImportRejection({
      rejected: [{ fileName: 'big.mp4', rejection: { reason: 'over-hard-cap', fileBytes: 3e9, capBytes: 2e9, because: '硬上限' } }],
      skippedOverLimitCount: 1,
      failedCount: 3,
    })
    expect(policy?.errorKind).toBe('asset-import-over-hard-cap')
    expect(policy?.summary).toContain('big.mp4')
    expect(firstAssetImportRejection({ skippedOverLimitCount: 1, failedCount: 3 })?.errorKind)
      .toBe('asset-import-over-limit')
    expect(firstAssetImportRejection({ failedCount: 3 })?.errorKind).toBe('asset-import-failed')
  })

  it('什么都没被挡住就返回 null —— 没有被拒就没有反馈入口', () => {
    expect(firstAssetImportRejection({})).toBeNull()
    expect(firstAssetImportRejection({ rejected: [], skippedOverLimitCount: 0, failedCount: 0 })).toBeNull()
  })

  it('出门的码带 asset-import- 前缀，与生成域的 asset-too-large 刻意分家', () => {
    expect(assetImportRejectionCode('over-limit')).toBe('asset-import-over-limit')
    expect(assetImportRejectionCode('unsupported')).toBe('asset-import-unsupported')
    // 准入闸的 reason 直接当码用：分诊按它聚类，不再另立一套自己的名字。
    expect(assetImportRejectionCode('no-disk-space')).toBe('asset-import-no-disk-space')
  })
})
