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
import { IconX } from './AgentPanelV4Icons'
import type { V4InterventionKind } from './agentPanelV4Types'

/**
 * 页脚里那颗**主按钮**的长相（卡族同一套）。
 *
 * 抽成常量而不是各写各的：这颗钮在付费卡上是「生成」、在确认卡上是「确认」、
 * 在反问卡上是「继续 / 发送」，三处长得必须一样。反问卡第一版用的是全圆角药丸
 * （Approval Card 的长相），在这个面板里是独一份——邻居全是方角 ink 钮。
 */
export const V4_SLOT_PRIMARY_BUTTON = 'inline-flex h-7 items-center gap-1.5 rounded-nomi-sm border border-nomi-ink bg-nomi-ink px-2.5 text-nomi-paper disabled:opacity-40'

/**
 * 槽里那种**只有一个图标**的钮（确认卡页脚那颗 ×、反问卡右上那颗 ×）。
 *
 * 尺寸只写在这一处：原来两张卡各写各的（确认卡 22、反问卡 28），并排一量就差 6px。
 * 语义色不在这里给——确认卡那颗是「不要」（hover 转 danger），反问卡那颗是「这次不答」
 * （跳过不是破坏性动作，转红会把它说重了）。调用方各自补那一句。
 */
export const V4_SLOT_ICON_BUTTON = 'grid size-[22px] shrink-0 place-items-center rounded-nomi-sm text-nomi-ink-60 hover:bg-nomi-ink-05'

/** 页脚里那些**安静的**次动作（付费卡的「换模型」、反问卡的「跳过」）。 */
export const V4_SLOT_QUIET_BUTTON = 'h-7 rounded-nomi-sm px-2.5 text-nomi-ink-60 hover:bg-nomi-ink-05'

export function V4SlotShell({
  kind,
  title,
  dismiss,
  footer,
  children,
  ...rest
}: {
  kind: V4InterventionKind
  /**
   * 卡头那**一句话**（Recommendation Card 的形状：标题就是一句问话，
   * 「生成这 1 段视频？」）。缺席 = 这张卡自己在 `children` 里画标题——
   * 反问卡就是这一档：多题时标题要跟着题轨一起滑，钉在壳上就滑不动了。
   */
  title?: React.ReactNode
  /** 右上那颗 ×。**位置由外壳定死**，卡自己不摆——这是这次统一的重点之一。 */
  dismiss?: Readonly<{ label: string; onClick: () => void }>
  /**
   * 页脚。给的是一整块而不是「左/右」两个槽：付费卡的翻页器要**单独占一行**压在动作行上方
   * （它决定主按钮上印的那个数），拆成两个槽就摆不下了。
   * 左元信息 / 右动作那条排布由卡自己用一根 `flex-1` 垫片实现，写法三张卡一致。
   */
  footer?: React.ReactNode
  children: React.ReactNode
  // `title` 在这里是**卡头那句话**（可以是 JSX），不是 HTML 那个字符串 tooltip 属性；
  // 不 Omit 掉，两个同名字段会打架（tsc 当场报，不是运行时才发现）。
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>): JSX.Element {
  return (
    <aside
      {...rest}
      // 安静纸面 + 发丝线（2026-09-22 用户拍板：「他的设计好像更好看、简洁，
      // 我们原来的外壳看起来不优雅」）。三处换掉的东西：
      // · 彩色描边 → `border-nomi-line` 发丝线。蓝描边把每一张卡都喊成警告，
      //   而这个槽里大多数卡只是在问一句话。
      // · 卡底色 `--nomi-paper` → `--nomi-ink-05`：面板本身就是 paper，同色的卡在亮色下
      //   **一点边界都没有**（上一轮真面板截图量到的就是这个）。ink-05 是离面板最近的
      //   那一档，亮色下比白底暗一点、暗色下比 paper 亮一点，两轨都是「抬起来一档」。
      // · `overflow-hidden` 仍要：页脚铺满宽度，不裁会在圆角处戳出方角。
      className={cn('relative overflow-hidden rounded-nomi border border-nomi-line bg-nomi-ink-05 shadow-nomi-sm', rest.className)}
      data-v4-block="intervention"
      data-kind={kind}
    >
      {dismiss ? (
        <button
          type="button"
          aria-label={dismiss.label}
          title={dismiss.label}
          onClick={dismiss.onClick}
          data-v4-control="slot-dismiss"
          className={cn(V4_SLOT_ICON_BUTTON, 'absolute right-2 top-2 z-10')}
        >
          <IconX size={14} aria-hidden="true" />
        </button>
      ) : null}
      <div className="flex flex-col gap-1.5 px-2.5 py-2 text-caption text-nomi-ink">
        {title ? (
          // `pr-8` 给右上那颗 × 让位——两者同一行，不让位就会压在字上。
          <h3 className="m-0 pr-8 text-body font-medium text-nomi-ink" data-v4-block="slot-title">{title}</h3>
        ) : null}
        {children}
      </div>
      {footer ? (
        <footer className="flex flex-col gap-1.5 border-t border-nomi-line-soft px-2.5 py-2 text-caption">{footer}</footer>
      ) : null}
    </aside>
  )
}
