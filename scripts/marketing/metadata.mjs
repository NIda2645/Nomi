const localizedImage = {
  'zh-CN': '/assets/social-preview-zh.jpg',
  en: '/assets/social-preview-en.jpg',
}

/**
 * 一个公开页面的 SEO / 分享 / 结构化数据。
 * page = { path, htmlLang, ogLocale, meta, alternates: { 'zh-CN': path, en: path } }——
 * 首页和快速上手各自有一对中英互为 hreflang 的地址，x-default 指中文那一版。
 */
export function buildMetadata(locale, page, shared) {
  const canonical = `${shared.siteUrl}${page.path}`
  const image = `${shared.siteUrl}${localizedImage[locale]}`

  const websiteId = `${shared.siteUrl}/#website`
  const applicationId = `${shared.siteUrl}/#application`
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
          '@type': 'WebPage',
          '@id': canonical,
          url: canonical,
          name: page.meta.title,
          description: page.meta.description,
          inLanguage: page.htmlLang,
          isPartOf: { '@id': websiteId },
          about: { '@id': applicationId },
          primaryImageOfPage: { '@type': 'ImageObject', contentUrl: image },
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
      ],
    },
  }
}
