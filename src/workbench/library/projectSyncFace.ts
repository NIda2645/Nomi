import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react'
import type { WorkspaceSyncInspection } from '../../../electron/shared/workspaceSyncContracts'

/**
 * 同步角标的**说法表**：一个状态 → 角标短词 / 完整那句 / 浮层标题与解释 / 色调 / 图标。
 * 住在组件外面，因为它是纯的（可单测），而组件文件只导出组件（fast-refresh）。
 */
export type SyncTone = 'ready' | 'warn' | 'danger'

export type SyncFace = {
  /** 角标上那两到四个字。 */
  badge: string
  /** 完整那句（悬停提示 + 浮层标题下的解释）。 */
  full: string
  title: string
  hint: string
  tone: SyncTone
  Icon: typeof IconCircleCheck
}

export const SYNC_TONE_CLASS: Record<SyncTone, string> = {
  ready: 'text-workbench-success',
  warn: 'text-nomi-warning',
  danger: 'text-workbench-danger',
}

/**
 * 「继续创作」要不要先停在详情浮层——只有**停下来有用、而且浮层里有一条路走出去**的状态才拦：
 *
 * - `external-change`：另一台电脑刚写过，同步工具可能还在传。先停一下、点「重新检查」认下新版本就放行。
 * - `missing-assets`：**不拦**。缺的素材在画布上各自显示成缺失，项目其余部分照常能编辑；拦下来时浮层只有
 *   「重新检查 / 打开目录」，素材补不回来就永远进不去（2026-09-24 用户反馈：提示缺少素材后项目进不去了）。
 * - 清单读不下去（conflict / corrupt-manifest）：**不拦**。能不能打开、怎么从备份恢复归打开流程管
 *   （projectHydrationRecovery.ts 的 diagnose → recover），项目库再拦一道等于把恢复入口也堵死。
 */
export function syncStatusBlocksOpen(status: WorkspaceSyncInspection['status']): boolean {
  return status === 'external-change'
}

/** 状态 → 这一枚角标的全部长相。一个 switch，别在 JSX 里铺四层三元。 */
export function syncFaceOf(
  inspection: WorkspaceSyncInspection,
  t: (key: string, options?: Record<string, unknown>) => string,
): SyncFace {
  switch (inspection.status) {
    case 'ready':
      return {
        badge: t('library.syncBadgeReady'), full: t('library.syncReady'),
        title: t('library.syncDetailsReady'), hint: t('library.syncDetailsReadyHint'),
        tone: 'ready', Icon: IconCircleCheck,
      }
    case 'external-change':
      return {
        badge: t('library.syncBadgeExternalChange'), full: t('library.syncExternalChange'),
        title: t('library.syncDetailsExternal'), hint: t('library.syncDetailsExternalHint'),
        tone: 'warn', Icon: IconInfoCircle,
      }
    case 'missing-assets':
      return {
        badge: t('library.syncBadgeMissingAssets', { count: inspection.missingAssetCount }),
        full: t('library.syncMissingAssets', { count: inspection.missingAssetCount }),
        title: t('library.syncDetailsMissing'),
        hint: t('library.syncDetailsMissingHint', { count: inspection.missingAssetCount }),
        tone: 'warn', Icon: IconInfoCircle,
      }
    default:
      // conflict / corrupt-manifest：都是「这份项目文件此刻读不下去」，说法一样。
      return {
        badge: t('library.syncBadgeCorrupt'), full: t('library.syncCorrupt'),
        title: t('library.syncDetailsCorrupt'), hint: t('library.syncDetailsCorruptHint'),
        tone: 'danger', Icon: IconAlertTriangle,
      }
  }
}
