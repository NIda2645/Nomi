import { contentByLocale } from './content.mjs'
import { homepageClientJs, localeBootstrapJs } from './client.mjs'
import { downloadUrls } from './downloads.mjs'
import { buildMetadata } from './metadata.mjs'
import { homepageCss } from './styles.mjs'

const escapeText = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const escapeAttr = (value) => escapeText(value)
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const externalAttrs = 'target="_blank" rel="noreferrer"'

/** 每个页面在中英两边的地址（hreflang 互指、语言切换都读这一张表）。 */
const PAGE_PATHS = {
  home: { 'zh-CN': '/', en: '/en/' },
  quickstart: { 'zh-CN': '/quickstart', en: '/en/quickstart' },
}

const otherLocale = (locale) => (locale === 'zh-CN' ? 'en' : 'zh-CN')

function renderMetadata(metadata) {
  const alternates = metadata.alternates
    .map(({ lang, href }) => `<link rel="alternate" hreflang="${escapeAttr(lang)}" href="${escapeAttr(href)}" />`)
    .join('\n')
  const jsonLd = JSON.stringify(metadata.jsonLd).replaceAll('<', '\\u003c')
  return `<title>${escapeText(metadata.title)}</title>
<meta name="description" content="${escapeAttr(metadata.description)}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<meta name="theme-color" content="#faf9f6" />
<link rel="canonical" href="${escapeAttr(metadata.canonical)}" />
${alternates}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Nomi" />
<meta property="og:locale" content="${escapeAttr(metadata.openGraph.locale)}" />
<meta property="og:title" content="${escapeAttr(metadata.openGraph.title)}" />
<meta property="og:description" content="${escapeAttr(metadata.openGraph.description)}" />
<meta property="og:url" content="${escapeAttr(metadata.canonical)}" />
<meta property="og:image" content="${escapeAttr(metadata.openGraph.image)}" />
<meta property="og:image:alt" content="${escapeAttr(metadata.openGraph.imageAlt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeAttr(metadata.openGraph.title)}" />
<meta name="twitter:description" content="${escapeAttr(metadata.openGraph.description)}" />
<meta name="twitter:image" content="${escapeAttr(metadata.openGraph.image)}" />
<meta name="twitter:image:alt" content="${escapeAttr(metadata.openGraph.imageAlt)}" />
<script type="application/ld+json">${jsonLd}</script>`
}

function renderNav(content, locale, pageKey) {
  const home = PAGE_PATHS.home[locale]
  const onHome = pageKey === 'home'
  const anchor = (id) => (onHome ? `#${id}` : `${home}#${id}`)
  const localeHref = PAGE_PATHS[pageKey][otherLocale(locale)]
  return `<header class="site-header">
  <nav class="nav wrap" aria-label="${escapeAttr(content.nav.ariaLabel)}">
    <a class="brand" href="${escapeAttr(home)}" aria-label="Nomi"><img src="/assets/nomi-logo.svg" width="26" height="26" alt="" /><span class="wordmark">No<span>mi</span></span></a>
    <div class="nav-links" id="nav-links">
      <a href="${escapeAttr(anchor('features'))}">${escapeText(content.nav.features)}</a>
      <a href="${escapeAttr(PAGE_PATHS.quickstart[locale])}"${pageKey === 'quickstart' ? ' aria-current="page"' : ''}>${escapeText(content.nav.quickstart)}</a>
      <a href="${escapeAttr(anchor('open'))}">${escapeText(content.nav.open)}</a>
      <a href="${escapeAttr(anchor('community'))}">${escapeText(content.nav.community)}</a>
    </div>
    <div class="nav-actions">
      <a class="locale" href="${escapeAttr(localeHref)}" data-locale-choice="${otherLocale(locale)}" aria-label="${escapeAttr(content.nav.localeLabel)}">${escapeText(content.nav.locale)}</a>
      <a class="button primary small" data-download-nomi href="#download-options">${escapeText(content.nav.download)}</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="nav-links">${escapeText(content.nav.menu)}</button>
    </div>
  </nav>
</header>`
}

