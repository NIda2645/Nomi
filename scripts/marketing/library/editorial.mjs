// 模型介绍文件（marketing/content/models/<slug>.<zh-CN|en>.md）的格式：唯一 owner。
// 页面生成器（data.mjs 读它）、check-site-editorial 门岗、每周同步的「缺介绍」清单都从这里取
// 「前言有哪些字段、四节标题是什么、什么样的出处算数」，不各抄一份。
import { Marked } from 'marked'
import yaml from 'js-yaml'

export const EDITORIAL_LOCALES = ['zh-CN', 'en']

/** 前言必填的字段；`released`（官方发布日期）查不到就不写，页面上也就不显示，不许推测一个日期填进去。 */
export const REQUIRED_FIELDS = ['model', 'maker', 'checkedAt', 'headline', 'sources']
/**
 * 可选字段：released 发布日期；name 页面上的模型名（英文页的「可灵」要叫 Kling）；
 * description 页面的 meta 描述（一句话定位超出 50–160 字时用它，见 models-pages.mjs 的 modelMetaDescription）。
 */
export const OPTIONAL_FIELDS = ['released', 'name', 'description']

/** 正文只有这四节，顺序固定：模型页「看提示词写法」按钮跳到第三节（TIPS_SECTION_INDEX）。 */
export const SECTION_HEADINGS = Object.freeze({
  'zh-CN': ['新在哪', '适合做什么', '提示词要点', '已知限制'],
  en: ['What’s new', 'What it’s good for', 'Prompting tips', 'Known limits'],
})
export const TIPS_SECTION_INDEX = 2

/**
 * 已知不是模型厂商或接入供应商自己的站点（聚合、转载、社区、新闻门户）。出处里不许出现。
 * 这是一道**下限**：机器只能拦住这些已知的第三方站，「官方与否」最终靠抽查；确有需要时往这里加，不往外减。
 */
export const NON_OFFICIAL_HOSTS = [
  'reddit.com', 'medium.com', 'quora.com', 'zhihu.com', 'csdn.net', 'juejin.cn', 'jianshu.com',
  'cnblogs.com', 'sohu.com', 'sina.com.cn', '163.com', 'qq.com', 'toutiao.com', 'baijiahao.baidu.com',
  '36kr.com', 'ithome.com', 'huxiu.com', 'wikipedia.org', 'blogspot.com', 'substack.com',
]

export const editorialFileName = (slug, locale) => `${slug}.${locale}.md`

/** `kling-3-0.zh-CN.md` → `{ slug: 'kling-3-0', locale: 'zh-CN' }`；不合规矩的文件名回 null。 */
export function parseEditorialFileName(name) {
  const match = /^([a-z0-9][a-z0-9-]*)\.(zh-CN|en)\.md$/.exec(name)
  return match ? { slug: match[1], locale: match[2] } : null
}

/** 把文件拆成前言文字和正文；没有 `---` 前言回 null。 */
export function splitEditorial(raw) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(String(raw).replace(/\r\n/g, '\n'))
  return match ? { frontText: match[1], body: match[2].trim() } : null
}

/** JSON_SCHEMA：日期保持字符串（默认 schema 会把 2026-07-31 变成带本机时区的 Date）。 */
export const loadFront = (frontText) => yaml.load(frontText, { schema: yaml.JSON_SCHEMA })

const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** 发布日期官方只给到月（或年）时就写到月（或年），不补一个没人说过的「日」：`2026-02-18`、`2026-02`、`2026` 都算。 */
const isReleaseDate = (value) => isDate(value) || (typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) || (typeof value === 'string' && /^\d{4}$/.test(value))

const hostOf = (url) => {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname.toLowerCase() : null
  } catch {
    return null
  }
}

const isNonOfficialHost = (host) => NON_OFFICIAL_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))

/** 前言的全部问题（空数组 = 合格）。门岗逐条报，生成器遇到就整体抛错。`today` 只用来拦「核对日期写在未来」。 */
export function frontProblems(front, { today = new Date() } = {}) {
  if (!front || typeof front !== 'object' || Array.isArray(front)) return ['前言不是「字段: 值」的键值表']
  const problems = []
  for (const key of REQUIRED_FIELDS) if (!front[key]) problems.push(`缺字段 ${key}`)
  const known = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS])
  for (const key of Object.keys(front)) if (!known.has(key)) problems.push(`多余或拼错的字段 ${key}`)
  for (const key of ['model', 'maker', 'headline', 'name', 'description']) {
    if (front[key] !== undefined && (typeof front[key] !== 'string' || !front[key].trim())) problems.push(`${key} 必须是非空文字`)
  }

  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (front.checkedAt !== undefined) {
    if (!isDate(front.checkedAt)) problems.push(`checkedAt 必须是真实的 YYYY-MM-DD 日期（现在是 ${JSON.stringify(front.checkedAt)}）`)
    else if (front.checkedAt > tomorrow) problems.push(`checkedAt ${front.checkedAt} 写在了未来`)
  }
  if (front.released !== undefined) {
    if (!isReleaseDate(front.released)) problems.push(`released 必须是官方给出的 YYYY-MM-DD、YYYY-MM 或 YYYY（现在是 ${JSON.stringify(front.released)}）；查不到官方发布日期就不要写这个字段`)
    else if (isDate(front.checkedAt) && front.released > front.checkedAt) problems.push(`released ${front.released} 晚于核对日期 ${front.checkedAt}`)
  }

  if (front.sources !== undefined) {
    if (!Array.isArray(front.sources) || front.sources.length === 0) {
      problems.push('sources 至少要有一条官方出处')
    } else {
      const seen = new Set()
      front.sources.forEach((source, index) => {
        const where = `sources[${index}]`
        if (!source || typeof source !== 'object') return problems.push(`${where} 不是 {title, url}`)
        if (typeof source.title !== 'string' || !source.title.trim()) problems.push(`${where} 缺标题 title`)
        const host = typeof source.url === 'string' ? hostOf(source.url) : null
        if (!host) return problems.push(`${where} 的 url 不是 http(s) 链接：${JSON.stringify(source.url)}`)
        if (isNonOfficialHost(host)) problems.push(`${where} 的 ${host} 不是厂商或供应商自己的站点；出处只放官方原文`)
        if (seen.has(source.url)) problems.push(`${where} 的 url 重复`)
        seen.add(source.url)
      })
    }
  }
  return problems
}

/** 正文里的二级标题（跟页面渲染用同一个 Markdown 解析，代码块里的 `## ` 不算）。 */
export function sectionHeadingsOf(body) {
  return new Marked({ gfm: true }).lexer(body).filter((token) => token.type === 'heading' && token.depth === 2).map((token) => token.text.trim())
}

export const hasLevelOneHeading = (body) => new Marked({ gfm: true }).lexer(body).some((token) => token.type === 'heading' && token.depth === 1)

/** 生成器读介绍：格式不对直接抛错，错误里带文件名。 */
export function parseEditorial(raw, label) {
  const parts = splitEditorial(raw)
  if (!parts) throw new Error(`模型介绍缺少前言：${label}`)
  const front = loadFront(parts.frontText)
  const problems = frontProblems(front)
  if (problems.length) throw new Error(`模型介绍格式不对（${label}）：${problems.join('；')}`)
  return { ...front, body: parts.body }
}
