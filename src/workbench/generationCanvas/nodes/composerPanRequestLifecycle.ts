export type ComposerPanRequestLatch = {
  /** 成功取得闸门时返回本次请求的 ACK；已有请求在途时返回 null。 */
  tryAcquire: () => (() => void) | null
  /** 几何已经满足时丢弃在途请求；迟到 ACK 不再触发重测。 */
  reset: () => void
}

/**
 * composer 自动避让的单请求闸。ACK 不区分动画完成还是被取消：两种情况都必须解除闸门并重测，
 * 因为被 fit/reset 取消后 composer 仍可能在视口外。
 */
export function createComposerPanRequestLatch(onReleased: () => void): ComposerPanRequestLatch {
  let activeRequest: symbol | null = null
  return {
    tryAcquire() {
      if (activeRequest) return null
      const request = Symbol('composer-pan-request')
      activeRequest = request
      return () => {
        if (activeRequest !== request) return
        activeRequest = null
        onReleased()
      }
    },
    reset() {
      activeRequest = null
    },
  }
}
