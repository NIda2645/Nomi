/**
 * 一行「推一下就删」——整件取自 Spectrum UI 的 **Swipe to Delete**
 * （`https://ui.spectrumhq.in/docs/swipe-to-delete`，源码页公开，本次任务已把它落盘到
 * scratchpad 的 `spectrum-SwipeToDelete.source.tsx` 逐段对照）。
 *
 * ## 它在解决哪个真实摩擦
 *
 * 删一条方案今天要走：hover → 点 ⋮ → 在菜单里找到「删除方案」→ 再在一个模态框里点「确认」。
 * 四步、两次瞄准、一个挡住整屏的弹窗——而这件事**本来就是可撤销的**。
 * 用户 09-21 的原话是「不需要名称的 icon，有个删除 icon 就行，一串名字作为按钮很蠢」。
 *
 * 读法（Spectrum 那篇文档的原意，也是这次改动的依据）：**删除是一个手势，不是一道题**。
 * 直接删 + 给一条撤销路，全程不弹任何确认。确认弹窗拦得住手滑，但它对**每一次**删除
 * 都收一遍税；撤销只对真的手滑那一次收税。
 *
 * ## 逐件照搬了什么
 *
 * | Spectrum | 这里 | 换了什么 |
 * |---|---|---|
 * | 外层 `role="group"` + `tabIndex=0` + Delete/Backspace 提交 | 同 | `aria-label` 走 i18n |
 * | 指针设备上 hover / focus 把行**轻推**露出删除区 | 同 | 推的距离按 240px 侧栏调窄（见下） |
 * | `(hover:hover) and (pointer:fine)` 才推 | 同 | — |
 * | 拖过阈值（或甩）即提交，没过就弹回 | 同 | — |
 * | 删除区**本身**就是按钮，`tabIndex={-1}`（键盘只留一个落点） | 同 | 图标换 Tabler 的 `IconTrash` |
 * | 提交 = 先完全拉开 → 行高塌陷 → 读屏播报留 300ms → 才 `onDelete()` | 同 | — |
 * | `useReducedMotion` 下保留拖拽、去掉动画 | 同 | — |
 * | 底色 rose-500 | `bg-nomi-danger` | 换 Nomi token |
 *
 * **没有照搬的一样**：Spectrum 配套的 Undo Pill（带倒计时环、hover 暂停、到点才真提交）。
 * 仓库已经有这个语义的 owner——`src/utils/showUndoToast.ts`，今天 8 个调用方共用
 * `src/ui/toast.tsx` 那一个容器，而那个文件头就写着「不再有本地并行 store/host」。
 * 再做一颗药丸就是第二套（R1/P1）。代价是模型不同：Undo Pill 延迟提交、我们先做后撤，
 * 所以调用方必须给得出一条**复原**路径（本仓是 `restoreStoryboardDesign`）。
 *
 * ## 尺寸为什么不照抄
 *
 * Spectrum 的默认值是给一屏宽的列表行定的（`actionWidth 96 / hoverPeek 56`）。
 * 这里的行住在 **240px** 的侧栏里，还要再缩进一层——96px 的删除区会吃掉半行标题。
 * 所以宽度做成入参、在调用处给值，组件自己不写死。
 */
import React from 'react'
import { motion, useAnimationControls, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type PanInfo } from 'framer-motion'
import { IconTrash } from '@tabler/icons-react'
import { cn } from '../utils/cn'

/** 向左甩到这个速度就提交，不管拖了多远（照搬 Spectrum 的 `FLING_VELOCITY`）。 */
const FLING_VELOCITY = -500
const COLLAPSE_DURATION = 0.25
const COLLAPSE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
/**
 * 行塌陷之后、`onDelete()` 之前多留的这 300ms 不是凑数：
 * 读屏要读那句「已删除」，而 `onDelete()` 会把整个组件卸载掉，live region 跟着消失。
 * 行这时已经看不见了，所以这一下等待人眼察觉不到。
 */
