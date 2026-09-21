/**
 * 反问卡 = **整件还原** Beautiful UI 的 Approval Card。
 *
 * 实物：`https://www.beautifului.dev/#approval-card`；源码 registry：
 * `https://beautifului.dev/r/approval-card.json`（单文件 `components/primitives/ApprovalCard.tsx`，
 * 419 行；依赖 `foundation` / `button` / `glide-menu` 三件也取了）。
 * 上一版是把它拆成零件再自拼（卡头一句套话 + 一排方框 chip + 带框输入），用户退回了。
 * 这一版逐件照搬，**只换 Nomi 的 token / 图标 / i18n**：
 *
 * | Approval Card | 这里 | 换了什么 |
 * |---|---|---|
 * | 问题作标题 + 右上 × | 同 | 文案走 i18n；× 用 `IconX` |
 * | 竖排整行可点的 radio / check 行，无方框 | 同 | 圆角 8px → `rounded-nomi-sm`(6px)，底色 → `bg-nomi-ink-05` |
 * | `GlideMenu` 一条滑动高亮带 | 同 | 220ms 曲线照搬；`prefers-reduced-motion` 下不滑 |
 * | 末行无边框内联「Something else…」 | 同 | 占位走 i18n |
 * | 卡高随题滑动 + 题轨 translate3d | 同 | 360ms `cubic-bezier(.22,1,.36,1)` 照搬 |
 * | 左下 `1/3` 页码（滚动） | 同 | 只有一题时整段不渲染 |
 * | 右下安静 Skip + 主按钮 Continue/Send | 同 | 主按钮用 Nomi 家的 ink 主钮（见下） |
 * | 单选点了自动前进（480ms）、多选等按钮 | 同 | — |
 * | 全部答完收成一行回执 | 同 | 回执文案走 i18n |
 *
 * **我们只加两样**（任务书允许的领域扩展）：选项第二行 `description`（次级色）与「推荐」标
 * （推荐项排第一，`orderedAskOptions`）。
 *
 * 一处**有意的偏差**，记在这里免得被当成手滑：实物的主按钮是 accent 蓝药丸，这里用
 * `bg-nomi-ink text-nomi-paper`。理由有两条且都不是审美——① Approval Card 源码自己的
 * 文件头注释写的是「a quiet Skip and a **dark** Continue」，蓝是它 demo 站的 `accent` 变体；
 * ② Nomi 这个面板里「一屏一个主动作」的主钮**全部**是 ink（`V4Intervention` 的确认钮、
 * composer 的发送钮），这里独一份蓝反而会让人以为它是另一种东西。
 * 另一处：实物页脚没渲染 ⏎（源码注释写了、JSX 里漏了），回车确实是它的快捷键，
 * 所以这里把 ⏎ 补上——补的是作者写在注释里的意图。
 */
import React from 'react'
import { cn } from '../../../utils/cn'
import { IconChevronDown, IconCheck, IconX } from './AgentPanelV4Icons'
import {
  ASK_AUTO_ADVANCE_MS,
  EMPTY_ASK_DRAFT,
  askCardAnswer,
  askOptionIndexForArrow,
  askOptionIndexForKey,
  askQuestionAnswered,
  isLastAskQuestion,
  orderedAskOptions,
  shouldAutoAdvance,
  shouldShowPager,
  toggleAskOption,
  type V4AskAnswer,
  type V4AskDraft,
  type V4AskQuestion,
} from './agentPanelV4AskModel'

export type V4AskCardLabels = Readonly<{
  /** 右上那颗 × 的无障碍名（= 跳过这次提问）。 */
  dismiss: string
  skip: string
  continueLabel: string
  send: string
  customPlaceholder: string
  recommended: string
  /** 页码的无障碍名（`第 2 题，共 3 题`）。 */
  step: (index: number, total: number) => string
  prev: string
  next: string
}>

/** 滑动曲线与时长照搬 Approval Card 的 `SLIDE`。 */
const SLIDE = '360ms cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * 「这台机器要求别动画」。
 *
 * `matchMedia` 存在性要单独判：这个函数在**渲染期**被调用（滑动带的 `transition` 要它），
 * 而渲染期跑在的不只是浏览器——静态标记渲染（组件单测走的那条）里 `window` 在、
 * `matchMedia` 不在，少这一句就是一条 `TypeError`，整张卡渲不出来。
 * 探测不到就按「可以动」算：动效是默认，缺的是那份偏好不是那份权利。
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 一条滑动高亮带（Approval Card 的 `GlideMenu`）。
 *
 * 它是**这张卡上唯一的选中/悬停反馈**——正因为有它，选项行才不需要各自长一个方框。
 * 上一版每颗 chip 自带 `border` 就是把这件事做反了：三颗宽度不一的框，用户读到的是
 * 「这三个是三种不同的东西」。
 */
