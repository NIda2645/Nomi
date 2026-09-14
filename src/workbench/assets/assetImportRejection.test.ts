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
  })

  it('按「用户最想问为什么」排序取第一个', () => {
    expect(firstAssetImportRejection({ skippedTooLargeCount: 2, skippedOverLimitCount: 1, failedCount: 3 }))
      .toEqual({ rejection: 'too-large', count: 2 })
    expect(firstAssetImportRejection({ skippedOverLimitCount: 1, failedCount: 3 }))
      .toEqual({ rejection: 'over-limit', count: 1 })
    expect(firstAssetImportRejection({ failedCount: 3 }))
      .toEqual({ rejection: 'failed', count: 3 })
  })

  it('什么都没被挡住就返回 null —— 没有被拒就没有反馈入口', () => {
    expect(firstAssetImportRejection({})).toBeNull()
    expect(firstAssetImportRejection({ skippedTooLargeCount: 0, skippedOverLimitCount: 0, failedCount: 0 })).toBeNull()
  })

  it('出门的码带 asset-import- 前缀，与生成域的 asset-too-large 刻意分家', () => {
    expect(assetImportRejectionCode('too-large')).toBe('asset-import-too-large')
    expect(assetImportRejectionCode('unsupported')).toBe('asset-import-unsupported')
  })
})
