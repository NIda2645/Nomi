// 官网页面描述的长度界限：生成器（模型页拼描述）、描述门岗（check-site-descriptions）、SEO 巡检共用这一份。
// 50–160 字符，中文按字数（一个汉字算一个，不是字节）。

export const DESCRIPTION_LENGTH = Object.freeze({ min: 50, max: 160 })

/** 按字符（码点）数长度：「Meta 出品」是 7，不是 UTF-8 字节数。 */
export const descriptionLength = (text) => [...String(text)].length

export const descriptionInRange = (text) => {
  const length = descriptionLength(text)
  return length >= DESCRIPTION_LENGTH.min && length <= DESCRIPTION_LENGTH.max
}
