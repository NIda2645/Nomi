// 模型库首页与单个模型页。能力表全部来自导出数据（模型档案取并集），文字介绍来自 marketing/content/models。
import { contentByLocale } from '../content.mjs'
import { buildMetadata } from '../metadata.mjs'
import { escapeAttr, escapeText, externalAttrs, localizedPath, otherLocale, renderDocument } from '../shell.mjs'
import { copyFor, localized, renderBreadcrumbs, renderDownloadBand, renderLibraryHero, renderNodeCard } from './common.mjs'
import { libraryGroups, libraryPaths, modelEditorial, publicModels } from './data.mjs'
import { renderMarkdown } from './markdown.mjs'
import { libraryCss } from './styles.mjs'

const KIND_ORDER = ['video', 'image']

/** 模型在某种语言下的显示名：介绍里写了 name 就用它（英文页的「可灵」要叫 Kling），否则用目录名。 */
export function modelName(model, locale) {
  return modelEditorial(model.slug, locale)?.name ?? model.label
}

function apiVendors(model, locale) {
  const names = copyFor(locale).vendorNames
  return model.vendors
    .filter((vendor) => vendor.authType !== 'none')
    .map((vendor) => ({ ...vendor, name: names[vendor.key] ?? vendor.name }))
}

function intentLabels(model, locale) {
  const labels = copyFor(locale).intents[model.kind] ?? {}
  return model.facts.intents.map((intent) => labels[intent]).filter(Boolean)
}

/** 各家档案对清晰度的写法不一（4k / 4K / 1080P）：统一成 720p、1080p、2K、4K。 */
const normalizeResolution = (value) => String(value).trim().replace(/^(\d+)\s*[pP]$/, '$1p').replace(/^(\d+)\s*[kK]$/, '$1K')
const resolutionRank = (value) => {
  const progressive = /^(\d+)p$/.exec(value)
  if (progressive) return Number(progressive[1])
  const k = /^(\d+)K$/.exec(value)
  return k ? Number(k[1]) * 1000 : 0
}
const resolutionsOf = (model) => [...new Set(model.facts.resolutions.map(normalizeResolution))].sort((left, right) => resolutionRank(left) - resolutionRank(right))

/** 能力表的每一行：[标签, 值的列表]；没有这项能力的行不出现（不写「不支持」占位）。 */
function specRows(model, locale) {
  const copy = copyFor(locale)
  const { rows } = copy.model
  const facts = model.facts
  const out = [[rows.can, intentLabels(model, locale)]]
  const refs = ['image_ref', 'video_ref', 'audio_ref']
    .filter((kind) => kind in facts.references)
    .map((kind) => (facts.references[kind] == null ? copy.slots[kind] : `${copy.slots[kind]} ${facts.references[kind]}`))
  if (refs.length) out.push([rows.refs, refs])
  const duration = facts.durationSeconds
  if (duration?.min != null && duration?.max != null) out.push([rows.duration, [copy.model.seconds(duration.min, duration.max)]])
  else if (duration?.options?.length) out.push([rows.duration, duration.options.map((value) => copy.model.seconds(value, value))])
  const resolutions = resolutionsOf(model)
  if (resolutions.length) out.push([rows.resolution, resolutions])
  if (facts.aspectRatios.length) out.push([rows.aspect, facts.aspectRatios.map((value) => (value === 'adaptive' ? copy.model.adaptive : value))])
  if (facts.audio) out.push([rows.audio, [copy.model.audioYes]])
  if (facts.variants.length) out.push([rows.variants, facts.variants])
  out.push([rows.vendors, apiVendors(model, locale).map((vendor) => vendor.name)])
  return out
}

function modelCard(model, locale) {
  const copy = copyFor(locale)
  const editorial = modelEditorial(model.slug, locale)
  const facts = model.facts
  const duration = facts.durationSeconds?.max != null ? copy.model.seconds(facts.durationSeconds.min, facts.durationSeconds.max) : null
  const summary = [duration, resolutionsOf(model).at(-1), facts.audio ? copy.model.audioShort : null].filter(Boolean).join(' · ')
  return renderNodeCard({
    nodeTitle: editorial?.maker ?? '',
    title: modelName(model, locale),
    body: editorial?.headline ?? null,
    chips: intentLabels(model, locale),
    meta: [summary, `${copy.models.vendorsLabel} ${apiVendors(model, locale).map((vendor) => vendor.name).join(' · ')}`].filter(Boolean).join('  ·  '),
    href: editorial ? libraryPaths.model(model.slug) : null,
    locale,
  })
}