function renderHero(content, shared) {
  const poster = content.htmlLang === 'en' ? shared.filmPosterEn : shared.filmPoster
  return `<section class="hero" id="top">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">${escapeText(content.hero.eyebrow)}</p>
      <h1 class="display"><span>${escapeText(content.hero.titleLead)}</span> <em>${escapeText(content.hero.titleEmphasis)}</em></h1>
      <p class="lede">${escapeText(content.hero.lede)}</p>
      <div class="hero-actions">
        <a class="button primary" data-download-nomi href="#download-options">${escapeText(content.hero.download)}</a>
        <a class="button quiet" data-github-hero href="${escapeAttr(shared.repositoryUrl)}" ${externalAttrs}>${escapeText(content.hero.github)}</a>
      </div>
      <p class="hero-meta">${escapeText(content.hero.meta)}</p>
      <p class="mac-download-note">${escapeText(content.hero.macNotice)} <a href="#download-options" data-open-dialog="download-dialog">${escapeText(content.hero.macInstallHelp)}</a></p>
    </div>
    <figure class="window" id="film">
      <div class="window-bar" aria-hidden="true"><i></i><i></i><i></i><span>${escapeText(content.hero.windowTitle)}</span></div>
      <div class="film" data-film data-film-src="${escapeAttr(shared.film)}">
        <img class="film-poster" src="${escapeAttr(poster)}" alt="${escapeAttr(content.hero.posterAlt)}" width="1920" height="1080" fetchpriority="high" />
        <button class="film-play" type="button" data-film-play><span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>${escapeText(content.hero.play)}</span></button>
        <noscript><video class="film-video" src="${escapeAttr(shared.film)}" poster="${escapeAttr(poster)}" controls preload="none"></video></noscript>
      </div>
    </figure>
  </div>
</section>`
}

function renderPrice(content) {
  const facts = content.price.facts.map((fact) => `<div class="fact"><h3>${escapeText(fact.title)}</h3><p>${escapeText(fact.description)}</p></div>`).join('')
  return `<section class="block" id="price" aria-labelledby="price-title">
  <div class="wrap">
    <div class="block-head">
      <p class="eyebrow">${escapeText(content.price.eyebrow)}</p>
      <h2 id="price-title">${escapeText(content.price.title)}</h2>
      <p class="body">${escapeText(content.price.description)}</p>
    </div>
    <div class="gap-card" role="img" aria-label="${escapeAttr(content.price.barsLabel)}">
      <div class="bar-row"><div class="bar-label">${escapeText(content.price.barCommercial)}</div><div class="bar commercial"></div></div>
      <div class="bar-row"><div class="bar-label">${escapeText(content.price.barYours)}</div><div class="bar yours"></div></div>
      <p class="gap-note">${escapeText(content.price.note)}</p>
    </div>
    <div class="facts">${facts}</div>
  </div>
</section>`
}

