import React from 'react'
import { cn } from '../utils/cn'

// 播放守卫的可视半边（与 useVideoPlaybackHeal 配套）：自愈中说「修复中」，修不了说人话原因。
// 单独抽出来是为了各播放面盖的这层长得一模一样——此前只有画布节点有，其余面失败时一片空白。
export function VideoPlaybackStatusOverlay({
  healingText,
  failureText,
  className,
}: {
  healingText: string
  failureText: string
  className?: string
}): JSX.Element | null {
  const text = healingText || failureText
  if (!text) return null
  return (
    <div
      className={cn(
        'absolute inset-0 z-[2] flex items-center justify-center p-3',
        'pointer-events-none bg-nomi-ink-05',
        className,
      )}
    >
      <span className={cn('max-w-full text-center text-caption leading-snug text-nomi-ink-60')}>{text}</span>
    </div>
  )
}