export function renderModelIndex(locale, runtimeFacts, data) {
  const content = contentByLocale[locale]
  const copy = copyFor(locale)
  const models = publicModels(data)
  const byKind = KIND_ORDER.map((kind) => ({ kind, items: models.filter((model) => model.kind === kind) })).filter((group) => group.items.length)
  const count = (kind) => byKind.find((group) => group.kind === kind)?.items.length ?? 0
  const path = localizedPath(locale, libraryPaths.models)
  const crumbs = [{ name: copy.crumbHome, path: '/' }, { name: copy.models.name, path: libraryPaths.models }]
  const sections = byKind.map(({ kind, items }) => `<section class="block lib-section" id="${kind}" aria-labelledby="${kind}-title">
  <div class="wrap">
    <div class="section-head"><h2 id="${kind}-title">${escapeText(copy.models.sections[kind])}</h2><span class="count">${items.length}</span></div>
    <div class="card-grid">${items.map((model) => modelCard(model, locale)).join('\n')}</div>
  </div>
</section>`).join('\n')
  const main = [
    renderLibraryHero({
      eyebrow: copy.models.eyebrow,
      titleLead: copy.models.titleLead(models.length),
      titleEmphasis: copy.models.titleEmphasis,
      lede: copy.models.lede,
      anchors: byKind.map(({ kind, items }) => ({ id: kind, label: copy.models.sections[kind], count: items.length })),
      crumbs,
      locale,
    }),
    sections,
    renderDownloadBand(locale),
  ].join('\n')
  const itemList = {
    '@type': 'ItemList',
    '@id': `${runtimeFacts.siteUrl}${path}#models`,
    numberOfItems: models.length,
    itemListElement: models.map((model, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: modelName(model, locale),
      ...(modelEditorial(model.slug, locale) ? { url: `${runtimeFacts.siteUrl}${localizedPath(locale, libraryPaths.model(model.slug))}` } : {}),
    })),
  }
  const metadata = buildMetadata(locale, {
    path,
    htmlLang: content.htmlLang,
    ogLocale: content.ogLocale,
    pageType: 'CollectionPage',
    meta: { title: copy.models.metaTitle(models.length), description: copy.models.metaDescription(count('video'), count('image')), imageAlt: copy.models.name },
    alternates: { 'zh-CN': libraryPaths.models, en: localizedPath('en', libraryPaths.models) },
    breadcrumbs: crumbs.map((crumb) => ({ name: crumb.name, path: localizedPath(locale, crumb.path) })),
    graph: [itemList],
  }, runtimeFacts)
  return renderDocument({ locale, pageKey: 'models', runtimeFacts, metadata, css: libraryCss(), main, alternateHref: localizedPath(otherLocale(locale), libraryPaths.models) })
}

function relatedCards(model, data, locale) {
  const copy = copyFor(locale)
  const cards = []
  for (const group of libraryGroups(data, 'effect')) {
    if (!group.items.some((item) => item.appliesTo.includes(model.kind))) continue
    const cover = group.items.find((item) => item.preview)?.preview
    cards.push(renderNodeCard({
      nodeTitle: copy.prompts.name,
      title: localized(locale, group.label),
      body: copy.groupIntro[group.id],
      meta: copy.prompts.count(group.items.length),
      media: cover ? { src: cover[640], alt: localized(locale, group.label) } : null,
      href: libraryPaths.effectGroup(group.id),
      locale,
    }))
  }
  for (const group of libraryGroups(data, 'skill')) {
    for (const item of group.items) {
      if (!item.preview || !item.appliesTo.includes(model.kind)) continue
      cards.push(renderNodeCard({
        nodeTitle: localized(locale, item.group),
        title: localized(locale, item.title),
        body: localized(locale, item.summary),
        media: { src: item.preview[640], alt: localized(locale, item.title) },
        href: libraryPaths.skill(item.name),
        locale,
      }))
    }
  }
  return cards.slice(0, 6)
}