function AskGlideMenu({ children, className }: { children: React.ReactNode; className?: string }): JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null)
  const [box, setBox] = React.useState<{ top: number; height: number } | null>(null)
  const [visible, setVisible] = React.useState(false)
  const moveTo = (target: EventTarget | null): void => {
    const container = ref.current
    if (!(target instanceof Element) || !container) return
    const row = target.closest('[data-ask-row]')
    if (!(row instanceof HTMLElement) || !container.contains(row)) return
    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    setBox({ top: rowRect.top - containerRect.top, height: rowRect.height })
    setVisible(true)
  }
  return (
    <div
      ref={ref}
      onMouseOver={(event) => moveTo(event.target)}
      onMouseLeave={() => setVisible(false)}
      onFocusCapture={(event) => moveTo(event.target)}
      onBlurCapture={(event) => {
        if (!ref.current?.contains(event.relatedTarget as Node | null)) setVisible(false)
      }}
      className={cn('relative', className)}
    >
      <span
        aria-hidden="true"
        data-ask-glide={visible && box ? 'on' : 'off'}
        className="pointer-events-none absolute inset-x-0 rounded-nomi-sm bg-nomi-ink-05"
        style={{
          top: box?.top ?? 0,
          height: box?.height ?? 0,
          opacity: box && visible ? 1 : 0,
          transition: prefersReducedMotion()
            ? 'opacity 150ms ease'
            : 'top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease',
        }}
      />
      {children}
    </div>
  )
}

/**
 * 选项左边那个标记。未选 = 一圈 1.5px 内描边、**没有底色也没有外框**；
 * 已选 = 实心 ink + 反色的内点 / 对勾。单选是圆的、多选是方的——形状本身就说明了
 * 「能选几个」，不必再写一句说明。
 */
function AskMarker({ on, multiple }: { on: boolean; multiple: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-ask-marker={on ? 'on' : 'off'}
      className={cn(
        'grid size-4 shrink-0 place-items-center transition-colors duration-200',
        multiple ? 'rounded-nomi-sm' : 'rounded-pill',
        // 未选 = 一圈细环，**不是** border（border 会参与布局，16px 的方块会被挤小一圈）。
        // 用仓库通用的 `ring-1 ring-inset` 写法而不是 `shadow-[inset_…]`：后者在这套
        // Tailwind 配置下解析成 `box-shadow: none`（走查截图里三个圆圈整个不见了，
        // 是我第一版栽的坑），`ring` 这一族别处一直在用、是活的。
        on ? 'bg-nomi-ink text-nomi-paper' : 'ring-1 ring-inset ring-nomi-ink-30 text-transparent',
      )}
    >
      {multiple ? (
        <IconCheck size={11} aria-hidden="true" />
      ) : (
        <span
          className="size-1.5 rounded-pill bg-nomi-paper transition-transform duration-200"
          style={{ transform: on ? 'scale(1)' : 'scale(0)' }}
        />
      )}
    </span>
  )
}

