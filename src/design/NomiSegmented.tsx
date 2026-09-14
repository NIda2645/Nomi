import React from 'react'
import { cn } from '../utils/cn'

/**
 * NomiSegmented —— 分段选择器（segmented control，设计系统通用件）。
 *
 * 视觉语言复用面板 tablist（OnboardingDrawer 素材来源切换）：容器 ink-05 圆角槽 + 选中项 paper
 * 浮起带轻影。用于「参数面板」这类少量离散档位的即点即改场景（2026-07-17 用户拍板的
 * 节点参数交互，样张 docs/design/mockups/node-param-panel.html）。
 * 选项超宽自动换行（flex-wrap，用户已接受）；禁用档置灰不可点。
 */

export type NomiSegmentedOption = {
  value: string
  /** 文本或自定义内容（如比例小图形 + 文字的竖排组合）。 */
  label: React.ReactNode
  /** 悬停提示（如价签全文）。 */
  title?: string
  disabled?: boolean
}

export type NomiSegmentedProps = {
  value: string
  options: NomiSegmentedOption[]
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  /** 每个分段项的附加类（如比例组统一双行高，保证图形/文字跨项对齐）。 */
  itemClassName?: string
  /** compact = 28px item height for dense canvas controls; default = 32px. */
  density?: 'compact' | 'default'
  /**
   * fill（默认）= 撑满父容器宽、超宽换行——参数面板用；
   * content = 按内容收缩成一行、各项仍等宽——放在 flex 工具条 / 绝对定位的浮层里用。
   * wrap = **每项按自己的内容宽**、一行放得下就一行、放不下按内容换行——参数摊开的默认摆法。
   *   为什么不是 fill：fill 让每项等宽并撑满父容器，7 个「1024x1024」于是各占一整行、每行大半空白
   *   （2026-09-14 用户退回单参数直出那一格的原话：「大片都是空白……减少空间浪费是我们核心设计原则之一」）。
   *   短标签用 wrap 也不会被撑宽，所以它同时收掉了「一个 720p 拉满一整条」那种空白。
   * column = **一项一行**、文字左对齐——只给**长枚举的搜索列表**用（导入工作流的模型文件名那类）：
   *   那条列表本来就是一列可滚的候选，不是一组并排的 chip。
   * 为什么要分：auto-fit 列数靠「父容器的确定宽度」算，父级是 flex 项或 shrink-to-fit 容器时宽度不定，
   * 浏览器按 min-content 只排出一列 → 四个工具竖着叠成一根柱子（2026-09-02 导演台顶栏栽过）。
   */
  fit?: 'fill' | 'content' | 'column' | 'wrap'
}

const FILL_STYLE: React.CSSProperties = { gridTemplateColumns: 'repeat(auto-fit, minmax(56px, 1fr))' }
const CONTENT_STYLE: React.CSSProperties = { gridAutoFlow: 'column', gridAutoColumns: '1fr', width: 'max-content' }
const COLUMN_STYLE: React.CSSProperties = { gridTemplateColumns: 'minmax(0, 1fr)' }
// wrap: flex 换行 + 项不 grow —— 宽度由内容派生（`repeat(auto-fit, minmax(max-content, 1fr))` 不合法：
// auto-fit 的轨道里不许出现 intrinsic 尺寸，所以这一档只能走 flex，不能继续用 grid）。
const WRAP_STYLE: React.CSSProperties = { display: 'flex', flexWrap: 'wrap' }

export function NomiSegmented({ value, options, onChange, ariaLabel, className, itemClassName, density = 'default', fit = 'fill' }: NomiSegmentedProps): JSX.Element {
  return (
    // grid 等宽列（2026-07-17 用户反馈：flex-1 下换行的孤项被拉伸，「多出来的选项要和其他一样大」）：
    // fill: auto-fit+minmax——所有项严格等宽；选项少于一行时空轨道塌陷、项拉伸**填满父容器**（1K/2K 两项
    // 各占一半，不缩在左边）；选项多于一行时与 auto-fill 无差（换行项与上行同宽）。
    // content: 单行 auto-flow column + auto-columns 1fr——宽度由最宽一项决定、各列等宽，不依赖父容器宽度。
    // 尺寸走 inline style 不用任意值类：dev 的 tailwind 生成缓存可能缺新类 → 布局静默塌（栽过两次）。
    <div
      className={cn(fit === 'wrap' ? 'rounded-nomi bg-nomi-ink-05 p-1 gap-1' : 'grid rounded-nomi bg-nomi-ink-05 p-1 gap-1', className)}
      style={fit === 'wrap' ? WRAP_STYLE : fit === 'content' ? CONTENT_STYLE : fit === 'column' ? COLUMN_STYLE : FILL_STYLE}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={option.title}
            disabled={option.disabled}
            onClick={() => { if (!on) onChange(option.value) }}
            // 换行点走 inline style 不用任意值类（与上面尺寸同理：dev 的 tailwind 缓存可能缺新类）。
            // 长模型文件名没有空格可断，不给 anywhere 就会横着溢出格子。
            // wrap 档：项不 grow、不 shrink 到看不清，宽度就是内容宽（标签短就不撑宽）。
            style={{
              minHeight: density === 'compact' ? 28 : 32,
              ...(fit === 'column' ? { overflowWrap: 'anywhere' } : {}),
              ...(fit === 'wrap' ? { flex: '0 0 auto' } : {}),
            }}
            className={cn(
              'px-2 py-1 rounded-nomi-sm border-0 text-caption cursor-pointer min-w-0',
              'inline-flex flex-col items-center justify-center gap-1 font-[inherit]',
              // 一列时每项是一整行：文字左对齐、读不完就换行（居中的长文件名是另一种乱）。
              fit === 'column' && 'flex-row items-center justify-start gap-2 text-left',
              'transition-colors duration-nomi-fast ease-nomi-fast',
              on
                ? 'bg-nomi-paper text-nomi-ink font-semibold shadow-nomi-sm'
                : 'bg-transparent text-nomi-ink-60 hover:text-nomi-ink-80',
              option.disabled && 'text-nomi-ink-30 hover:text-nomi-ink-30 cursor-not-allowed',
              itemClassName,
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