function renderFeatures(content, shared) {
  const items = content.features.items.map((item, index) => {
    const time = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    return `<article class="feature${index % 2 ? ' flip' : ''}" data-feature="${escapeAttr(item.id)}">
      <div class="feature-text">
        <p class="kicker">${escapeText(item.kicker)}</p>
        <h3>${escapeText(item.title)}</h3>
        <p>${escapeText(item.description)}</p>
      </div>
      <div class="node">
        <p class="node-title">${escapeText(item.nodeTitle)}</p>
        <div class="node-frame">
          <video class="segment" data-segment data-start="${item.start}" data-end="${item.end}" src="${escapeAttr(`${shared.film}#t=${item.start},${item.end}`)}" poster="${escapeAttr(item.still)}" muted playsinline preload="none" aria-label="${escapeAttr(item.stillAlt)}"></video>
          <span class="segment-time">${time(item.start)}–${time(item.end)}</span>
        </div>
      </div>
    </article>`
  }).join('\n')
  return `<section class="block" id="features" aria-labelledby="features-title">
  <div class="wrap">
    <div class="block-head">
      <p class="eyebrow">${escapeText(content.features.eyebrow)}</p>
      <h2 id="features-title">${escapeText(content.features.title)}</h2>
    </div>
    ${items}
  </div>
</section>`
}

function renderOpen(content, shared) {
  const tree = content.open.tree.map((row, index) => `<div><span${index === 0 ? ' class="root"' : ''}>${escapeText(row.path)}</span>${row.note ? `<span class="note">${escapeText(row.note)}</span>` : ''}</div>`).join('')
  const points = content.open.points.map((point) => `<li>${escapeText(point)}</li>`).join('')
  return `<section class="block" id="open" aria-labelledby="open-title">
  <div class="wrap">
    <div class="block-head">
      <p class="eyebrow">${escapeText(content.open.eyebrow)}</p>
      <h2 id="open-title">${escapeText(content.open.title)}</h2>
    </div>
    <div class="open-grid">
      <div class="tree" role="img" aria-label="${escapeAttr(content.open.treeLabel)}">${tree}</div>
      <div>
        <ul class="checks">${points}</ul>
        <div class="open-actions">
          <a class="button quiet" href="${escapeAttr(shared.repositoryUrl)}" ${externalAttrs}>${escapeText(content.open.github)}</a>
          <a class="button quiet" href="${escapeAttr(shared.licenseUrl)}" ${externalAttrs}>${escapeText(content.open.license)}</a>
        </div>
      </div>
    </div>
  </div>
</section>`
}

function renderCommunity(content, shared) {
  const c = content.community
  return `<section class="block" id="community" aria-labelledby="community-title">
  <div class="wrap">
    <div class="vision">
      <div>
        <p class="eyebrow">${escapeText(c.eyebrow)}</p>
        <h2 id="community-title">${escapeText(c.title)}</h2>
        <p class="body">${escapeText(c.description)}</p>
        <div class="hero-actions">
          <a class="button on-dark" href="${escapeAttr(shared.repositoryUrl)}" ${externalAttrs}>GitHub</a>
          <a class="button on-dark" href="${escapeAttr(shared.discussionUrl)}" ${externalAttrs}>${escapeText(c.discussion)}</a>
          <a class="button on-dark" href="${escapeAttr(shared.bilibiliUrl)}" ${externalAttrs}>${escapeText(c.bilibili)}</a>
        </div>
      </div>
      <div class="qr-row">
        <figure class="qr" id="community-qr"><img src="${escapeAttr(shared.groupQr)}" alt="${escapeAttr(c.groupAlt)}" width="140" height="210" /><figcaption>${escapeText(c.groupCaption)}</figcaption></figure>
        <figure class="qr"><img src="${escapeAttr(shared.authorQr)}" alt="${escapeAttr(c.authorAlt)}" width="140" height="140" /><figcaption>${escapeText(c.authorCaption)}</figcaption></figure>
      </div>
    </div>
    <div class="teams">
      <div><h3>${escapeText(c.teamsTitle)}</h3><p>${escapeText(c.teamsDescription)}</p></div>
      <div class="hero-actions">
        <button class="button quiet" type="button" data-open-dialog="author-dialog">${escapeText(c.wechat)}</button>
        <a class="button quiet" href="${escapeAttr(shared.businessUrl)}" ${externalAttrs}>${escapeText(c.submit)}</a>
      </div>
    </div>
  </div>
</section>`
}

function renderFooter(content, shared, locale, pageKey) {
  return `<footer class="footer">
  <div class="wrap">
    <span class="wordmark small">No<span>mi</span></span>
    <a href="${escapeAttr(shared.licenseUrl)}" ${externalAttrs}>${escapeText(content.footer.license)}</a>
    <a href="${escapeAttr(shared.repositoryUrl)}" ${externalAttrs}>GitHub</a>
    <a href="${escapeAttr(shared.releaseNotesUrl)}" ${externalAttrs}>${escapeText(content.footer.releases)}</a>
    <a href="${escapeAttr(shared.twitterUrl)}" ${externalAttrs}>X / Twitter</a>
    <a href="${escapeAttr(PAGE_PATHS[pageKey][otherLocale(locale)])}" data-locale-choice="${otherLocale(locale)}">${escapeText(content.footer.locale)}</a>
    <span class="made">${escapeText(content.footer.made)}</span>
  </div>
</footer>`
}

function renderDownloadOptions(content) {
  const options = [
    { label: content.download.windows, hint: content.download.windowsHint, href: downloadUrls.windowsX64, code: 'EXE' },
    { label: content.download.macArm, hint: content.download.macArmHint, href: downloadUrls.macArm64, code: 'ARM64' },
    { label: content.download.macIntel, hint: content.download.macIntelHint, href: downloadUrls.macX64, code: 'X64' },
  ]
  return options.map((option) => `<a class="download-option" data-direct-download href="${escapeAttr(option.href)}"><span><strong>${escapeText(option.label)}</strong><small>${escapeText(option.hint)}</small></span><span aria-hidden="true">${option.code} ↓</span></a>`).join('')
}

function renderMacInstallGuide(content) {
  const steps = content.download.macSteps.map((step) => `<li>${escapeText(step)}</li>`).join('')
  return `<section class="mac-install-guide" data-mac-install-guide>
  <strong class="mac-install-guide-title">${escapeText(content.download.macGuideTitle)}</strong>
  <p>${escapeText(content.download.macGuideSummary)}</p>
  <ol>${steps}</ol>
  <p>${escapeText(content.download.macDamaged)}</p>
  <code class="mac-install-command">${escapeText(content.download.macCommand)}</code>
  <p class="mac-install-safety">${escapeText(content.download.macSafety)}</p>
</section>`
}

function renderDialogs(content, shared) {
  return `<dialog id="author-dialog" aria-labelledby="author-title">
  <div class="dialog-head"><strong id="author-title">${escapeText(content.a11y.authorTitle)}</strong><button class="dialog-close" type="button" aria-label="${escapeAttr(content.a11y.close)}">×</button></div>
  <div class="dialog-body qr-content"><img src="${escapeAttr(shared.authorQr)}" alt="${escapeAttr(content.a11y.authorTitle)}" width="960" height="960" /><p>${escapeText(content.a11y.authorCopy)}</p></div>
</dialog>
<dialog id="download-dialog" aria-labelledby="download-title">
  <div class="dialog-head"><strong id="download-title">${escapeText(content.download.title)}</strong><button class="dialog-close" type="button" aria-label="${escapeAttr(content.a11y.close)}">×</button></div>
  <div class="dialog-body download-dialog-body"><p>${escapeText(content.download.description)}</p><div class="download-options">${renderDownloadOptions(content)}</div>${renderMacInstallGuide(content)}</div>
</dialog>`
}

function renderNoScriptDownload(content) {
  return `<noscript><section class="download-fallback" id="download-options"><div class="wrap"><h2>${escapeText(content.download.title)}</h2><p>${escapeText(content.download.description)}</p><div class="download-options">${renderDownloadOptions(content)}</div>${renderMacInstallGuide(content)}</div></section></noscript>`
}

function renderQuickstartMain(content, shared, version) {
  const q = content.quickstart
  const steps = q.steps.map((step) => {
    const aside = step.id === 'install'
      ? `<div><p class="latest"><span data-latest-version>v${escapeText(version)}</span></p><div class="download-options">${renderDownloadOptions(content)}</div><p class="tip">${escapeText(q.installTip)}</p></div>`
      : `<div class="shot"><img src="${escapeAttr(step.image)}" alt="${escapeAttr(step.imageAlt)}" width="1920" height="1080" /></div>`
    return `<li class="step" id="step-${escapeAttr(step.id)}">
      <div>
        <p class="step-label">${escapeText(step.label)}</p>
        <h2>${escapeText(step.title)}</h2>
        <p>${escapeText(step.description)}</p>
      </div>
      ${aside}
    </li>`
  }).join('\n')
  const faq = q.faq.map((item) => `<details><summary>${escapeText(item.question)}</summary><p>${escapeText(item.answer)}</p></details>`).join('')
  return `<section class="qs-hero">
  <div class="wrap">
    <p class="eyebrow">${escapeText(q.eyebrow)}</p>
    <h1 class="display"><span>${escapeText(q.titleLead)}</span> <em>${escapeText(q.titleEmphasis)}</em></h1>
    <p class="lede">${escapeText(q.lede)}</p>
  </div>
</section>
<section class="block qs-steps">
  <div class="wrap">
    <ol class="steps">${steps}</ol>
    <div class="block-head faq-head"><h2>${escapeText(q.faqTitle)}</h2></div>
    <div class="faq">${faq}</div>
    <p class="more">${escapeText(q.more)} <a href="${escapeAttr(shared.handbookUrl)}">${escapeText(q.handbook)}</a> · <a href="${escapeAttr(shared.mcpGuideUrl)}" ${externalAttrs}>${escapeText(q.mcpGuide)}</a></p>
  </div>
</section>`
}

function renderPage(locale, runtimeFacts, pageKey) {
  const content = contentByLocale[locale]
  if (!content) throw new Error(`Unknown marketing locale: ${locale}`)
  const page = pageKey === 'home'
    ? { path: content.path, htmlLang: content.htmlLang, ogLocale: content.ogLocale, meta: content.meta, alternates: PAGE_PATHS.home }
    : { path: content.quickstart.path, htmlLang: content.htmlLang, ogLocale: content.ogLocale, meta: content.quickstart.meta, alternates: PAGE_PATHS.quickstart }
  const metadata = buildMetadata(locale, page, runtimeFacts)
  const main = pageKey === 'home'
    ? [renderHero(content, runtimeFacts), renderPrice(content), renderFeatures(content, runtimeFacts), renderOpen(content, runtimeFacts), renderCommunity(content, runtimeFacts)].join('\n')
    : renderQuickstartMain(content, runtimeFacts, runtimeFacts.version)
  return `<!doctype html>
<html lang="${escapeAttr(content.htmlLang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${renderMetadata(metadata)}
${pageKey === 'home' ? `<script>${localeBootstrapJs()}</script>\n` : ''}<link rel="icon" type="image/svg+xml" href="/assets/nomi-logo.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;700;900&display=swap" />
<style>${homepageCss}</style>
</head>
<body class="page-${pageKey}">
<a class="skip-link" href="#main">${escapeText(content.a11y.skip)}</a>
${renderNav(content, locale, pageKey)}
<main id="main">
${main}
</main>
${renderFooter(content, runtimeFacts, locale, pageKey)}
${renderDialogs(content, runtimeFacts)}
${renderNoScriptDownload(content)}
<script>${homepageClientJs(downloadUrls)}</script>
</body>
</html>
`
}

export function renderHomepage(locale, runtimeFacts) {
  return renderPage(locale, runtimeFacts, 'home')
}

export function renderQuickstart(locale, runtimeFacts) {
  return renderPage(locale, runtimeFacts, 'quickstart')
}
