const AUTO_OPTION_PATTERN = /^(auto|automatic|adaptive|自动|智能)$/i

export type LocalizedParameterOption = {
  value: string
  text: string
  isAuto: boolean
}

/** 内部参数值保持供应商无关，只把自动语义收敛到当前语言的展示文字。 */
export function localizeAutoOption(
  value: string,
  text: string,
  autoLabel: string,
): LocalizedParameterOption {
  const isAuto = AUTO_OPTION_PATTERN.test(value.trim()) || AUTO_OPTION_PATTERN.test(text.trim())
  return { value, text: isAuto ? autoLabel : text, isAuto }
}
/** Segments are for short, scannable choices. Filename/large enums need a searchable list. */
export function parameterOptionLayout(options: readonly { text: string }[]): 'segmented' | 'select' {
  if (options.length > 12) return 'select'
  // At the panel's minimum segment width, full-width glyphs consume about two ASCII cells.
  const fits = options.every(({ text }) => Array.from(text).reduce((width, char) => width + ((char.codePointAt(0) ?? 0) > 255 ? 2 : 1), 0) <= 8)
  return fits ? 'segmented' : 'select'
}
