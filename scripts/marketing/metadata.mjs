const localizedImage = {
  'zh-CN': '/assets/social-preview-zh.jpg',
  en: '/assets/social-preview-en.jpg',
}

/**
 * 一个公开页面的 SEO / 分享 / 结构化数据。
 * page = { path, htmlLang, ogLocale, meta, alternates: { 'zh-CN': path, en: path }, breadcrumbs?, graph?, image? }——
 * 每页都有一对中英互为 hreflang 的地址，x-default 指中文那一版。
 * `breadcrumbs` 是 [{ name, path }]（最后一项就是本页）；`graph` 是本页独有的结构化数据节点
 * （库首页的 ItemList、配方的 CreativeWork、技能的 SoftwareSourceCode）——只写页面上真有的东西。
 */
export function buildMetadata(locale, page, shared) {
  const canonical = `${shared.siteUrl}${page.path}`
  const image = page.image ? `${shared.siteUrl}${page.image}` : `${shared.siteUrl}${localizedImage[locale]}`

  const websiteId = `${shared.siteUrl}/#website`
  const applicationId = `${shared.siteUrl}/#application`
  const breadcrumbs = page.breadcrumbs?.length
    ? [{
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumbs`,
        itemListElement: page.breadcrumbs.map((crumb, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: crumb.name,
          item: `${shared.siteUrl}${crumb.path}`,
        })),
      }]
    : []
  return {
    title: page.meta.title,
    description: page.meta.description,
    canonical,
    alternates: [
      { lang: 'zh-CN', href: `${shared.siteUrl}${page.alternates['zh-CN']}` },
      { lang: 'en', href: `${shared.siteUrl}${page.alternates.en}` },
      { lang: 'x-default', href: `${shared.siteUrl}${page.alternates['zh-CN']}` },
    ],
    openGraph: {
      locale: page.ogLocale,
      title: page.meta.title,
      description: page.meta.description,
      image,
      imageAlt: page.meta.imageAlt,
    },
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': websiteId,
          name: 'Nomi',
          url: `${shared.siteUrl}/`,
          inLanguage: ['zh-CN', 'en'],
        },
        {
          '@type': page.pageType ?? 'WebPage',
          '@id': canonical,
          url: canonical,
          name: page.meta.title,
          description: page.meta.description,
          inLanguage: page.htmlLang,
          isPartOf: { '@id': websiteId },
          about: { '@id': applicationId },
          primaryImageOfPage: { '@type': 'ImageObject', contentUrl: image },
          ...(breadcrumbs.length ? { breadcrumb: { '@id': `${canonical}#breadcrumbs` } } : {}),
        },
        {
          '@type': 'SoftwareApplication',
          '@id': applicationId,
          name: 'Nomi',
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'macOS, Windows',
          codeRepository: shared.repositoryUrl,
          license: shared.licenseUrl,
          url: `${shared.siteUrl}/`,
          softwareVersion: shared.version,
          downloadUrl: shared.releaseUrl,
        },
        ...breadcrumbs,
        ...(page.graph ?? []),
      ],
    },
  }
}
