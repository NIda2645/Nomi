const localizedImage = {
  'zh-CN': '/assets/social-preview-zh.jpg',
  en: '/assets/social-preview-en.jpg',
}

export function buildMetadata(locale, content, shared) {
  const canonical = `${shared.siteUrl}${content.path}`
  const image = `${shared.siteUrl}${localizedImage[locale]}`

  const websiteId = `${shared.siteUrl}/#website`
  const applicationId = `${shared.siteUrl}/#application`
  return {
    title: content.meta.title,
    description: content.meta.description,
    canonical,
    alternates: [
      { lang: 'zh-CN', href: `${shared.siteUrl}/` },
      { lang: 'en', href: `${shared.siteUrl}/en/` },
      { lang: 'x-default', href: `${shared.siteUrl}/` },
    ],
    openGraph: {
      locale: content.ogLocale,
      title: content.meta.title,
      description: content.meta.description,
      image,
      imageAlt: content.meta.imageAlt,
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
          name: content.meta.title,
          description: content.meta.description,
          inLanguage: content.htmlLang,
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
