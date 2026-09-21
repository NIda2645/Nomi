/**
 * 介入槽那一格的**外壳**——卡族共用的那一件。
 *
 * ## 它为什么被抽出来（2026-09-21 用户：「有弄我们的设计系统不？会不会格格不入？」）
 *
 * 反问卡改版时自带了一套外壳（纸色底 + 一圈发丝环 + 柔影 + 全圆角药丸按钮），
 * 单件取景框里看着挺好，**放回真面板就散了**：同一个槽里，付费确认卡是「accent 描边 +
 * 浅 accent 底的卡头条 + 分隔线 + ink 方角主按钮」，而反问卡在白底面板上**一点边界都没有**
 * ——分不清对话在哪结束、卡从哪开始（真机截图 `scratchpad/lane-renderer4/in-panel/`）。
 *
 * 「用了 token」不等于「放进去不突兀」：token 保证颜色取自同一套，保证不了两张卡是一家人。
 * 所以外壳收成这一件，两张卡都从这里取——改一次描边两张一起变，不会再有一张偷偷长成别的样子。
 *
 * ## 边界：它只管**壳**
 *
 * 壳 = 外框 / 圆角 / 底色 / 内边距 / 卡头条 / 页脚上那条分隔线。
 * 壳**不管**卡里放什么、按钮排在哪、有没有卡头——那是每张卡自己的结构：
 * · 确认卡 / 付费卡 / 计划卡：有卡头条（icon + 这次要动什么 + 徽章），主按钮在页脚左端；
 * · 反问卡：**没有卡头条**（问题本身就是标题，那是 Approval Card 的形状，也是这次
 *   把「需要你定一下」那句套话删掉的原因），页脚左端是页码、右端是跳过 + 主按钮。
 * 两者的差别是**有意的**，理由写在 `AgentPanelV4AskCard.tsx` 的对照表里；
 * 而外框、圆角、内边距、按钮族这些「一眼看出是不是一家人」的东西，从此只有一份。
 */
import React from 'react'
import { cn } from '../../../utils/cn'
import type { V4InterventionKind } from './agentPanelV4Types'

/**
 * 页脚里那颗**主按钮**的长相（卡族同一套）。
 *
 * 抽成常量而不是各写各的：这颗钮在付费卡上是「生成」、在确认卡上是「确认」、
 * 在反问卡上是「继续 / 发送」，三处长得必须一样。反问卡第一版用的是全圆角药丸
 * （Approval Card 的长相），在这个面板里是独一份——邻居全是方角 ink 钮。
 */
export const V4_SLOT_PRIMARY_BUTTON = 'h-7 rounded-nomi-sm border border-nomi-ink bg-nomi-ink px-2.5 text-nomi-paper disabled:opacity-40'

/** 页脚里那些**安静的**次动作（付费卡的「换模型」、反问卡的「跳过」）。 */
export const V4_SLOT_QUIET_BUTTON = 'h-7 rounded-nomi-sm px-2.5 text-nomi-ink-60 hover:bg-nomi-ink-05'

export function V4SlotShell({
  kind,
  head,
  footer,
  children,
  ...rest
}: {
  kind: V4InterventionKind
  /** 卡头条的内容。**缺席 = 不画那条带子**（反问卡就是这一档）。 */
  head?: React.ReactNode
  /** 页脚内容。缺席 = 没有页脚，也没有那条分隔线。 */
  footer?: React.ReactNode
  children: React.ReactNode
} & React.HTMLAttributes<HTMLElement>): JSX.Element {
  return (
    <aside
      {...rest}
      // `overflow-hidden` 是圆角要它：卡头条和页脚都铺满宽度，不裁就会在四角戳出方角。
      className={cn('overflow-hidden rounded-nomi border border-nomi-accent bg-nomi-paper', rest.className)}
      data-v4-block="intervention"
      data-kind={kind}
    >
      {head ? (
        <div className="flex min-w-0 items-center gap-1.5 bg-nomi-accent-soft px-2.5 py-2 text-caption font-semibold text-nomi-accent" data-v4-row="true">
          {head}
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5 px-2.5 py-2 text-caption text-nomi-ink">{children}</div>
      {footer ? (
        <footer className="flex flex-col gap-1.5 border-t border-nomi-line-soft px-2.5 py-2 text-caption">{footer}</footer>
      ) : null}
    </aside>
  )
}
