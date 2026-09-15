import React from 'react'
import { useTranslation } from 'react-i18next'
import { DesignModal } from '../../design'
import { FeedbackShareContent } from './FeedbackShareContent'
import { type FeedbackOpenRequest } from './feedbackTypes'

// 情境入口（生成失败卡 → 「反馈此问题」）的浮层壳。画布里冒出来的失败卡天然没有设置外壳，
// 所以这条路径仍用 DesignModal 装同一份 FeedbackShareContent（variant='modal'）。
// 设置内的规范入口不走这里——它把 FeedbackShareContent 直接内嵌进设置弹窗右栏（见 AboutSection）。
// P1 加新必删旧：页面路由/表单/分享全搬进 FeedbackShareContent，这里不再自己写，避免两份实现漂移。
export function FeedbackShareDialog({
  opened,
  onClose,
  request = null,
}: {
  opened: boolean
  onClose: () => void
  request?: FeedbackOpenRequest | null
}): JSX.Element {
  const { t } = useTranslation()
  // 每次打开重新挂载内容（key 随打开次数递增），让 FeedbackShareContent 的 effect 从头跑一遍，
  // 把请求映射成起始页/意图/阶段——等价于旧实现里 opened→effect 的重置语义。
  const [openToken, setOpenToken] = React.useState(0)
  React.useEffect(() => {
    if (opened) setOpenToken((value) => value + 1)
  }, [opened])

  return (
    <DesignModal opened={opened} onClose={onClose} centered size="md" title={t('community.title')} padding="lg" closeOnClickOutside>
      <FeedbackShareContent key={openToken} request={request} variant="modal" />
    </DesignModal>
  )
}
