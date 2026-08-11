/**
 * 「这家现在能不能用」——供应商卡的连接状态单一来源。
 *
 * 旧实现把状态存在 VendorOnboardCard 的 React state 里，关面板重开就回 idle，
 * 于是测通过的家又显示「已保存 · 未测试」；而且只有粘贴 key 那一刻能测（renderer
 * 手上才有明文 key），卡上没有任何重测入口。现在探测整体在主进程，这里只订阅结果。
 *
 * 内置家与自定义中转家共用这一个 hook（P4 通用第一，P1 不各写一套）。
 */
import React from 'react'
import { getDesktopBridge } from '../../desktop/bridge'
import type { VendorHealth } from '../../desktop/onboardingBridgeTypes'

export type VendorConnection = {
  state: 'checking' | 'reachable' | 'unreachable' | 'unsupported'
  /** unreachable 时的人话原因（上游那句话 / 网络错描述）。 */
  reason?: string
  checkedAt?: number
}

/**
 * 渲染层的「上次已知结果」快照——**只**为消掉「每次重开面板先闪一下检查中再变绿」的抖动。
 * 真相源始终是主进程（它自带新鲜期缓存与并发去重）；这里按 vendorKey|baseUrl 归档，
 * 地址一改就不再命中，断开 key 时主动清除。不是第二份状态机，别往里加判断逻辑。
 */
const lastKnown = new Map<string, VendorHealth>()

export function useVendorHealth(
  vendorKey: string,
  { hasApiKey, baseUrl }: { hasApiKey: boolean; baseUrl: string },
): { connection: VendorConnection | null; recheck: () => void } {
  const fingerprint = `${vendorKey}|${baseUrl}`
  const [health, setHealth] = React.useState<VendorHealth | null>(() => lastKnown.get(fingerprint) ?? null)
  const [nonce, setNonce] = React.useState(0)
  // recheck 要的是「跳过缓存重探一次」，用 ref 传给下一次 effect，不进依赖数组（否则会自触发）。
  const forceRef = React.useRef(false)

  React.useEffect(() => {
    if (!hasApiKey) {
      lastKnown.delete(fingerprint)
      setHealth(null)
      return
    }
    const bridge = getDesktopBridge()
    if (!bridge?.onboarding?.vendorHealth) return
    const force = forceRef.current
    forceRef.current = false
    // 有快照且非强制 → 先显示上次结果（不闪），后台静默刷新；强制重检才回到「检查中」。
    setHealth(force ? null : lastKnown.get(fingerprint) ?? null)
    let alive = true
    void bridge.onboarding
      .vendorHealth({ vendorKey, force })
      .then((res) => {
        lastKnown.set(fingerprint, res)
        if (alive) setHealth(res)
      })
      .catch(() => {
        // 桥调用本身失败（后台未就绪）：保持「检查中」，下次开面板会再试。不伪造结论。
      })
    return () => {
      alive = false
    }
  }, [vendorKey, fingerprint, hasApiKey, nonce])

  const recheck = React.useCallback(() => {
    forceRef.current = true
    lastKnown.delete(fingerprint)
    setNonce((n) => n + 1)
  }, [fingerprint])

  // 没 key = 这张卡还是「待接入」，压根不该有连接状态。
  if (!hasApiKey) return { connection: null, recheck }
  if (health) return { connection: { state: health.state, reason: health.reason, checkedAt: health.checkedAt }, recheck }
  return { connection: { state: 'checking' }, recheck }
}
