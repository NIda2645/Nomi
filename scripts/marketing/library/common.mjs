// 三个库共用的页面零件：页头、面包屑、节点卡片、出处与许可证、下载条。
import { contentByLocale } from '../content.mjs'
import { escapeAttr, escapeText, externalAttrs, localizedPath } from '../shell.mjs'
import { libraryCopyByLocale } from './copy.mjs'

export const copyFor = (locale) => libraryCopyByLocale[locale]
export const localized = (locale, value) => (value && typeof value === 'object' ? value[locale] ?? value['zh-CN'] : value)

/** 面包屑：[{ name, path }]，最后一项是本页（不加链接）。结构化数据用同一份（metadata.mjs）。 */
export function renderBreadcrumbs(crumbs, locale) {
  const items = crumbs.map((crumb, index) => {
    const last = index === crumbs.length - 1
    const label = escapeText(crumb.name)
    return `<li>${last ? `<span aria-current="page">${label}</span>` : `<a href="${escapeAttr(localizedPath(locale, crumb.path))}">${label}</a>`}</li>`
  }).join('')
  return `<nav class="crumbs" aria-label="breadcrumb"><ol>${items}</ol></nav>`
}

/** 两段标题之间：中文不留空格（「23 条运镜提示词」），英文留（「Models at … price」前面要有空格）。页头和下载条共用。 */
const titleJoiner = (locale) => (locale === 'zh-CN' ? '' : ' ')

/** 库页页头：比首页首屏矮一截。`anchors` 是分组锚点条 [{ id, label, count }]。 */
export function renderLibraryHero({ eyebrow, titleLead, titleEmphasis, lede, anchors = [], crumbs, locale }) {
  const chips = anchors.length
    ? `<nav class="group-anchors" aria-label="${escapeAttr(eyebrow)}">${anchors.map((anchor) => `<a href="#${escapeAttr(anchor.id)}">${escapeText(anchor.label)}${anchor.count != null ? `<span>${anchor.count}</span>` : ''}</a>`).join('')}</nav>`
    : ''
  const emphasis = titleEmphasis ? `${titleJoiner(locale)}<em>${escapeText(titleEmphasis)}</em>` : ''
  return `<section class="lib-hero">
  <div class="wrap">
    ${crumbs ? renderBreadcrumbs(crumbs, locale) : ''}
    <p class="eyebrow">${escapeText(eyebrow)}</p>
    <h1 class="display lib-title"><span>${escapeText(titleLead)}</span>${emphasis}</h1>
    ${lede ? `<p class="lede">${escapeText(lede)}</p>` : ''}
    ${chips}
  </div>
</section>`
}

/**
 * 一张库卡片，长得像 Nomi 画布上的节点：节点标题在框外左上，框的左右各一个连接点。
 * `media` 为 { src, alt } 或 null；`href` 为空时整张卡不可点（例如还没写介绍的模型）。
 */
export function renderNodeCard({ nodeTitle, title, subtitle, body, chips = [], media, href, meta, locale }) {
  const tag = href ? 'a' : 'div'
  const hrefAttr = href ? ` href="${escapeAttr(localizedPath(locale, href))}"` : ''
  const image = media ? `<div class="card-media"><img src="${escapeAttr(media.src)}" alt="${escapeAttr(media.alt)}" loading="lazy" decoding="async" width="640" height="360" /></div>` : ''
  const chipRow = chips.length ? `<ul class="chips">${chips.map((chip) => `<li>${escapeText(chip)}</li>`).join('')}</ul>` : ''
  return `<article class="lib-card${href ? ' linked' : ''}">
  <p class="node-title">${escapeText(nodeTitle ?? '')}</p>
  <${tag} class="card-frame"${hrefAttr}>
    ${image}
    <div class="card-body">
      <h3>${escapeText(title)}</h3>
      ${subtitle ? `<p class="card-subtitle">${escapeText(subtitle)}</p>` : ''}
      ${body ? `<p class="card-text">${escapeText(body)}</p>` : ''}
      ${chipRow}
      ${meta ? `<p class="card-meta">${escapeText(meta)}</p>` : ''}
    </div>
  </${tag}>
</article>`
}

/**
 * 目录里 `source.author` 有两种写法：人名或组织名（jnMetaCode、Nomi contributors），
 * 或原作者那条帖子的链接（https://x.com/<账号>/status/…）。后一种页面上写成 `@账号` 并链到那条帖子。
 */
