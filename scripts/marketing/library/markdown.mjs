// 技能正文、模型介绍的 Markdown → HTML。
// 正文有一部分来自第三方仓库（配方原文），所以原文里的 HTML 一律转义成文字，不当标签渲染。
// 二级、三级标题带锚点，并把二级标题收成目录（技能页左侧的「本页目录」）。
import { Marked } from 'marked'
import { escapeText } from '../shell.mjs'

const slugify = (text) => text
  .toLowerCase()
  .replace(/[`*_~[\]()]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, '-')
  .replace(/^-+|-+$/g, '')

/** 渲染一段 Markdown；返回 HTML 与二级标题目录。`idPrefix` 防止同页两段正文的锚点撞车。 */
export function renderMarkdown(markdown, { idPrefix = '' } = {}) {
  const toc = []
  const used = new Map()
  const marked = new Marked({ gfm: true, breaks: false })
  marked.use({
    renderer: {
      html({ text }) {
        return escapeText(text)
      },
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens)
        const plain = inner.replace(/<[^>]+>/g, '')
        if (depth === 1) return ''
        const base = `${idPrefix}${slugify(plain) || 'section'}`
        const count = used.get(base) ?? 0
        used.set(base, count + 1)
        const id = count ? `${base}-${count + 1}` : base
        if (depth === 2) toc.push({ id, text: plain })
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens)
        const external = /^https?:\/\//.test(href)
        const titleAttr = title ? ` title="${escapeText(title)}"` : ''
        return `<a href="${escapeText(href)}"${titleAttr}${external ? ' target="_blank" rel="noreferrer"' : ''}>${inner}</a>`
      },
    },
  })
  const html = marked.parse(markdown)
  return { html, toc }
}
