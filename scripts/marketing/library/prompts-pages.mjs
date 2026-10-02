// 提示词库：库首页、效果分类页（一类一页，每条带锚点）、表情预设、开源合集。
// 一条只有一句话的效果不单独成页（方案 §4：薄页），合集也不拆成一条一页（原文早已公开，是重复内容）。
import { contentByLocale } from '../content.mjs'
import { buildMetadata } from '../metadata.mjs'
import { escapeAttr, escapeText, externalAttrs, localizedPath, otherLocale, renderDocument } from '../shell.mjs'
import { authorCredit, copyFor, localized, renderAttribution, renderCopyButton, renderDownloadBand, renderLibraryHero, renderNodeCard, renderPromptText } from './common.mjs'
import { collectionsWithPages, libraryGroups, libraryPaths } from './data.mjs'
import { libraryCss } from './styles.mjs'

const crumbsFor = (locale, tail = []) => [
  { name: copyFor(locale).crumbHome, path: '/' },
  { name: copyFor(locale).prompts.name, path: libraryPaths.prompts },
  ...tail,
]

function metadataFor(locale, runtimeFacts, { path, title, description, imageAlt, crumbs, pageType, graph = [], image }) {
  const content = contentByLocale[locale]
  return buildMetadata(locale, {
    path: localizedPath(locale, path),
    htmlLang: content.htmlLang,
    ogLocale: content.ogLocale,
    pageType,
    image,
    meta: { title, description, imageAlt },
    alternates: { 'zh-CN': path, en: localizedPath('en', path) },
    breadcrumbs: crumbs.map((crumb) => ({ name: crumb.name, path: localizedPath(locale, crumb.path) })),
    graph,
  }, runtimeFacts)
}

const groupKindWord = (group, locale) => copyFor(locale).kindWord[group.items[0].appliesTo[0]] ?? ''

/** 合集在这种语言的页面上叫什么：copy 里登记了就用登记的，没有就用 App 提示词来源里的名字。 */
const collectionName = (collection, locale) => copyFor(locale).collectionLabels[collection.id] ?? collection.label

