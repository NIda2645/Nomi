// 官网页面描述的长度界限：生成器（拼描述）、描述门岗（check-site-descriptions）、SEO 巡检共用这一份。
// 50–160 字符，中文按字数（一个汉字算一个，不是字节）。

export const DESCRIPTION_LENGTH = Object.freeze({ min: 50, max: 160 })

/** 按字符（码点）数长度：「Meta 出品」是 7，不是 UTF-8 字节数。 */
export const descriptionLength = (text) => [...String(text)].length

export const descriptionInRange = (text) => {
  const length = descriptionLength(text)
  return length >= DESCRIPTION_LENGTH.min && length <= DESCRIPTION_LENGTH.max
}

/** 句内停顿：中文按全角标点，英文按半角标点和破折号。截断只在这些地方下刀，不切断一个词。 */
const CLIP_BOUNDARY = { 'zh-CN': /[。！？；，、：]/, en: /[.;,:—–]/ }

/** 超过上限就在最后一个停顿处截断并补「…」；找不到停顿才在上限处硬截。短于上限的原样返回。 */
export function clipDescription(text, locale) {
  const chars = [...String(text).trim()]
  if (chars.length <= DESCRIPTION_LENGTH.max) return chars.join('')
  const room = chars.slice(0, DESCRIPTION_LENGTH.max - 1)
  const boundary = CLIP_BOUNDARY[locale] ?? CLIP_BOUNDARY.en
  for (let index = room.length - 1; index >= DESCRIPTION_LENGTH.min; index -= 1) {
    if (boundary.test(room[index])) return `${room.slice(0, index).join('').trimEnd()}…`
  }
  return `${room.join('').trimEnd()}…`
}

/**
 * 把一段来自数据的文字（技能摘要这类 App 里的目录文字，我们改不了）收进 50–160：
 * 短于下限就接上 `suffix`（由调用方用同一份数据拼出来的一句真话），超过上限就在句内停顿处截断。
 * 收不进去（连接上后缀也不够）直接抛错，不悄悄放过。
 */
export function fitDescription(text, { locale, suffix = '' }) {
  const base = String(text).trim()
  const joined = descriptionLength(base) < DESCRIPTION_LENGTH.min && suffix ? `${base}${locale === 'zh-CN' ? '' : ' '}${suffix}` : base
  const fitted = clipDescription(joined, locale)
  if (!descriptionInRange(fitted)) throw new Error(`描述长度 ${descriptionLength(fitted)} 不在 ${DESCRIPTION_LENGTH.min}–${DESCRIPTION_LENGTH.max} 之内：${fitted.slice(0, 40)}…`)
  return fitted
}
