import React from 'react'
import { FeedbackShareDialog } from './FeedbackShareDialog'
import type { FeedbackOpenRequest } from './feedbackTypes'

/** 全局只挂一个反馈中心；设置入口和错误卡都通过同一事件抵达这里。 */
export function FeedbackShareHost(): JSX.Element {
  const [request, setRequest] = React.useState<FeedbackOpenRequest | null>(null)

  React.useEffect(() => {
    const handleOpen = (event: Event): void => {
      const detail = (event as CustomEvent<FeedbackOpenRequest>).detail
      setRequest(detail && typeof detail === 'object' ? detail : {})
    }
    window.addEventListener('nomi-open-feedback-share', handleOpen)
    return () => window.removeEventListener('nomi-open-feedback-share', handleOpen)
  }, [])

  return request ? <FeedbackShareDialog opened request={request} onClose={() => setRequest(null)} /> : <></>
}
