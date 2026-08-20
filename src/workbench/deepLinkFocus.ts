// 深链「指着看某一镜」的等待逻辑（纯逻辑，依赖注入，可裸测）。
//
// 为什么需要它：`nomi://…/node/{id}` 点进来时，工程刚 hydrate，画布节点还在异步落库→入 store 的路上。
// 此刻直接派 FOCUS_GENERATION_NODE_EVENT，画布那侧查不到节点会弹「源节点已不存在」——**节点明明在，
// 只是还没到**。给用户看一句假警告，比不跳还糟。故：等到节点真出现再派；等不到就静默停在工程页
// （工程已经打开了，用户至少到了对的地方），不编造错误。

export const DEEP_LINK_FOCUS_MAX_ATTEMPTS = 40 // 约 40 帧 ≈ 0.7s@60fps：够覆盖 hydrate 落库，又不会挂太久

export async function focusCanvasNodeWhenReady(input: {
  nodeId: string
  /** 节点此刻在不在 store 里。 */
  hasNode: () => boolean
  /** 真派事件（生产环境即 dispatch FOCUS_GENERATION_NODE_EVENT）。 */
  dispatch: (nodeId: string) => void
  /** 等一帧（生产环境 requestAnimationFrame；测试里同步 resolve）。 */
  waitFrame: () => Promise<void>
  maxAttempts?: number
}): Promise<boolean> {
  const nodeId = String(input.nodeId || '').trim()
  if (!nodeId) return false
  const maxAttempts = input.maxAttempts ?? DEEP_LINK_FOCUS_MAX_ATTEMPTS
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (input.hasNode()) {
      input.dispatch(nodeId)
      return true
    }
    await input.waitFrame()
  }
  return false
}
