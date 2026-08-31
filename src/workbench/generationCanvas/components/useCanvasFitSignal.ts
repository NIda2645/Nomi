import React from 'react'
import { useWorkbenchStore } from '../../workbenchStore'

/** 消费批量落节点发出的 fit 信号；用户在延迟期间切走分类时不抢回视口。 */
export function useCanvasFitSignal(fitView: (animate?: boolean) => void): void {
  const nonce = useWorkbenchStore((state) => state.canvasFitNonce)
  const categoryId = useWorkbenchStore((state) => state.canvasFitCategoryId)
  const fitViewRef = React.useRef(fitView)
  const lastNonceRef = React.useRef(0)
  fitViewRef.current = fitView

  React.useEffect(() => {
    if (nonce === 0 || nonce === lastNonceRef.current) return
    lastNonceRef.current = nonce
    const tid = setTimeout(() => {
      if (categoryId && useWorkbenchStore.getState().activeCategoryId !== categoryId) return
      fitViewRef.current(true)
    }, 360)
    return () => clearTimeout(tid)
  }, [categoryId, nonce])
}