const ANNOUNCE_HOLD_MS = 300
/** 往左有一点阻尼、往右**一点都不给**——行不该能被拖出它自己的位置。 */
const DRAG_ELASTIC = { left: 0.15, right: 0 } as const
const SNAP_OPEN_SPRING = { type: 'spring', stiffness: 550, damping: 42 } as const
const SNAP_BACK_SPRING = { type: 'spring', stiffness: 500, damping: 38 } as const
const PEEK_SPRING = { type: 'spring', stiffness: 520, damping: 40 } as const
const ICON_POP_SPRING = { type: 'spring', stiffness: 520, damping: 18 } as const
const ICON_REST_SPRING = { type: 'spring', stiffness: 400, damping: 30 } as const

const HOVER_QUERY = '(hover: hover) and (pointer: fine)'

/**
 * 这台设备有没有**真的** hover。
 *
 * 触屏上「hover」是点一下之后的残留状态，靠它去推行等于用户点哪一行哪一行就自己动。
 * 触屏用户有更好的那条路——本来就是滑动删除。
 */
function useCanHover(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined
      const query = window.matchMedia(HOVER_QUERY)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(HOVER_QUERY).matches : false),
    () => false,
  )
}

export function SwipeToDeleteRow({
  onDelete,
  children,
  label,
  deleteLabel,
  actionWidth = 72,
  hoverPeek = 40,
  threshold = 0.6,
  disabled = false,
  deletedAnnouncement,
  className,
}: {
  /** 塌陷动画走完才触发——**这时才真的删**。提早删会让行在原地闪掉，看着像崩了。 */
  onDelete: () => void
  children: React.ReactNode
  /** 这一行叫什么（读屏念的就是它）。 */
  label: string
  /** 删除区那颗按钮的无障碍名。 */
  deleteLabel: string
  actionWidth?: number
  hoverPeek?: number
  threshold?: number
  disabled?: boolean
  /** 删完那一句播报（读屏用）。 */
  deletedAnnouncement: string
  className?: string
}): JSX.Element {
  const shouldReduceMotion = useReducedMotion()
  const canHover = useCanHover()
  const outerRef = React.useRef<HTMLDivElement>(null)
  const committedRef = React.useRef(false)
  const draggingRef = React.useRef(false)
  const hoveredRef = React.useRef(false)
  const focusedRef = React.useRef(false)
  const holdTimer = React.useRef<number | null>(null)
  const x = useMotionValue(0)
  const rowControls = useAnimationControls()
  const outerControls = useAnimationControls()
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [pastThreshold, setPastThreshold] = React.useState(false)
  const [peeked, setPeeked] = React.useState(false)

  // 图标永远居中在**已经露出来的那一段**里，所以它跟着手走，而不是躲在行的边缘后面。
  const exposed = useTransform(x, (latest) => Math.min(actionWidth, Math.max(0, -latest)))

  useMotionValueEvent(x, 'change', (latest) => {
    setPastThreshold(latest <= -actionWidth * threshold)
    setPeeked(latest <= -Math.min(hoverPeek, actionWidth) + 1)
  })

  React.useEffect(() => () => { if (holdTimer.current !== null) window.clearTimeout(holdTimer.current) }, [])

  /** 指针设备的静息位：hover/聚焦时探头，否则收回去。 */
  const settle = React.useCallback(() => {
    if (committedRef.current || draggingRef.current) return
    const wantPeek = canHover && !disabled && (hoveredRef.current || focusedRef.current)
    void rowControls.start({
      x: wantPeek ? -Math.min(hoverPeek, actionWidth) : 0,
      transition: shouldReduceMotion ? { duration: 0 } : wantPeek ? PEEK_SPRING : SNAP_BACK_SPRING,
    })
  }, [canHover, disabled, hoverPeek, actionWidth, rowControls, shouldReduceMotion])

  const commit = React.useCallback(async () => {
    if (disabled || committedRef.current) return
    committedRef.current = true
    setIsDeleting(true)
    const node = outerRef.current
    const height = node?.offsetHeight ?? 0
    const marginBottom = node ? getComputedStyle(node).marginBottom : 0
    // 先完全拉开：让「是删除」这件事在行消失之前被看清楚。
    if (!shouldReduceMotion) await rowControls.start({ x: -actionWidth, transition: SNAP_OPEN_SPRING })
    outerControls.set({ height, marginBottom })
    await outerControls.start({
      height: 0,
      opacity: 0,
      marginBottom: 0,
      transition: shouldReduceMotion ? { duration: 0 } : { duration: COLLAPSE_DURATION, ease: COLLAPSE_EASE },
    })
    await new Promise<void>((resolve) => { holdTimer.current = window.setTimeout(resolve, ANNOUNCE_HOLD_MS) })
    onDelete()
  }, [disabled, shouldReduceMotion, actionWidth, rowControls, outerControls, onDelete])

  const onDragEnd = React.useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    draggingRef.current = false
    if (committedRef.current) return
    if (x.get() <= -actionWidth * threshold || info.velocity.x < FLING_VELOCITY) void commit()
    else settle()
  }, [actionWidth, threshold, x, commit, settle])

  const onKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    // **只在行这个壳自己聚焦时**接管：焦点在行里的标题按钮或改名输入框里时，
    // Backspace 是删字，抢走它等于让人改不了名字。
    if (disabled || event.target !== event.currentTarget) return
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    event.preventDefault()
    void commit()
  }, [disabled, commit])

  return (
    <motion.div
      ref={outerRef}
      role="group"
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      onPointerEnter={() => { hoveredRef.current = true; settle() }}
      onPointerLeave={() => { hoveredRef.current = false; settle() }}
      onFocus={() => { focusedRef.current = true; settle() }}
      onBlur={(event) => {
        // 焦点还在这一行里（比如挪到了 ⋮ 上）就保持探头状态。
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        focusedRef.current = false
        settle()
      }}
      initial={false}
      animate={outerControls}
      data-swipe-row="true"
      className={cn('group/swipe relative w-full rounded-nomi-sm', isDeleting && 'overflow-hidden', className)}
    >
      <div className="relative overflow-hidden rounded-nomi-sm">
        {/* 删除区**本身**就是那颗按钮——不是一颗浮在行上面的图标钮。
            `tabIndex={-1}`：键盘只在行这一个落点上停，按 Delete 就删（Spectrum 的原设计）。 */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={deleteLabel}
          title={deleteLabel}
          disabled={disabled || isDeleting}
          onClick={() => void commit()}
          data-swipe-delete="true"
          className="absolute inset-y-0 right-0 bg-nomi-danger text-nomi-paper outline-none hover:brightness-95 active:brightness-90 disabled:pointer-events-none"
          style={{ width: actionWidth }}
        >
          <motion.span aria-hidden="true" className="absolute inset-y-0 right-0 flex items-center justify-center" style={{ width: exposed }}>
            <motion.span
              className="flex"
              initial={false}
              animate={{ scale: shouldReduceMotion || pastThreshold ? 1 : peeked ? 0.9 : 0.7 }}
              transition={shouldReduceMotion ? { duration: 0 } : pastThreshold ? ICON_POP_SPRING : ICON_REST_SPRING}
            >
              <IconTrash size={15} stroke={1.7} aria-hidden="true" />
            </motion.span>
          </motion.span>
        </button>

        <motion.div
          drag={disabled || isDeleting ? false : 'x'}
          dragConstraints={{ left: -actionWidth, right: 0 }}
          dragElastic={DRAG_ELASTIC}
          dragMomentum={false}
          onDragStart={() => { draggingRef.current = true }}
          onDragEnd={onDragEnd}
          initial={false}
          animate={rowControls}
          style={{ x }}
          // `touch-pan-y` 把纵向滚动留给页面：只有横向手势赢了才接管指针。
          className="relative w-full touch-pan-y select-none bg-nomi-paper"
        >
          {children}
        </motion.div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">{isDeleting ? deletedAnnouncement : ''}</span>
    </motion.div>
  )
}