export function authorCredit(author) {
  if (!/^https?:\/\//.test(author)) return { name: author, url: null }
  const url = new URL(author)
  const handle = /^\/([^/]+)\/status\//.exec(url.pathname)?.[1]
  return { name: handle ? `@${handle}` : url.hostname, url: author }
}

/** 原仓库的叫法：`github.com/owner/repo/blob/…` → `owner/repo`，其余用域名。 */
const repositoryLabel = (url) => /^https:\/\/github\.com\/([^/]+\/[^/]+)/.exec(url)?.[1] ?? new URL(url).hostname

/**
 * 出处与许可证：原仓库（钉到提交）、作者、Nomi 改了什么；非 AGPL 的附许可证全文（折叠）。
 * `authors` 是这一块署名对应的全部作者（同一个来源地址下可能有好几位，页面按来源地址合并成一块，一位都不能丢）。
 */
export function renderAttribution({ source, authors = [source.author], license, licenseText, repositoryPath, locale, shared }) {
  const copy = copyFor(locale)
  const credits = [...new Set(authors)].map(authorCredit)
  const named = credits.filter((credit) => !credit.url)
  const posted = credits.filter((credit) => credit.url)
  const sourceLabel = named.length ? named.map((credit) => credit.name).join(' · ') : repositoryLabel(source.url)
  const postedRow = posted.length
    ? `<div><dt>${escapeText(copy.authors)}</dt><dd>${posted.map((credit) => `<a href="${escapeAttr(credit.url)}" ${externalAttrs}>${escapeText(credit.name)}</a>`).join(' · ')}</dd></div>`
    : ''
  const revision = source.revision ? ` · <code>${escapeText(source.revision.slice(0, 7))}</code>` : ''
  const fileLink = repositoryPath ? `<a href="${escapeAttr(`${shared.repositoryUrl}/tree/main/${repositoryPath}`)}" ${externalAttrs}>${escapeText(copy.viewOnGithub)} ↗</a>` : ''
  const fullText = licenseText && license !== 'AGPL-3.0-only'
    ? `<details class="license-text"><summary>${escapeText(copy.licenseText)}</summary><pre>${escapeText(licenseText)}</pre></details>`
    : ''
  return `<aside class="attribution" aria-label="${escapeAttr(copy.source)}">
  <dl>
    <div><dt>${escapeText(copy.source)}</dt><dd><a href="${escapeAttr(source.url)}" ${externalAttrs}>${escapeText(sourceLabel)}</a>${revision}</dd></div>
    ${postedRow}
    <div><dt>${escapeText(copy.license)}</dt><dd>${escapeText(license)}</dd></div>
    ${source.changes ? `<div><dt>${escapeText(copy.changes)}</dt><dd>${escapeText(source.changes)}</dd></div>` : ''}
  </dl>
  ${fileLink}
  ${fullText}
</aside>`
}

/** 页底的下载条：每个库页都以它收尾，把读完的人带到下载。 */
export function renderDownloadBand(locale, { title, body } = {}) {
  const content = contentByLocale[locale]
  return `<section class="download-band">
  <div class="wrap download-band-inner">
    <div>
      <h2>${escapeText(title ?? `${content.hero.titleLead}${titleJoiner(locale)}${content.hero.titleEmphasis}`)}</h2>
      <p>${escapeText(body ?? content.hero.meta)}</p>
    </div>
    <a class="button primary" data-download-nomi href="#download-options">${escapeText(content.hero.download)}</a>
  </div>
</section>`
}

/** 带槽位的提示词原文：`{品牌名}` 这类待填的地方用强调色标出来。原文先转义，再只给槽位包一层。 */
export function renderPromptText(text, id) {
  const marked = escapeText(text).replace(/\{[^{}\n]+\}/g, (slot) => `<mark class="slot">${slot}</mark>`)
  return `<pre class="prompt-text" id="${escapeAttr(id)}">${marked}</pre>`
}

export function renderCopyButton(targetId, locale) {
  const copy = copyFor(locale)
  return `<button class="copy-button" type="button" data-copy="${escapeAttr(targetId)}"><span class="copy-idle">${escapeText(copy.copy)}</span><span class="copy-done">${escapeText(copy.copied)}</span></button>`
}