export function renderPromptIndex(locale, runtimeFacts, data) {
  const copy = copyFor(locale)
  const groups = libraryGroups(data, 'effect')
  const effectCount = groups.reduce((sum, group) => sum + group.items.length, 0)
  const total = effectCount + data.expressions.length + data.collections.reduce((sum, collection) => sum + collection.prompts.length, 0)
  const crumbs = crumbsFor(locale)
  const effectCards = groups.map((group) => {
    const cover = group.items.find((item) => item.preview)?.preview
    return renderNodeCard({
      nodeTitle: copy.kindWord[group.items[0].appliesTo[0]],
      title: localized(locale, group.label),
      body: copy.groupIntro[group.id],
      meta: copy.prompts.count(group.items.length),
      media: cover ? { src: cover[640], alt: localized(locale, group.label) } : null,
      href: libraryPaths.effectGroup(group.id),
      locale,
    })
  }).join('\n')
  const expressionCover = data.expressions.find((item) => item.media)?.media
  const expressionCard = renderNodeCard({
    nodeTitle: copy.kindWord.image,
    title: copy.expressions.name,
    body: copy.expressions.lede,
    meta: copy.prompts.count(data.expressions.length),
    media: expressionCover ? { src: expressionCover[640], alt: copy.expressions.name } : null,
    href: libraryPaths.expressions,
    locale,
  })
  const withPages = new Set(collectionsWithPages(data).map((collection) => collection.id))
  const collectionCards = data.collections.map((collection) => renderNodeCard({
    nodeTitle: `${copy.kindWord[collection.promptType]} · ${collection.license}`,
    title: collectionName(collection, locale),
    body: collection.sourceUrl.replace('https://github.com/', ''),
    meta: collection.prompts.length ? copy.prompts.count(collection.prompts.length) : null,
    href: withPages.has(collection.id) ? libraryPaths.collection(collection.id) : null,
    locale,
  })).join('\n')
  const main = [
    renderLibraryHero({
      eyebrow: copy.prompts.eyebrow,
      titleLead: copy.prompts.titleLead,
      titleEmphasis: copy.prompts.titleEmphasis,
      lede: copy.prompts.lede,
      anchors: [
        { id: 'effects', label: copy.prompts.sections.effects, count: effectCount },
        { id: 'expressions', label: copy.prompts.sections.expressions, count: data.expressions.length },
        { id: 'collections', label: copy.prompts.sections.collections, count: data.collections.length },
      ],
      crumbs,
      locale,
    }),
    `<section class="block lib-section" id="effects"><div class="wrap"><div class="section-head"><h2>${escapeText(copy.prompts.sections.effects)}</h2><span class="count">${effectCount}</span></div><div class="card-grid">${effectCards}</div></div></section>`,
    `<section class="block lib-section" id="expressions"><div class="wrap"><div class="section-head"><h2>${escapeText(copy.prompts.sections.expressions)}</h2><span class="count">${data.expressions.length}</span></div><div class="card-grid">${expressionCard}</div></div></section>`,
    `<section class="block lib-section" id="collections"><div class="wrap"><div class="section-head"><h2>${escapeText(copy.prompts.sections.collections)}</h2><span class="count">${data.collections.length}</span></div><p class="section-note">${escapeText(copy.prompts.collectionNote)}</p><div class="card-grid">${collectionCards}</div></div></section>`,
    renderDownloadBand(locale),
  ].join('\n')
  const metadata = metadataFor(locale, runtimeFacts, {
    path: libraryPaths.prompts,
    title: copy.prompts.metaTitle(total),
    description: copy.prompts.metaDescription,
    imageAlt: copy.prompts.name,
    crumbs,
    pageType: 'CollectionPage',
  })
  return renderDocument({ locale, pageKey: 'prompts', runtimeFacts, metadata, css: libraryCss(), main, alternateHref: localizedPath(otherLocale(locale), libraryPaths.prompts) })
}

/**
 * 一条效果：封面、中英名、原文（槽位高亮）、复制。锚点用条目名，分享链接能直达这一条。
 * `showSummary` 为假时不出一句话说明——同一分类每条说明都一样时（运镜那 23 条都是同一句），重复 23 遍是噪音。
 */
function effectEntry(item, locale, showSummary) {
  const textId = `prompt-${item.name}`
  const other = otherLocale(locale)
  return `<article class="effect-entry" id="${escapeAttr(item.name)}">
  ${item.preview ? `<div class="effect-media"><img src="${escapeAttr(item.preview[640])}" alt="${escapeAttr(localized(locale, item.title))}" loading="lazy" decoding="async" width="640" height="360" /></div>` : ''}
  <div class="effect-body">
    <h3>${escapeText(localized(locale, item.title))} <span class="alt-name" lang="${other === 'en' ? 'en' : 'zh-CN'}">${escapeText(localized(other, item.title))}</span></h3>
    ${showSummary ? `<p class="effect-summary">${escapeText(localized(locale, item.summary))}</p>` : ''}
    <div class="prompt-block">${renderPromptText(item.body, textId)}${renderCopyButton(textId, locale)}</div>
  </div>
</article>`
}

