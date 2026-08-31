/**
 * 连接状态 → 卡片胶囊的映射（纯函数，好让单测直接钉住这张表）。
 * 内置家卡与自定义中转家卡共用（P1 不各写一份）。
 */
import type { VendorConnection } from './useVendorHealth'

export type VendorPill = {
  /** FoldableModelCard 的 status 槽：ok=绿点 / todo=灰点 / error=红底红字。 */
  status: 'ok' | 'todo' | 'error'
  labelKey: string
}

const BASE = 'onboardingProviders.vendorCard.connection'

/**
 * connection 为 null（这家还没填 key）时不该调这里——那张卡是「待接入」，
 * 由调用方交给 FoldableModelCard 的缺省文案。
 *
 * `unsupported` 故意长成和 `checking` 同款的安静灰点：这家没有可预检的接口
 * **不是**用户的问题，不值得用红色喊他；具体解释放展开后的 body（L3）。
 */
export function vendorConnectionPill(connection: VendorConnection): VendorPill {
  switch (connection.state) {
    case 'reachable':
      return { status: 'ok', labelKey: `${BASE}.reachable` }
    case 'unreachable':
      return { status: 'error', labelKey: `${BASE}.unreachable` }
    case 'checking':
      return { status: 'todo', labelKey: `${BASE}.checking` }
    case 'unsupported':
      return { status: 'todo', labelKey: `${BASE}.saved` }
  }
}