export function renderModelDetail(locale, runtimeFacts, data, model) {
  const content = contentByLocale[locale]
  const copy = copyFor(locale)
  const editorial = modelEditorial(model.slug, locale)
  if (!editorial) throw new Error(`没有介绍的模型不出详情页：${model.slug}`)
  const name = editorial.name ?? model.label
  const path = localizedPath(locale, libraryPaths.model(model.slug))
  const crumbs = [
    { name: copy.crumbHome, path: '/' },
    { name: copy.models.name, path: libraryPaths.models },
    { name: copy.models.sections[model.kind], path: `${libraryPaths.models}#${model.kind}` },
    { name, path: libraryPaths.model(model.slug) },
  ]
  const { html: articleHtml, toc } = renderMarkdown(editorial.body)
  const tipsAnchor = toc[2]?.id ?? toc[0]?.id ?? ''
  // 每个值单独不折行，换行只发生在值与值之间（手机上不会把「首尾帧」拆成两行）。
  const specs = specRows(model, locale)
    .map(([label, values]) => `<div><dt>${escapeText(label)}</dt><dd>${values.map((value) => `<span>${escapeText(value)}</span>`).join('')}</dd></div>`)
    .join('')
  const howto = copy.model.howto(name, copy.kindWord[model.kind], intentLabels(model, locale).join(locale === 'zh-CN' ? '、' : ', '))
  const sources = editorial.sources
    .map((source) => `<li><a href="${escapeAttr(source.url)}" ${externalAttrs}>${escapeText(source.title)}</a></li>`)
    .join('')
  const related = relatedCards(model, data, locale)
  const main = `<section class="model-hero">
  <div class="wrap">
    ${renderBreadcrumbs(crumbs, locale)}
    <div class="model-hero-grid">
      <div>
        <p class="eyebrow">${escapeText(editorial.maker)} · ${escapeText(copy.models.sections[model.kind])}</p>
        <h1 class="display model-title">${escapeText(name)}</h1>
        <p class="lede">${escapeText(editorial.headline)}</p>
        <p class="model-dates">${escapeText(copy.model.released)} ${escapeText(editorial.released)} · ${escapeText(copy.model.checked)} ${escapeText(editorial.checkedAt)}</p>
        <div class="hero-actions">
          <a class="button primary" data-download-nomi href="#download-options">${escapeText(content.hero.download)}</a>
          ${tipsAnchor ? `<a class="button quiet" href="#${escapeAttr(tipsAnchor)}">${escapeText(copy.model.toTips)}</a>` : ''}
        </div>
      </div>
      <aside class="spec-card" aria-labelledby="spec-title">
        <p class="spec-head" id="spec-title">${escapeText(copy.model.specTitle)}</p>
        <dl class="spec-rows">${specs}</dl>
        <p class="spec-note">${escapeText(copy.model.specNote)}</p>
      </aside>
    </div>
  </div>
</section>
<section class="block model-body">
  <div class="wrap prose-wrap">
    <article class="prose">
      ${articleHtml}
      <h2 id="in-nomi">${escapeText(copy.model.howtoTitle)}</h2>
      <p>${escapeText(howto)}</p>
      <h2 id="sources">${escapeText(copy.model.sourcesTitle)}</h2>
      <ul class="source-list">${sources}</ul>
    </article>
  </div>
</section>
${related.length ? `<section class="block lib-section related" aria-labelledby="related-title">
  <div class="wrap">
    <div class="section-head"><h2 id="related-title">${escapeText(copy.model.relatedTitle)}</h2></div>
    <div class="card-grid">${related.join('\n')}</div>
  </div>
</section>` : ''}
${renderDownloadBand(locale)}`
  const canonical = `${runtimeFacts.siteUrl}${path}`
  const article = {
    '@type': 'TechArticle',
    '@id': `${canonical}#article`,
    headline: copy.model.metaTitle(name),
    description: editorial.headline,
    inLanguage: content.htmlLang,
    dateModified: String(editorial.checkedAt),
    mainEntityOfPage: { '@id': canonical },
    about: { '@type': 'Thing', name },
    author: { '@type': 'Organization', name: 'Nomi', url: `${runtimeFacts.siteUrl}/` },
    citation: editorial.sources.map((source) => source.url),
  }
  const metadata = buildMetadata(locale, {
    path,
    htmlLang: content.htmlLang,
    ogLocale: content.ogLocale,
    meta: { title: copy.model.metaTitle(name), description: editorial.headline, imageAlt: name },
    alternates: { 'zh-CN': libraryPaths.model(model.slug), en: localizedPath('en', libraryPaths.model(model.slug)) },
    breadcrumbs: crumbs.map((crumb) => ({ name: crumb.name, path: localizedPath(locale, crumb.path) })),
    graph: [article],
  }, runtimeFacts)
  return renderDocument({ locale, pageKey: 'models', runtimeFacts, metadata, css: libraryCss(), main, alternateHref: localizedPath(otherLocale(locale), libraryPaths.model(model.slug)) })
}

/** 所有模型页：库首页 + 写了介绍的模型（中英两份介绍都要有，缺一种语言就不出，免得 hreflang 指空）。 */
export function modelPages(data) {
  const withEditorial = publicModels(data).filter((model) => modelEditorial(model.slug, 'zh-CN') && modelEditorial(model.slug, 'en'))
  return [
    { render: (locale, facts) => renderModelIndex(locale, facts, data), output: { 'zh-CN': 'marketing/models.html', en: 'marketing/en/models.html' } },
    ...withEditorial.map((model) => ({
      render: (locale, facts) => renderModelDetail(locale, facts, data, model),
      output: { 'zh-CN': `marketing/models/${model.slug}.html`, en: `marketing/en/models/${model.slug}.html` },
    })),
  ]
}