export function renderEffectGroup(locale, runtimeFacts, data, group) {
  const copy = copyFor(locale)
  const label = localized(locale, group.label)
  const path = libraryPaths.effectGroup(group.id)
  const crumbs = crumbsFor(locale, [{ name: label, path }])
  // 同一个来源地址下的几条合成一块署名，但每一位作者都要署上，一位都不能被去重吃掉。
  const bySource = new Map()
  for (const item of group.items) {
    const entry = bySource.get(item.source.url) ?? { item, authors: [] }
    bySource.set(item.source.url, { item, authors: [...new Set([...entry.authors, item.source.author])] })
  }
  const sources = [...bySource.values()]
  const others = libraryGroups(data, 'effect').filter((other) => other.id !== group.id)
  const hasSlots = group.items.some((item) => /\{[^{}\n]+\}/.test(item.body))
  const showSummary = new Set(group.items.map((item) => localized(locale, item.summary))).size > 1
  const main = `${renderLibraryHero({
    eyebrow: copy.effectGroup.eyebrow,
    titleLead: `${group.items.length} ${locale === 'zh-CN' ? '条' : ''}`.trim(),
    titleEmphasis: locale === 'zh-CN' ? `${label}提示词` : `${label.toLowerCase()} ${group.items.length === 1 ? 'prompt' : 'prompts'}`,
    lede: copy.groupIntro[group.id],
    crumbs,
    locale,
  })}
<section class="block effect-list">
  <div class="wrap">
    ${hasSlots ? `<p class="section-note">${escapeText(copy.effectGroup.slotHint)}</p>` : ''}
    <div class="effect-grid">${group.items.map((item) => effectEntry(item, locale, showSummary)).join('\n')}</div>
  </div>
</section>
<section class="block lib-section">
  <div class="wrap"><div class="measure">
    <h2>${escapeText(copy.effectGroup.howtoTitle)}</h2>
    <p class="body">${escapeText(copy.effectGroup.howto)}</p>
    ${sources.map(({ item, authors }) => renderAttribution({ source: item.source, authors, license: item.license, licenseText: item.licenseText, repositoryPath: null, locale, shared: runtimeFacts })).join('\n')}
  </div></div>
</section>
<section class="block lib-section">
  <div class="wrap">
    <div class="section-head"><h2>${escapeText(copy.effectGroup.otherGroups)}</h2></div>
    <div class="card-grid compact">${others.map((other) => renderNodeCard({ title: localized(locale, other.label), meta: copy.prompts.count(other.items.length), href: libraryPaths.effectGroup(other.id), locale })).join('\n')}</div>
  </div>
</section>
${renderDownloadBand(locale)}`
  const canonical = `${runtimeFacts.siteUrl}${localizedPath(locale, path)}`
  const works = group.items.map((item) => ({
    '@type': 'CreativeWork',
    '@id': `${canonical}#${item.name}`,
    name: localized(locale, item.title),
    text: item.body,
    license: item.license,
    author: { '@type': 'Person', name: authorCredit(item.source.author).name, ...(authorCredit(item.source.author).url ? { sameAs: item.source.author } : {}) },
    isBasedOn: item.source.url,
  }))
  const metadata = metadataFor(locale, runtimeFacts, {
    path,
    title: copy.effectGroup.metaTitle(label, group.items.length, groupKindWord(group, locale)),
    description: copy.effectGroup.metaDescription(label, group.items.length),
    imageAlt: label,
    crumbs,
    pageType: 'CollectionPage',
    graph: [{ '@type': 'ItemList', '@id': `${canonical}#items`, numberOfItems: works.length, itemListElement: works.map((work, index) => ({ '@type': 'ListItem', position: index + 1, item: work })) }],
  })
  return renderDocument({ locale, pageKey: 'prompts', runtimeFacts, metadata, css: libraryCss(), main, alternateHref: localizedPath(otherLocale(locale), path) })
}

