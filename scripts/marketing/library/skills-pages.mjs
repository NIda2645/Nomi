// 技能库：库首页（按分组）与单个技能页（正文全文 + 目录 + 怎么用 + 出处）。
// 方法类（导演、编剧、流程）和配方类（广告、角色与场景）共用一个模板：配方类多一张效果图。
import { contentByLocale } from '../content.mjs'
import { buildMetadata } from '../metadata.mjs'
import { fitDescription } from '../seo-limits.mjs'
import { escapeAttr, escapeText, localizedPath, otherLocale, renderDocument } from '../shell.mjs'
import { authorCredit, copyFor, localized, renderAttribution, renderBreadcrumbs, renderCopyButton, renderDownloadBand, renderLibraryHero, renderNodeCard, renderPromptText } from './common.mjs'
import { libraryGroups, libraryPaths } from './data.mjs'
import { renderMarkdown } from './markdown.mjs'
import { libraryCss } from './styles.mjs'

const appliesToLabel = (item, locale) => item.appliesTo.map((kind) => copyFor(locale).kindWord[kind] ?? kind).join(' · ')
const colon = (locale) => (locale === 'zh-CN' ? '：' : ': ')

/**
 * 技能页的 meta 描述：用目录里的技能摘要；太短（配方类摘要常只有十几个字）就接一句「哪一组、在哪里能用」，
 * 太长就在句内停顿处截断。摘要是 App 里的目录文字，官网不改它，只是把它收进 50–160 字（seo-limits.mjs）。
 */
export function skillMetaDescription(item, group, locale) {
  const suffix = copyFor(locale).skill.descriptionSuffix(localized(locale, group.label), item.nomiTools.length > 0)
  return fitDescription(localized(locale, item.summary), { locale, suffix })
}

/** 配方类技能里「配方 / Recipe」那一节就是提示词本身：做成可复制的提示词块，其余照常渲 Markdown。 */
const RECIPE_HEADINGS = new Set(['配方', 'Recipe'])

