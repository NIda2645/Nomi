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
import { useTranslation } from 'react-i18next'
import { NomiSegmented, WorkbenchIconButton } from '../../../design'
import { cn } from '../../../utils/cn'
import { IconChevronRight, IconX } from './AgentPanelV4Icons'
import { V4Row } from './AgentPanelV4Row'
import type { InterventionData, V4InterventionKind } from './agentPanelV4Types'

// 这个文件**不定义任何按钮长相**。卡上的按钮一律是现役组件：
// 主动作 = `WorkbenchButton variant="primary" size="sm"`、次动作 = `WorkbenchButton size="sm"`、
// 图标钮 = `WorkbenchIconButton size="sm"`（`src/design/actions.tsx`，agent 专章 §8.1 的尺寸真相源）。
// 上一版这里有过三个自写的 className 常量——那正是 actions.tsx 文件头点名的病根：
// 「各处 ad-hoc className 各覆写一套 = 明显不是一个设计风格」。

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
      // **卡是 composer 的兄弟**（2026-09-22 用户看真机后的更正）：卡面底色、描边色与粗细、
      // 圆角，和同屏 composer 的外壳**逐字相同**——`AgentPanelV4Composer.tsx` 根节点就是
      // `rounded-nomi border border-nomi-line bg-nomi-paper`，没有阴影。
      //
      // 这里走过一次弯路：为了让白卡在白面板上有边界，上一版把卡面「抬一档」成 `ink-05`
      // 再加一层柔影。真机上一看就不对——亮色下卡成了一块发灰的禁用区，而正文里复用的
      // 节点参数条是按「放在白纸面上」设计的，白 chip 浮在灰卡上，和画布节点下那同一条
      // 参数条观感两样。设计系统 §2.1.1 写得很明白：`--nomi-paper` ＝ 卡片 / 浮层 / 面板表面。
      // 边界就用 composer 今天站得住的那同一条发丝线，不另造。
      //
      // 相比旧外壳删掉的两样不变：彩色（accent）描边、带底色的卡头条。
      // `overflow-hidden` 仍要：页脚铺满宽度，不裁会在圆角处戳出方角。
      className={cn('relative overflow-hidden rounded-nomi border border-nomi-line bg-nomi-paper', rest.className)}
      data-v4-block="intervention"
      data-kind={kind}
    >
      {dismiss ? (
        // 现役图标钮（28×28 · 7px 圆角 · 图标 16/stroke-2，agent 专章 §8.1）。否定动作全站统一是这颗 ×
        //（设计系统 §1.8 规则 4），文字只当无障碍名与 tooltip。
        <WorkbenchIconButton
          size="sm"
          icon={<IconX aria-hidden="true" />}
          label={dismiss.label}
          onClick={dismiss.onClick}
          data-v4-control="slot-dismiss"
          className="absolute right-1.5 top-1.5 z-10"
        />
      ) : null}
      <div className="flex flex-col gap-1.5 px-2.5 py-2 text-caption text-nomi-ink">
        {title ? (
          // `pr-8` 给右上那颗 × 让位——两者同一行，不让位就会压在字上。
          <h3 className="m-0 pr-8 text-body-sm font-semibold text-nomi-ink" data-v4-block="slot-title">{title}</h3>
        ) : null}
        {children}
      </div>
      {footer ? (
        <footer className="flex flex-col gap-1.5 border-t border-nomi-line-soft px-2.5 py-2 text-caption">{footer}</footer>
      ) : null}
    </aside>
  )
}

/**
 * 翻页器（`‹ 2/4 ›`）+ 范围切换（`逐镜 | 全部`）+ 键盘提示（`←→`）。
 *
 * **2026-09-10 v3：它从槽头搬到了动作行上方那一行。** 两条理由：
 *
 * ① 它现在决定主按钮上印的那个数——「逐镜」印这一页的价、「全部」印合计。
 *    改一个数的控件必须和那个数在一处，否则用户按下去之前得在两处之间来回对。
 * ② 槽头在 390px 面板里已经排满了（icon + 标题 + 「付费 · Nomi 选的」），
 *    再塞一个范围切换就会挤出视口——而范围切换和翻页器必须挨着（用户 2026-09-10：
 *    「翻页器旁加一个『全部』切换」）。
 *
 * 排布仍守 2026-09-09 的通用规则：三件都在内容流里紧跟彼此，**不靠自动外边距顶到右缘**
 * （`check:tokens` 对 `src/workbench/ai/` 是硬零——连注释里写出那个类名都会被它数进去）。
 *
 * 只有一项时调用方不传 `pager`，整行不渲染——「1/1」是一句废话，而单镜卡也没有「全部」可言。
 */
export function V4Pager({
  pager,
  onPage,
  onScope,
}: {
  pager: NonNullable<InterventionData['pager']>
  onPage?: (index: number) => void
  onScope?: (value: 'each' | 'all') => void
}): JSX.Element {
  const { t } = useTranslation()
  const step = (delta: number): void => onPage?.((pager.index + delta + pager.total) % pager.total)
  const arrow = 'flex size-5 shrink-0 items-center justify-center rounded-nomi-sm text-nomi-accent hover:bg-nomi-info-edge disabled:opacity-40'
  const scope = pager.scope
  return (
    <V4Row as="div" className="shrink-0 gap-0.5 font-normal" data-v4-block="pager">
      <button type="button" className={arrow} aria-label={t('agentPanelV4.pagerPrev')} disabled={pager.total < 2} onClick={() => step(-1)} data-v4-control="pager-prev">
        <IconChevronRight size={12} className="rotate-180" aria-hidden="true" />
      </button>
      <span className="tabular-nums text-micro">{`${pager.index + 1}/${pager.total}`}</span>
      <button type="button" className={arrow} aria-label={t('agentPanelV4.pagerNext')} disabled={pager.total < 2} onClick={() => step(1)} data-v4-control="pager-next">
        <IconChevronRight size={12} aria-hidden="true" />
      </button>
      {/* 键盘提示：只印两个箭头。它不是说明文字，是**告诉你这里有快捷键**的最短形式；
          写成「按左右键翻页」就是让用户多读一行（D1）。 */}
      {pager.keyHint ? (
        <span className="ml-1 shrink-0 select-none text-micro text-nomi-ink-40" data-v4-block="pager-keyhint">
          {pager.keyHint}
        </span>
      ) : null}
      {scope ? (
        <NomiSegmented
          value={scope.value}
          onChange={(value) => onScope?.(value === 'all' ? 'all' : 'each')}
          ariaLabel={scope.ariaLabel}
          density="compact"
          // 宽度下限不是凑数：NomiSegmented 的列是 `auto-fit, minmax(56px, 1fr)`，容器窄于
          // 「2×56 + 列间距 4 + 内边距 8 = 124」时 auto-fit 会塌成一列，两档就竖着摞起来。
          // 取 `w-36`（144px）而不是刚好够的 128：EN 的「Per shot」在 128 下折成两行
          //（2026-09-22 EN 真截图看出来的——截断只有眼睛看得出）。390px 的卡里这一行仍放得下。
          className="ml-1.5 w-36 shrink-0"
          options={[
            { value: 'each', label: scope.eachLabel },
            { value: 'all', label: scope.allLabel },
          ]}
        />
      ) : null}
    </V4Row>
  )
}