export function renderExpressions(locale, runtimeFacts, data) {
  const copy = copyFor(locale)
  const crumbs = crumbsFor(locale, [{ name: copy.expressions.name, path: libraryPaths.expressions }])
  const entries = data.expressions.map((item) => {
    const textId = `prompt-${item.id}`
    return `<article class="effect-entry" id="${escapeAttr(item.id)}">
  ${item.media ? `<div class="effect-media square"><img src="${escapeAttr(item.media[640])}" alt="${escapeAttr(item.title)}" loading="lazy" decoding="async" width="640" height="640" /></div>` : ''}
  <div class="effect-body">
    <h3>${escapeText(item.title)}</h3>
    <div class="prompt-block">${renderPromptText(item.prompt, textId)}${renderCopyButton(textId, locale)}</div>
  </div>
</article>`
  }).join('\n')
  const main = `${renderLibraryHero({ eyebrow: copy.expressions.eyebrow, titleLead: copy.expressions.title, titleEmphasis: '', lede: copy.expressions.lede, crumbs, locale })}
<section class="block effect-list"><div class="wrap"><div class="effect-grid expressions">${entries}</div></div></section>
${renderDownloadBand(locale)}`
  const metadata = metadataFor(locale, runtimeFacts, { path: libraryPaths.expressions, title: copy.expressions.metaTitle, description: copy.expressions.metaDescription, imageAlt: copy.expressions.name, crumbs, pageType: 'CollectionPage' })
  return renderDocument({ locale, pageKey: 'prompts', runtimeFacts, metadata, css: libraryCss(), main, alternateHref: localizedPath(otherLocale(locale), libraryPaths.expressions) })
}

export function renderCollection(locale, runtimeFacts, collection) {
  const copy = copyFor(locale)
  const path = libraryPaths.collection(collection.id)
  const label = collectionName(collection, locale)
  const crumbs = crumbsFor(locale, [{ name: label, path }])
  const entries = collection.prompts.map((prompt, index) => {
    const textId = `prompt-${collection.id}-${index + 1}`
    return `<article class="collection-entry" id="p${index + 1}">
  <h3>${escapeText(prompt.title)}</h3>
  <div class="prompt-block">${renderPromptText(prompt.prompt, textId)}${renderCopyButton(textId, locale)}</div>
</article>`
  }).join('\n')
  const main = `${renderLibraryHero({ eyebrow: copy.collection.eyebrow, titleLead: label, titleEmphasis: copy.prompts.count(collection.prompts.length), lede: copy.collection.lede(label), crumbs, locale })}
<section class="block effect-list">
  <div class="wrap"><div class="measure">
    <aside class="attribution"><dl>
      <div><dt>${escapeText(copy.collection.upstream)}</dt><dd><a href="${escapeAttr(collection.sourceUrl)}" ${externalAttrs}>${escapeText(collection.sourceUrl.replace('https://github.com/', ''))}</a></dd></div>
      <div><dt>${escapeText(copy.license)}</dt><dd>${escapeText(collection.license)}</dd></div>
    </dl></aside>
    <div class="collection-list">${entries}</div>
  </div></div>
</section>
${renderDownloadBand(locale)}`
  const metadata = metadataFor(locale, runtimeFacts, {
    path,
    title: copy.collection.metaTitle(label, collection.prompts.length),
    description: copy.collection.metaDescription(label, collection.prompts.length, collection.license),
    imageAlt: label,
    crumbs,
    pageType: 'CollectionPage',
  })
  return renderDocument({ locale, pageKey: 'prompts', runtimeFacts, metadata, css: libraryCss(), main, alternateHref: localizedPath(otherLocale(locale), path) })
}

export function promptPages(data) {
  return [
    { render: (locale, facts) => renderPromptIndex(locale, facts, data), output: { 'zh-CN': 'marketing/prompts.html', en: 'marketing/en/prompts.html' } },
    ...libraryGroups(data, 'effect').map((group) => ({
      render: (locale, facts) => renderEffectGroup(locale, facts, data, group),
      output: { 'zh-CN': `marketing/prompts/${group.id}.html`, en: `marketing/en/prompts/${group.id}.html` },
    })),
    { render: (locale, facts) => renderExpressions(locale, facts, data), output: { 'zh-CN': 'marketing/prompts/expressions.html', en: 'marketing/en/prompts/expressions.html' } },
    ...collectionsWithPages(data).map((collection) => ({
      render: (locale, facts) => renderCollection(locale, facts, collection),
      output: { 'zh-CN': `marketing/prompts/collections/${collection.id}.html`, en: `marketing/en/prompts/collections/${collection.id}.html` },
    })),
  ]
}