function renderSkillBody(item, locale) {
  const sections = item.body.split(/^(?=## )/m)
  const recipeIndex = sections.findIndex((section) => RECIPE_HEADINGS.has(section.split('\n')[0].replace(/^##\s+/, '').trim()))
  if (recipeIndex < 0) return renderMarkdown(item.body)
  const before = renderMarkdown(sections.slice(0, recipeIndex).join(''), { idPrefix: 'a-' })
  const recipe = sections[recipeIndex]
  const heading = recipe.split('\n')[0].replace(/^##\s+/, '').trim()
  const text = recipe.split('\n').slice(1).join('\n').trim()
  const after = renderMarkdown(sections.slice(recipeIndex + 1).join(''), { idPrefix: 'b-' })
  const recipeId = 'recipe'
  const recipeHtml = `<h2 id="${recipeId}">${escapeText(heading)}</h2>\n<div class="prompt-block recipe">${renderPromptText(text, `${recipeId}-text`)}${renderCopyButton(`${recipeId}-text`, locale)}</div>\n`
  return {
    html: before.html + recipeHtml + after.html,
    toc: [...before.toc, { id: recipeId, text: heading }, ...after.toc],
  }
}

function skillCard(item, locale) {
  return renderNodeCard({
    nodeTitle: appliesToLabel(item, locale),
    title: localized(locale, item.title),
    body: localized(locale, item.summary),
    media: item.preview ? { src: item.preview[640], alt: localized(locale, item.title) } : null,
    meta: item.license,
    href: libraryPaths.skill(item.name),
    locale,
  })
}

export function renderSkillIndex(locale, runtimeFacts, data) {
  const content = contentByLocale[locale]
  const copy = copyFor(locale)
  const groups = libraryGroups(data, 'skill')
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)
  const crumbs = [{ name: copy.crumbHome, path: '/' }, { name: copy.skills.name, path: libraryPaths.skills }]
  const sections = groups.map((group) => `<section class="block lib-section" id="${escapeAttr(group.id)}" aria-labelledby="${escapeAttr(group.id)}-title">
  <div class="wrap">
    <div class="section-head"><h2 id="${escapeAttr(group.id)}-title">${escapeText(localized(locale, group.label))}</h2><span class="count">${group.items.length}</span></div>
    <p class="section-note">${escapeText(copy.groupIntro[group.id])}</p>
    <div class="card-grid">${group.items.map((item) => skillCard(item, locale)).join('\n')}</div>
  </div>
</section>`).join('\n')
  const main = [
    renderLibraryHero({
      eyebrow: copy.skills.eyebrow,
      titleLead: copy.skills.titleLead,
      titleEmphasis: copy.skills.titleEmphasis,
      lede: copy.skills.lede,
      anchors: groups.map((group) => ({ id: group.id, label: localized(locale, group.label), count: group.items.length })),
      crumbs,
      locale,
    }),
    sections,
    renderDownloadBand(locale),
  ].join('\n')
  const path = localizedPath(locale, libraryPaths.skills)
  const items = groups.flatMap((group) => group.items)
  const metadata = buildMetadata(locale, {
    path,
    htmlLang: content.htmlLang,
    ogLocale: content.ogLocale,
    pageType: 'CollectionPage',
    meta: { title: copy.skills.metaTitle(total), description: copy.skills.metaDescription(total), imageAlt: copy.skills.name },
    alternates: { 'zh-CN': libraryPaths.skills, en: localizedPath('en', libraryPaths.skills) },
    breadcrumbs: crumbs.map((crumb) => ({ name: crumb.name, path: localizedPath(locale, crumb.path) })),
    graph: [{
      '@type': 'ItemList',
      '@id': `${runtimeFacts.siteUrl}${path}#skills`,
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: localized(locale, item.title), url: `${runtimeFacts.siteUrl}${localizedPath(locale, libraryPaths.skill(item.name))}` })),
    }],
  }, runtimeFacts)
  return renderDocument({ locale, pageKey: 'skills', runtimeFacts, metadata, css: libraryCss(), main, alternateHref: localizedPath(otherLocale(locale), libraryPaths.skills) })
}

export function renderSkillDetail(locale, runtimeFacts, data, group, item) {
  const content = contentByLocale[locale]
  const copy = copyFor(locale)
  const title = localized(locale, item.title)
  const groupLabel = localized(locale, group.label)
  const path = libraryPaths.skill(item.name)
  const crumbs = [
    { name: copy.crumbHome, path: '/' },
    { name: copy.skills.name, path: libraryPaths.skills },
    { name: groupLabel, path: `${libraryPaths.skills}#${group.id}` },
    { name: title, path },
  ]
  const { html, toc } = renderSkillBody(item, locale)
  // 正文是哪种语言写的：英文页上的中文正文要标 lang，读屏和搜索引擎才不会当成英文。
  const bodyLang = /[一-鿿]/.test(item.body.slice(0, 400)) ? 'zh-CN' : 'en'
  // 目录只在够长时出现：两三节的配方不需要目录。
  const tocHtml = toc.length >= 3
    ? `<nav class="toc" aria-label="${escapeAttr(copy.skill.toc)}"><p>${escapeText(copy.skill.toc)}</p><ol>${toc.map((entry) => `<li><a href="#${escapeAttr(entry.id)}">${escapeText(entry.text)}</a></li>`).join('')}</ol></nav>`
    : ''
  // 大图只放真实效果（原仓库成片或 Nomi 生成）；示意插画只当库卡片的封面，不在详情页占一屏。
  const preview = item.preview && item.preview.provenance !== 'illustration'
    ? `<figure class="skill-preview"><img src="${escapeAttr(item.preview[1280])}" alt="${escapeAttr(title)}" width="1280" height="720" decoding="async" /><figcaption>${escapeText(copy.skill.previewProvenance[item.preview.provenance] ?? '')}</figcaption></figure>`
    : ''
  const related = group.items.filter((other) => other.name !== item.name).slice(0, 6)
  const main = `<section class="lib-hero skill-hero">
  <div class="wrap">
    ${renderBreadcrumbs(crumbs, locale)}
    <p class="eyebrow">${escapeText(copy.skills.name)} · ${escapeText(groupLabel)}</p>
    <h1 class="display lib-title"><span>${escapeText(title)}</span></h1>
    <p class="lede">${escapeText(localized(locale, item.summary))}</p>
    <ul class="chips hero-chips"><li>${escapeText(copy.skill.appliesTo)}${colon(locale)}${escapeText(appliesToLabel(item, locale))}</li><li>${escapeText(copy.license)}${colon(locale)}${escapeText(item.license)}</li></ul>
  </div>
</section>
<section class="block skill-use">
  <div class="wrap">
    <div class="use-grid" aria-label="${escapeAttr(copy.skill.useTitle)}">
      <div class="use-box"><h2>${escapeText(copy.skill.useInNomi)}</h2><p>${escapeText(copy.skill.useInNomiBody)}</p></div>
      <div class="use-box"><h2>${escapeText(copy.skill.useElsewhere)}</h2><p>${escapeText(item.nomiTools.length ? copy.skill.useElsewhereNomiTools : copy.skill.useElsewhereBody)}</p></div>
    </div>
    ${preview}
  </div>
</section>
<section class="block skill-body">
  <div class="wrap skill-layout${tocHtml ? '' : ' no-toc'}">
    ${tocHtml}
    <div class="skill-main">
      <article class="prose"${bodyLang !== content.htmlLang ? ` lang="${bodyLang}"` : ''}>${html}</article>
      ${renderAttribution({ source: item.source, license: item.license, licenseText: item.licenseText, repositoryPath: item.repositoryPath, locale, shared: runtimeFacts })}
    </div>
  </div>
</section>
${related.length ? `<section class="block lib-section" aria-labelledby="related-title">
  <div class="wrap">
    <div class="section-head"><h2 id="related-title">${escapeText(copy.skill.related)}</h2></div>
    <div class="card-grid">${related.map((other) => skillCard(other, locale)).join('\n')}</div>
  </div>
</section>` : ''}
${renderDownloadBand(locale)}`
  const canonical = `${runtimeFacts.siteUrl}${localizedPath(locale, path)}`
  const metadata = buildMetadata(locale, {
    path: localizedPath(locale, path),
    htmlLang: content.htmlLang,
    ogLocale: content.ogLocale,
    image: item.preview?.[1280],
    meta: { title: copy.skill.metaTitle(title, groupLabel), description: skillMetaDescription(item, group, locale), imageAlt: title },
    alternates: { 'zh-CN': path, en: localizedPath('en', path) },
    breadcrumbs: crumbs.map((crumb) => ({ name: crumb.name, path: localizedPath(locale, crumb.path) })),
    graph: [{
      '@type': 'SoftwareSourceCode',
      '@id': `${canonical}#skill`,
      name: title,
      description: localized(locale, item.summary),
      license: item.license,
      codeRepository: `${runtimeFacts.repositoryUrl}/tree/main/${item.repositoryPath}`,
      programmingLanguage: 'Markdown',
      runtimePlatform: 'Agent Skills (SKILL.md)',
      author: { '@type': item.source.author === 'Nomi contributors' ? 'Organization' : 'Person', name: authorCredit(item.source.author).name, ...(authorCredit(item.source.author).url ? { sameAs: item.source.author } : {}) },
      ...(item.source.author === 'Nomi contributors' ? {} : { isBasedOn: item.source.url }),
    }],
  }, runtimeFacts)
  return renderDocument({ locale, pageKey: 'skills', runtimeFacts, metadata, css: libraryCss(), main, alternateHref: localizedPath(otherLocale(locale), path) })
}

export function skillPages(data) {
  return [
    { render: (locale, facts) => renderSkillIndex(locale, facts, data), output: { 'zh-CN': 'marketing/skills.html', en: 'marketing/en/skills.html' } },
    ...libraryGroups(data, 'skill').flatMap((group) => group.items.map((item) => ({
      render: (locale, facts) => renderSkillDetail(locale, facts, data, group, item),
      output: { 'zh-CN': `marketing/skills/${item.name}.html`, en: `marketing/en/skills/${item.name}.html` },
    }))),
  ]
}
