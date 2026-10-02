// 官网「有哪些页面」的唯一 owner。build-marketing-site.mjs（生成 HTML）与
// build-marketing-sitemap.mjs（生成 sitemap 和 SEO 巡检的页面清单）都读这里，不再各养一份。
// 之前手写的 scripts/marketing/site-manifest.mjs 只列了 5 个页面（首页/快速上手/手册），
// 模型库、提示词库、技能库这些后来加的页面从没进过它——这道口子现在补上（方案 §6）。
import { locales } from './content.mjs'
import { featurePages } from './features.mjs'
import { modelPages } from './library/models-pages.mjs'
import { promptPages } from './library/prompts-pages.mjs'
import { skillPages } from './library/skills-pages.mjs'
import { alternateLinks } from './metadata.mjs'
import { contentHash, nextPageDates } from './page-dates.mjs'
import { routeFromOutputPath } from './routes.mjs'
import { renderHomepage, renderQuickstart } from './template.mjs'

/**
 * 官网全部页面：每项 `{ render(locale, runtimeFacts), output: { 'zh-CN': path, en: path } }`。
 * `output` 已经是相对仓库根的落盘路径（如 `marketing/models/kling-3-0.html`）——
 * 干净地址（sitemap、hreflang、内链用的那种）从这个路径机械推出（routes.mjs），不需要另外声明一遍。
 */
export function sitePages(siteData) {
  return [
    { render: renderHomepage, output: { 'zh-CN': 'marketing/index.html', en: 'marketing/en/index.html' } },
    { render: renderQuickstart, output: { 'zh-CN': 'marketing/quickstart.html', en: 'marketing/en/quickstart.html' } },
    ...featurePages(),
    ...modelPages(siteData),
    ...promptPages(siteData),
    ...skillPages(siteData),
  ]
}

/**
 * 每个 {page, locale} 渲染一次：写 HTML 文件、算 sitemap 哈希，两边都从这一份结果出。
 * `alternates` 是这一页各语言版本的地址（`{ 'zh-CN': '/models', en: '/en/models' }`），从两种语言的落盘路径推出。
 */
export function renderSiteOutputs(siteData, runtimeFacts, localeList = locales) {
  const pages = sitePages(siteData)
  return pages.flatMap(({ render, output }) => {
    const alternates = Object.fromEntries(localeList.map((locale) => {
      if (!output[locale]) throw new Error(`No output path for locale: ${locale}`)
      return [locale, routeFromOutputPath(output[locale])]
    }))
    return localeList.map((locale) => ({ relativePath: output[locale], route: alternates[locale], locale, alternates, contents: render(locale, runtimeFacts) }))
  })
}

const HOME_ROUTES = new Set(['/', '/en/'])
const SECOND_TIER_ROUTES = new Set(['/quickstart', '/en/quickstart'])
const LIBRARY_INDEX_ROUTES = new Set(['/features', '/en/features', '/models', '/en/models', '/prompts', '/en/prompts', '/skills', '/en/skills'])

/** sitemap 的 changefreq/priority：首页最高，库首页/上手次之，其余详情页最低——按路由形状分档，不逐页手写。 */
export function classifyRoute(route) {
  if (HOME_ROUTES.has(route)) return { changefreq: 'weekly', priority: '1.0' }
  if (SECOND_TIER_ROUTES.has(route)) return { changefreq: 'weekly', priority: '0.9' }
  if (LIBRARY_INDEX_ROUTES.has(route)) return { changefreq: 'weekly', priority: '0.8' }
  return { changefreq: 'monthly', priority: '0.6' }
}

/**
 * 算内容哈希前先抹掉每页 JSON-LD 里的 softwareVersion：它随每次发版变，不是页面内容的变化——
 * 不抹的话每发一次版，全站 lastmod 都刷成当天，这个信号对搜索引擎就没意义了。
 * 快速上手页上读者看得见的「最新版本」文字不抹：那是真实的内容变化。
 */
export const stripVolatileMetadata = (html) => html.replace(/"softwareVersion":"[^"]*"/g, '"softwareVersion":"-"')

/**
 * sitemap（与 SEO 巡检）要用的每页信息：全部真实路由 + 哈希驱动的 lastmod + changefreq/priority。
 * 纯函数（除了 render 本身）：同样的 siteData/runtimeFacts/previousDates/today 永远算出同样的结果，
 * 所以 build-marketing-sitemap.mjs 的 --check 能直接拿它跟磁盘上的文件比对，不用另外维护一套核对逻辑。
 */
export function computeSitemapEntries({ siteData, runtimeFacts, previousDates, today }) {
  const outputs = renderSiteOutputs(siteData, runtimeFacts)
  const hashByRoute = {}
  for (const item of outputs) hashByRoute[item.route] = contentHash(stripVolatileMetadata(item.contents))
  const dates = nextPageDates(previousDates, hashByRoute, today)
  const alternatesByRoute = new Map(outputs.map((item) => [item.route, item.alternates]))
  const routes = [...alternatesByRoute.keys()].sort()
  const entries = routes.map((routePath) => ({
    path: routePath,
    updatedAt: dates[routePath].date,
    ...classifyRoute(routePath),
    alternates: alternateLinks(alternatesByRoute.get(routePath)),
  }))
  return { dates, entries }
}
