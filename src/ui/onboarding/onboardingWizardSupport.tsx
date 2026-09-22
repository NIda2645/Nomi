/**
 * OnboardingWizard 的支撑模块：无状态展示子组件（R9 防巨壳，不含 wizard state）。
 *
 * 注：Issue #8 删掉「AI 读文档抠参数」子系统时，配套的 milestone 数据 / 纯函数 / MilestoneRow
 * 一并删除（曾遗留为死代码，违 P1 加新必删旧）；当前只剩仍在用的 Field。
 */
import React from 'react'
import { Stack, Text } from '@mantine/core'

export function Field({
  label,
  hint,
  children,
  hintMarker,
  hintEmphasis,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  /** 走查用的锚点：这行 hint 现在说的是哪一种话（#831 的 create / update）。缺省不加属性。 */
  hintMarker?: string
  /**
   * hint 里要抬成 ink 色 + 中粗的那一段（#831：只有**连接名**抬，整句其余仍是 muted）。
   * 传的是那段文字本身；在 hint 里找不到它就整句按 muted 渲染，不会渲出半截。
   */
  hintEmphasis?: string
}): JSX.Element {
  return (
    <Stack gap={4}>
      <Text size="sm" c="var(--nomi-ink)">{label}</Text>
      {children}
      {hint && (
        <Text size="xs" c="var(--nomi-ink-60)" data-field-hint={hintMarker}>
          {renderHint(hint, hintEmphasis)}
        </Text>
      )}
    </Stack>
  )
}

/**
 * 把 hint 拆成「前段 · 被强调的那段 · 后段」。
 *
 * 为什么不用 `<Trans>`：全仓一次都没用过它，为一行提示引进第二套插值机制不划算；
 * 而这里要强调的恰好就是**插值进去的那个值本身**（连接名），按它切一刀即可。
 */
function renderHint(hint: string, emphasis?: string): React.ReactNode {
  const needle = emphasis?.trim()
  if (!needle) return hint
  const at = hint.indexOf(needle)
  if (at < 0) return hint
  return (
    <>
      {hint.slice(0, at)}
      <Text span inherit fw={500} c="var(--nomi-ink)" data-field-hint-emphasis>
        {needle}
      </Text>
      {hint.slice(at + needle.length)}
    </>
  )
}
