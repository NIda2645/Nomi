import { describe, expect, it } from 'vitest'
import {
  ASSET_IMPORT_REJECTIONS,
  ASSET_IMPORT_REJECTION_TEXT_KEY,
  assetImportRejectionCode,
  firstAssetImportRejection,
} from './assetImportRejection'
import { zhAssetLibrary, enAssetLibrary } from '../../i18n/locales/assetLibrary'

describe('导入被拒：码 → 人话的唯一 owner', () => {
  it('每个码都指回**既有**的 assetLibrary 词条（这份文件里不许有新文案）', () => {
    for (const rejection of ASSET_IMPORT_REJECTIONS) {
      const key = ASSET_IMPORT_REJECTION_TEXT_KEY[rejection]
      const leaf = key.replace('assetLibrary.', '') as keyof typeof zhAssetLibrary
      expect(zhAssetLibrary[leaf], `${rejection} 的中文词条`).toBeTruthy()
      expect(enAssetLibrary[leaf], `${rejection} 的英文词条`).toBeTruthy()
    }
  })

  it('重复素材**不是**被拒：它那一份已经在库里，什么都没被挡住', () => {
    expect(ASSET_IMPORT_REJECTIONS).not.toContain('duplicate')
    expect(firstAssetImportRejection({ skippedTooLargeCount: 0, failedCount: 0 }, 0)).toBeNull()
  })

  it('按「用户最想问为什么」排序取第一个', () => {
    expect(firstAssetImportRejection({ skippedTooLargeCount: 2, skippedOverLimitCount: 1, failedCount: 3 }))
      .toEqual({ rejection: 'too-large', count: 2 })
    expect(firstAssetImportRejection({ skippedOverLimitCount: 1, failedCount: 3 }))
      .toEqual({ rejection: 'over-limit', count: 1 })
    expect(firstAssetImportRejection({ failedCount: 3 }, 5))
      .toEqual({ rejection: 'unsupported', count: 5 })
    expect(firstAssetImportRejection({ failedCount: 3 }))
      .toEqual({ rejection: 'failed', count: 3 })
  })

  it('什么都没被挡住就返回 null —— 没有被拒就没有反馈入口', () => {
    expect(firstAssetImportRejection({})).toBeNull()
    expect(firstAssetImportRejection({ skippedTooLargeCount: 0 }, 0)).toBeNull()
  })

  it('出门的码带 asset-import- 前缀，与生成域的 asset-too-large 刻意分家', () => {
    expect(assetImportRejectionCode('too-large')).toBe('asset-import-too-large')
    expect(assetImportRejectionCode('unsupported')).toBe('asset-import-unsupported')
    // 分家的理由是下一步动作不同：生成域那个要压缩/换模型，这里这个要换文件。
    expect(assetImportRejectionCode('too-large')).not.toBe('asset-too-large')
  })
})