export function V4AskCard({
  questions,
  labels,
  answerDraft,
  onAnswer,
  onDismiss,
}: {
  questions: readonly V4AskQuestion[]
  labels: V4AskCardLabels
  /**
   * 卡挂载时自由输入那一行里已经有的字（只给设计实验室画「正在打字」那一态用；
   * 生产侧永远缺席）。和 `InterventionData.answerDraft` 同一个理由、同一条规矩：
   * 不拿它给用户预填答案——替他把话写好，他就只能顺着改。
   */
  answerDraft?: string
  /** 用户把整张卡答完了。**一题一条**（契约 §8.4），没答的题不出现。 */
  onAnswer?: (answers: readonly V4AskAnswer[]) => void
  /**
   * × 与「跳过」走这里（= 这次不答）。**必填**，和 `V4Intervention.onPlanToggle` 同一条规矩
   * （R28：能让编译器拦的别留给门岗）。
   *
   * 它可选过一版，代价当场就出现了：设计实验室没传，于是那颗 × 在实验室里整个不见，
   * 而我正是靠实验室截图去和实物对账的——一颗**可选**的钮在截图里和「设计上就没有」
   * 长得一模一样。跳过一次提问永远是做得到的事，不存在「这个宿主没有这个能力」，
   * 所以真没有去处的取景位也得显式写 `() => undefined`，那是一次表态，不是遗漏。
   */
  onDismiss: () => void
}): JSX.Element {
  const total = questions.length
  const [index, setIndex] = React.useState(0)
  const [drafts, setDrafts] = React.useState<readonly V4AskDraft[]>(
    () => questions.map((_, position) => (position === 0 && answerDraft
      ? Object.freeze({ picked: Object.freeze([]) as readonly number[], custom: answerDraft })
      : EMPTY_ASK_DRAFT)),
  )
  const [cursor, setCursor] = React.useState<number | undefined>(undefined)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([])
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const advanceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const measured = React.useRef(false)
  const [viewportH, setViewportH] = React.useState<number | undefined>(undefined)
  const [trackY, setTrackY] = React.useState(0)
  const [animate, setAnimate] = React.useState(false)
  /**
   * 量到第一题的高度之前**只挂当前这一题**（Approval Card 的 `ready`，照搬）。
   *
   * 不这么做的后果它自己的注释写得很清楚，我第一版漏了、走查当场抓了出来：首帧 `viewportH`
   * 还是 undefined，高度是 auto，于是三道题一起摞出来把卡撑满，量完再缩回去——用户看到
   * 卡「闪」一下。顺带还有第二个后果：静态标记渲染里三道题**全在 DOM 里**，
   * 「这张卡上有几个选项、有几行自由输入」这类判据会把看不见的那两题也数进去。
   */
  const [ready, setReady] = React.useState(false)

  const question = questions[index]
  const options = React.useMemo(() => orderedAskOptions(question?.options ?? []), [question])
  const draft = drafts[index] ?? EMPTY_ASK_DRAFT
  const multiSelect = question?.multiSelect === true
  const answered = askQuestionAnswered(draft)
  const last = isLastAskQuestion(index, total)

  // 卡高跟着这一题的真实高度走（Approval Card 的 `sync()`）：题目长短不一，
  // 卡固定高就会在短题下留一大块空、在长题下把选项裁掉。
  React.useLayoutEffect(() => {
    const item = itemRefs.current[index]
    if (!item) return
    const withAnim = measured.current && !prefersReducedMotion()
    measured.current = true
    setViewportH(item.offsetHeight)
    setTrackY(item.offsetTop)
    setAnimate(withAnim)
    setReady(true)
  }, [index, drafts, questions])

  React.useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  const setDraft = (next: V4AskDraft): void => {
    setDrafts((current) => current.map((item, position) => (position === index ? next : item)))
  }

  const submit = (nextDrafts: readonly V4AskDraft[]): void => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    const answers = askCardAnswer(questions, nextDrafts)
    if (answers.length) onAnswer?.(answers)
  }

  const advance = (nextDrafts: readonly V4AskDraft[]): void => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (last) submit(nextDrafts)
    else { setIndex((current) => Math.min(total - 1, current + 1)); setCursor(undefined) }
  }

  const pick = (position: number): void => {
    const next = toggleAskOption(draft, position, multiSelect)
    const nextDrafts = drafts.map((item, at) => (at === index ? next : item))
    setDrafts(nextDrafts)
    setCursor(position)
    if (!shouldAutoAdvance(multiSelect)) return
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    advanceTimer.current = setTimeout(() => advance(nextDrafts), ASK_AUTO_ADVANCE_MS)
  }

  const goTo = (next: number): void => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    setIndex(Math.min(Math.max(next, 0), total - 1))
    setCursor(undefined)
  }

  /**
   * 键盘（任务书拍板）：↑↓ 选、数字键直选、回车继续、Esc 跳过。
   *
   * 焦点落在自由输入那一行时**不接管 ↑↓ 和数字键**——那儿的数字是用户在打字，
   * 抢走它等于让人打不出「3 秒」。回车与 Esc 两条照常接管（它们在输入框里没有别的含义）。
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const typing = event.target instanceof HTMLInputElement
    if (event.key === 'Escape') { event.preventDefault(); onDismiss(); return }
    if (event.key === 'Enter') {
      if (event.nativeEvent.isComposing) return
      event.preventDefault()
      if (answered) advance(drafts)
      return
    }
    if (typing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const next = askOptionIndexForArrow(cursor, event.key === 'ArrowDown' ? 1 : -1, options.length)
      if (next === undefined) return
      event.preventDefault()
      setCursor(next)
      return
    }
    const direct = askOptionIndexForKey(event.key, options.length)
    if (direct === undefined) return
    event.preventDefault()
    pick(direct)
  }

  if (!question) return <></>

  return (
    <section
      className="overflow-hidden rounded-nomi bg-nomi-paper shadow-[0_0_0_1px_var(--nomi-line),var(--nomi-shadow-sm)]"
      data-v4-block="intervention"
      data-kind="question"
      data-ask-card="true"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="relative p-3">
        {(
          <button
            type="button"
            aria-label={labels.dismiss}
            title={labels.dismiss}
            onClick={onDismiss}
            data-v4-control="ask-dismiss"
            className="absolute right-2.5 top-2.5 z-10 grid size-7 place-items-center rounded-nomi-sm text-nomi-ink-40 hover:bg-nomi-ink-05 hover:text-nomi-ink"
          >
            <IconX size={14} aria-hidden="true" />
          </button>
        )}
        {/* 题轨：所有题竖着摞在一条轨上，靠 translate3d 把当前那一题推到视口里；
            外层的高度跟着当前题动。这就是 Approval Card 的「卡高随题滑动」。 */}
        <div
          className="overflow-hidden"
          style={{ height: viewportH, transition: animate ? `height ${SLIDE}` : undefined }}
          aria-live="polite"
        >
          <div
            ref={trackRef}
            className="flex flex-col gap-6"
            style={{
              transform: `translate3d(0, ${-trackY}px, 0)`,
              transition: animate ? `transform ${SLIDE}` : undefined,
              willChange: 'transform',
            }}
          >
            {questions.map((item, position) => {
              const active = position === index
              if (!ready && !active) return null
              const itemOptions = active ? options : orderedAskOptions(item.options)
              const itemDraft = drafts[position] ?? EMPTY_ASK_DRAFT
              return (
                <div
                  key={`${position}-${item.question}`}
                  ref={(element) => { itemRefs.current[position] = element }}
                  aria-hidden={active ? undefined : true}
                  data-ask-question={position}
                  data-active={active ? 'true' : 'false'}
                  style={{
                    opacity: active ? 1 : 0,
                    transition: animate ? `opacity ${SLIDE}` : undefined,
                    pointerEvents: active ? undefined : 'none',
                  }}
                >
                  {/* 问题**就是**标题。没有第二行卡头——「需要你定一下」那句套话已经删掉。 */}
                  <h3 className="m-0 pr-8 text-body font-medium text-nomi-ink" data-v4-block="ask-question">
                    {item.question}
                  </h3>
                  {item.note ? (
                    <p className="m-0 mt-1 pr-8 text-caption text-nomi-ink-60" data-v4-block="ask-note">{item.note}</p>
                  ) : null}
                  <AskGlideMenu className="mt-2.5 flex flex-col gap-1">
                    {itemOptions.map((option, optionIndex) => {
                      const on = itemDraft.picked.includes(optionIndex)
                      return (
                        <button
                          key={option.id}
                          type="button"
                          data-ask-row="option"
                          data-v4-control="question-option"
                          data-option-id={option.id}
                          data-cursor={active && cursor === optionIndex ? 'true' : undefined}
                          aria-pressed={on}
                          tabIndex={active ? 0 : -1}
                          onClick={() => { if (active) pick(optionIndex) }}
                          className={cn(
                            'relative z-10 flex w-full items-start gap-1.5 rounded-nomi-sm py-1 pl-1 pr-2 text-left transition-colors duration-100',
                            active && cursor === optionIndex ? 'bg-nomi-ink-05' : '',
                          )}
                        >
                          <span className="mt-px shrink-0"><AskMarker on={on} multiple={item.multiSelect === true} /></span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className={cn('min-w-0 text-body-sm transition-colors duration-200', on ? 'text-nomi-ink' : 'text-nomi-ink-80')}>
                                {option.label}
                              </span>
                              {/* 「推荐」只是一个记号：不预选、不代答，只把它排第一。 */}
                              {option.recommended ? (
                                <span className="shrink-0 rounded-pill bg-nomi-accent-soft px-1.5 text-micro text-nomi-accent" data-v4-block="ask-recommended">
                                  {labels.recommended}
                                </span>
                              ) : null}
                            </span>
                            {option.description ? (
                              <span className="text-micro font-normal text-nomi-ink-60">{option.description}</span>
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                    {/* 末行自由输入：**无边框、无底色**，和选项行同宽同缩进，靠上面那条滑动带
                        提示它可点。它永远在——一张只有选项的卡等于说「你只能从这几个里挑」。 */}
                    <label data-ask-row="custom" className="relative z-10 flex items-center rounded-nomi-sm py-1 pl-1 pr-2">
                      {/* 让这一行的文字和上面选项的**标签**对齐，所以空出一个标记那么宽的位。
                          一个选项都没有时那一列根本不存在，再缩进就成了一段没有来由的空白
                          （Approval Card 的 demo 里永远有选项，所以它没碰到这一档）。 */}
                      {itemOptions.length ? <span className="size-4 shrink-0" aria-hidden="true" /> : null}
                      <input
                        ref={active ? inputRef : undefined}
                        type="text"
                        value={itemDraft.custom}
                        tabIndex={active ? 0 : -1}
                        onChange={(event) => {
                          if (!active) return
                          const value = event.target.value
                          setDraft(Object.freeze({
                            picked: item.multiSelect === true ? itemDraft.picked : (Object.freeze([]) as readonly number[]),
                            custom: value,
                          }))
                        }}
                        placeholder={labels.customPlaceholder}
                        aria-label={labels.customPlaceholder}
                        data-v4-control="question-answer"
                        className="min-w-0 flex-1 border-0 bg-transparent pl-1.5 text-body-sm text-nomi-ink outline-none placeholder:text-nomi-ink-40"
                      />
                    </label>
                  </AskGlideMenu>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 页脚：左页码（只有一题时整段不渲染）、右 Skip + 主按钮。 */}
      {/* 页脚：左页码、右 Skip + 主按钮。两端分开用的是内容流里的一根弹性垫片，
          不是那个「两端对齐」的类——`check:tokens` 对 `src/workbench/ai/` 这一族是硬零
          （附属信息一律走 V4Row 的内容流），而它连**注释里**写出那个类名都会数进去，
          所以这里只能这么绕着说。`V4Intervention` 的底栏是同一个写法。 */}
      <div className="flex items-center gap-3 p-2.5" data-v4-block="ask-footer">
        {shouldShowPager(total) ? (
          <div className="flex items-center gap-1 text-nomi-ink-40" data-v4-block="ask-pager">
            <button
              type="button"
              aria-label={labels.prev}
              disabled={index <= 0}
              onClick={() => goTo(index - 1)}
              data-v4-control="ask-prev"
              className="grid size-[18px] rotate-180 place-items-center rounded-nomi-sm enabled:hover:text-nomi-ink disabled:opacity-30"
            >
              <IconChevronDown size={13} aria-hidden="true" />
            </button>
            <span className="inline-flex items-center text-caption font-medium tabular-nums text-nomi-ink-40" aria-label={labels.step(index + 1, total)}>
              {`${index + 1} / ${total}`}
            </span>
            <button
              type="button"
              aria-label={labels.next}
              disabled={last}
              onClick={() => goTo(index + 1)}
              data-v4-control="ask-next"
              className="grid size-[18px] place-items-center rounded-nomi-sm enabled:hover:text-nomi-ink disabled:opacity-30"
            >
              <IconChevronDown size={13} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <span className="flex-1" />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => (last ? onDismiss() : goTo(index + 1))}
            data-v4-control="ask-skip"
            className="h-7 rounded-pill bg-nomi-ink-05 px-3 text-body-sm font-medium text-nomi-ink-60 hover:bg-nomi-ink-10"
          >
            {labels.skip}
          </button>
          <button
            type="button"
            disabled={!answered}
            onClick={() => advance(drafts)}
            data-v4-control="ask-continue"
            className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-nomi-ink px-3 text-body-sm font-medium text-nomi-paper disabled:opacity-50"
          >
            {last ? labels.send : labels.continueLabel}
            <span aria-hidden="true" className="text-micro opacity-70">⏎</span>
          </button>
        </div>
      </div>
    </section>
  )
}
