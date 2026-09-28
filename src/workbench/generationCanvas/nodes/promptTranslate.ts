/**
 * 节点提示词「翻译」的纯函数层（2026-09-21 用户拍板）：
 * - 方向自动判断：以中文为主 → 译成英文；以英文为主 → 译成中文；
 * - @素材引用保护：`@[asset:…]` 标记换成 `⟦n⟧` 占位符送模型，回来原样还原；占位符多一个、少一个、
 *   重复一个都拒绝替换——宁可不翻，也不静默丢掉一张参考图；
 * - 指令构造：只要译文本身，保留占位符与换行。
 *
 * 为什么和组件分开：这三件是「翻坏了用户看不出来」的那一层（丢引用、方向反了），必须能单测；
 * 组件只管选区、调用和一次事务替换。
 */
import i18n from '../../../i18n'
import { encodeMention, parsePromptSegments } from '../../assets/promptMentions'

export type TranslateDirection = 'zh-to-en' | 'en-to-zh'

const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/g
const LATIN_WORD_RE = /[A-Za-z]+/g
/** 一个英文单词约等于两个汉字的信息量——按「字数 vs 单词数×2」比，而不是逐字母比（逐字母会让中文里夹一个 cinematic 就翻转方向）。 */
const LATIN_WORD_WEIGHT = 2

/**
 * 判断译向。只看文字，不看 @引用标记（标记里的 url 全是英文字母，算进去中文提示词会被误判成英文）。
 * 两种文字都没有（只有引用、数字、标点）→ null：没有可翻译的内容。
 */
export function detectTranslateDirection(prompt: string): TranslateDirection | null {
  const text = parsePromptSegments(prompt)
    .map((segment) => (segment.type === 'text' ? segment.value : ''))
    .join('')
  const cjk = text.match(CJK_RE)?.length ?? 0
  const latinWords = text.match(LATIN_WORD_RE)?.length ?? 0
  if (cjk === 0 && latinWords === 0) return null
  return cjk >= latinWords * LATIN_WORD_WEIGHT ? 'zh-to-en' : 'en-to-zh'
}

export type ProtectedPrompt = {
  /** 引用已换成 ⟦1⟧⟦2⟧… 的文本。 */
  text: string
  /** 第 i 个占位符（⟦i+1⟧）对应的原始引用标记。 */
  mentions: string[]
}

const placeholder = (index: number): string => `⟦${index + 1}⟧`
const PLACEHOLDER_RE = /⟦(\d+)⟧/g

/** 把 `@[asset:…]` 标记按出现顺序换成占位符。重复引用同一张图也各占一个号——还原时一一对应，不去重。 */
export function protectMentions(prompt: string): ProtectedPrompt {
  const mentions: string[] = []
  const text = parsePromptSegments(prompt)
    .map((segment) => {
      if (segment.type === 'text') return segment.value
      mentions.push(encodeMention(segment.url))
      return placeholder(mentions.length - 1)
    })
    .join('')
  return { text, mentions }
}

export type RestoreResult = { ok: true; prompt: string } | { ok: false; reason: 'placeholder-mismatch' }

/**
 * 还原占位符。每个占位符必须**恰好出现一次**且编号不越界，否则整段拒绝：
 * 模型丢了一个 = 用户少一张参考；多出一个 = 凭空冒出引用；两种都不能静默吞下。
 */
export function restoreMentions(translated: string, mentions: readonly string[]): RestoreResult {
  const seen = new Array<number>(mentions.length).fill(0)
  let outOfRange = false
  for (const match of translated.matchAll(PLACEHOLDER_RE)) {
    const index = Number(match[1]) - 1
    if (index < 0 || index >= mentions.length) outOfRange = true
    else seen[index] += 1
  }
  if (outOfRange || seen.some((count) => count !== 1)) return { ok: false, reason: 'placeholder-mismatch' }
  return { ok: true, prompt: translated.replace(PLACEHOLDER_RE, (_whole, digits: string) => mentions[Number(digits) - 1]) }
}

/** 模型偶尔会用代码块包住输出；只剥最外层围栏，不动正文。 */
export function cleanTranslationOutput(raw: string): string {
  const trimmed = raw.trim()
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(trimmed)
  return (fenced ? fenced[1] : trimmed).trim()
}

/** 选区两端的空白不送模型（模型会吃掉），替换时原样接回，免得译文和前后文粘在一起。 */
export function splitOuterWhitespace(text: string): { lead: string; core: string; trail: string } {
  const lead = /^\s*/.exec(text)?.[0] ?? ''
  const rest = text.slice(lead.length)
  const trail = /\s*$/.exec(rest)?.[0] ?? ''
  return { lead, core: rest.slice(0, rest.length - trail.length), trail }
}

/** 组翻译指令。导出供单测——「保留占位符」这条要是没进 prompt，丢引用就只剩还原那一道拦。 */
export function buildTranslatePrompt(text: string, direction: TranslateDirection, placeholderCount: number): string {
  const target = i18n.t(direction === 'zh-to-en' ? 'generationCommon.translator.targetEnglish' : 'generationCommon.translator.targetChinese')
  return [
    i18n.t('generationCommon.translator.intro', { target }),
    placeholderCount > 0 ? i18n.t('generationCommon.translator.placeholderRule', { example: placeholder(0) }) : '',
    i18n.t('generationCommon.translator.outputRule'),
    `"""\n${text}\n"""`,
  ]
    .filter(Boolean)
    .join('\n')
}
