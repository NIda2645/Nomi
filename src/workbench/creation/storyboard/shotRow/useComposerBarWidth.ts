import React from 'react'

/**
 * 量**这一条底栏自己**有多宽。
 *
 * 为什么是量、而不是一个容器查询断点：同一个容器宽度下，中文那行装得下、英文那行装不下
 * （`改图` vs `Text-to-image`），一个 CSS 常数表达不了这件事。判据必须带上这一行真正要渲染的
 * 那几个标签，而标签只有 JS 知道。
 *
 * 为什么不会抖：被观察的是 bar 自己，而 bar 的宽度**不取决于它装了什么**——
 * 它被提示词列撑满，提示词列是行网格的 `minmax(0,1fr)`，行网格又被
 * `StoryboardPlanEditor` 那条 `grid-cols-1` 钉在编辑器列宽上（2026-09-17 的根因修）。
 * 所以「挪走一枚胶囊」不会反过来改 bar 的宽度，没有测量—布局的回环。
 * 这也正是 2026-09-06 删掉的那套测量 hook 与这一条的区别：那套量的是内容、改的是行高
 * （一枚胶囊溢出就让整表行高抖），这一条量的是外框、改的是内容。
 *
 * 首帧返回 `null` = 还没量到。调用方此时**一枚都不挪**，按今天的样子渲染；
 * `useLayoutEffect` 在绘制前就能拿到第一个值，所以不会闪。
 */
export function useComposerBarWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const read = (): void => {
      const next = element.clientWidth
      setWidth((previous) => (previous !== null && Math.abs(previous - next) < 1 ? previous : next))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return width
}
