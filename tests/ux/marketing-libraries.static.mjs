import fs from 'node:fs'
import path from 'node:path'
import { contentByLocale } from '../../scripts/marketing/content.mjs'
import { rootFromArgs } from '../../scripts/marketing/html-scan.mjs'
import { libraryCopyByLocale } from '../../scripts/marketing/library/copy.mjs'

// 官网三个库（模型库、提示词库、技能库）的静态合同：对样本页断言读者要看到的关键零件都在，中英两种语言各查一遍。
// 全站每一页的链接、hreflang、结构化数据、描述长度、署名由 check-site-* 门岗按页扫；这里钉的是「样张里承诺的那几样东西」：
// 模型库有卡片、模型页有档案卡、效果页有复制按钮、非 AGPL 条目带署名和许可证全文、面包屑、顶栏六项。
// 方案：docs/plan/2026-09-28-site-libraries-seo.md §3、§5、§8；样张逐项对账见 PR 正文。

// `--root <目录>` 指向另一份官网副本（证明这份合同会红时用），默认是仓库根。
const root = rootFromArgs()
const read = (relativePath) => {
  const file = path.join(root, relativePath)
  if (!fs.existsSync(file)) throw new Error(`MARKETING LIBRARIES FAIL: sample page is missing: ${relativePath}`)
  return fs.readFileSync(file, 'utf8')
}
const expect = (value, message) => {
  if (!value) throw new Error(`MARKETING LIBRARIES FAIL: ${message}`)
}
const count = (html, pattern) => (html.match(pattern) || []).length
const countFiles = (directory) => fs.readdirSync(path.join(root, directory)).filter((name) => name.endsWith('.html')).length
const prefixOf = (locale) => (locale === 'zh-CN' ? 'marketing' : 'marketing/en')
const homeOf = (locale) => (locale === 'zh-CN' ? '/' : '/en/')
const routeOf = (locale, route) => (locale === 'zh-CN' ? route : `/en${route}`)
const anchorsIn = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({ href: /href="([^"]*)"/.exec(match[1])?.[1] ?? '', current: /aria-current="page"/.test(match[1]), text: match[2].replace(/<[^>]+>/g, '').trim() }))

const SAMPLE = {
  modelIndex: { path: 'models', key: 'models' },
  model: { path: 'models/kling-3-0', key: 'models', section: 'video' },
  promptIndex: { path: 'prompts', key: 'prompts' },
  effect: { path: 'prompts/camera', key: 'prompts' },
  expressions: { path: 'prompts/expressions', key: 'prompts' },
  skillIndex: { path: 'skills', key: 'skills' },
  method: { path: 'skills/director-cinematography', key: 'skills' }, // AGPL-3.0-only：Nomi 自己的技能
  recipe: { path: 'skills/curated-product-exploded-view', key: 'skills' }, // CC-BY-4.0：来自开源仓库的配方
}
const pageOf = (locale, sample) => read(`${prefixOf(locale)}/${sample.path}.html`)

for (const locale of ['zh-CN', 'en']) {
  const tag = locale === 'zh-CN' ? '中文' : '英文'
  const content = contentByLocale[locale]
  const copy = libraryCopyByLocale[locale]
  const prefix = prefixOf(locale)

  // ---- 顶栏六项：所有库页共用一份顶栏，顺序固定，当前页高亮 ----
  for (const [name, sample] of Object.entries(SAMPLE)) {
    const html = pageOf(locale, sample)
    const nav = /<div class="nav-links" id="nav-links">([\s\S]*?)<\/div>/.exec(html)?.[1]
    expect(nav, `${tag} ${name}: top bar exists`)
    const links = anchorsIn(nav)
    expect(links.length === 6, `${tag} ${name}: top bar has exactly six items (found ${links.length})`)
    const expectedHrefs = ['/features', '/models', '/prompts', '/skills', '/quickstart', `${homeOf(locale)}#community`].map((href, index) => (index < 5 ? routeOf(locale, href) : href))
    const expectedLabels = ['features', 'models', 'prompts', 'skills', 'quickstart', 'community'].map((key) => content.nav[key])
    expect(JSON.stringify(links.map((link) => link.href)) === JSON.stringify(expectedHrefs), `${tag} ${name}: top bar links are ${expectedHrefs.join(' ')} (found ${links.map((link) => link.href).join(' ')})`)
    expect(JSON.stringify(links.map((link) => link.text)) === JSON.stringify(expectedLabels), `${tag} ${name}: top bar labels are ${expectedLabels.join(' / ')} (found ${links.map((link) => link.text).join(' / ')})`)
    const current = links.filter((link) => link.current)
    expect(current.length === 1 && current[0].text === content.nav[sample.key], `${tag} ${name}: exactly the ${sample.key} item is highlighted`)
    expect(!/href="\/open"|开源<\/a>\s*<a href="[^"]*#community/.test(nav), `${tag} ${name}: the open-source link moved out of the top bar`)
  }

  // ---- 面包屑：库首页以外的页面都有，最后一项是本页且不带链接，结构化数据里是同一份 ----
  for (const [name, sample, depth] of [['model', SAMPLE.model, 4], ['effect', SAMPLE.effect, 3], ['expressions', SAMPLE.expressions, 3], ['method', SAMPLE.method, 4], ['recipe', SAMPLE.recipe, 4], ['modelIndex', SAMPLE.modelIndex, 2], ['skillIndex', SAMPLE.skillIndex, 2]]) {
    const html = pageOf(locale, sample)
    const crumbs = /<nav class="crumbs" aria-label="breadcrumb"><ol>([\s\S]*?)<\/ol><\/nav>/.exec(html)?.[1]
    expect(crumbs, `${tag} ${name}: breadcrumb exists`)
    const items = [...crumbs.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => match[1])
    expect(items.length === depth, `${tag} ${name}: breadcrumb has ${depth} levels (found ${items.length})`)
    expect(items[0].includes(`href="${homeOf(locale)}"`) && items[0].includes(copy.crumbHome), `${tag} ${name}: first crumb is Home`)
    expect(/^<span aria-current="page">[^<]+<\/span>$/.test(items.at(-1)), `${tag} ${name}: last crumb is the page itself, not a link`)
    const listed = /"@type":"BreadcrumbList"[\s\S]*?"itemListElement":(\[[\s\S]*?\])(?:,"|\})/.exec(html)
    expect(listed && count(listed[1], /"@type":"ListItem"/g) === depth, `${tag} ${name}: the structured data breadcrumb has the same ${depth} levels`)
  }

  // ---- 模型库首页：有卡片，数量跟模型页一一对应，卡片都带可点的链接 ----
  const modelIndex = pageOf(locale, SAMPLE.modelIndex)
  const cards = count(modelIndex, /<article class="lib-card linked">/g)
  const modelPages = countFiles(`${prefix}/models`)
  expect(cards > 0, `${tag} model library has cards`)
  expect(cards === modelPages, `${tag} model library lists exactly the models that have a page (${cards} cards, ${modelPages} pages)`)
  expect(count(modelIndex, /<article class="lib-card">/g) === 0, `${tag} model library has no empty, unlinked cards (only models with an intro are listed)`)
  expect(count(modelIndex, /<section class="block lib-section" id="(?:video|image)"/g) === 2, `${tag} model library has the video and image sections`)
  expect(count(modelIndex, /<nav class="group-anchors"/g) === 1, `${tag} model library has the group anchor strip`)

  // ---- 单个模型页：档案卡有行（能做、参考素材……哪几家能接），出处是外链，写了核对日期 ----
  const model = pageOf(locale, SAMPLE.model)
  const specCard = /<aside class="spec-card"[\s\S]*?<\/aside>/.exec(model)?.[0]
  expect(specCard, `${tag} model page has the capability card`)
  const rowLabels = [...specCard.matchAll(/<div><dt>([^<]+)<\/dt>/g)].map((match) => match[1])
  expect(rowLabels.length >= 4, `${tag} capability card has rows (found ${rowLabels.length})`)
  expect(rowLabels[0] === copy.model.rows.can, `${tag} capability card starts with "${copy.model.rows.can}"`)
  expect(rowLabels.at(-1) === copy.model.rows.vendors, `${tag} capability card ends with "${copy.model.rows.vendors}" (which providers can connect it)`)
  expect(count(specCard, /<dd>(?:<span>[^<]+<\/span>)+<\/dd>/g) === rowLabels.length, `${tag} every capability row has at least one value`)
  expect(specCard.includes('class="spec-note"'), `${tag} capability card carries the note that capabilities are combined across providers`)
  const sources = /<ul class="source-list">([\s\S]*?)<\/ul>/.exec(model)?.[1] ?? ''
  expect(count(sources, /<a href="https?:\/\/[^"]+" target="_blank" rel="noreferrer">/g) >= 1, `${tag} model page lists at least one official source link`)
  expect(model.includes('class="model-dates"') && model.includes(copy.model.checked), `${tag} model page shows when the intro was last checked`)
  expect(count(model, /<h2 id="[^"]+">/g) >= 6, `${tag} model page has the four intro sections plus how-to and sources`)
  expect(model.includes('data-download-nomi'), `${tag} model page leads to the download`)

  // ---- 效果页：每条都有复制按钮，复制的目标在页面上真有；MIT 来源带署名、许可证和全文 ----
  const effect = pageOf(locale, SAMPLE.effect)
  const entries = count(effect, /<article class="effect-entry" id="[^"]+">/g)
  const buttons = [...effect.matchAll(/<button class="copy-button" type="button" data-copy="([^"]+)">/g)].map((match) => match[1])
  expect(entries > 0 && buttons.length === entries, `${tag} effect page has one copy button per entry (${buttons.length} buttons, ${entries} entries)`)
  for (const target of buttons) expect(effect.includes(`<pre class="prompt-text" id="${target}">`), `${tag} copy button targets an existing prompt block: ${target}`)
  expect(effect.includes(`<span class="copy-idle">${copy.copy}</span><span class="copy-done">${copy.copied}</span>`), `${tag} copy button has its idle and done labels`)
  expect(effect.includes('<mark class="slot">'), `${tag} effect page highlights the {slots} to fill in`)
  const attribution = /<aside class="attribution"[\s\S]*?<\/aside>/.exec(effect)?.[0] ?? ''
  expect(attribution.includes('<dd>MIT</dd>'), `${tag} MIT effect page names its license`)
  expect(attribution.includes('https://github.com/jnMetaCode/ai-shortfilm-prompts/'), `${tag} MIT effect page links the upstream repository`)
  expect(attribution.includes('jnMetaCode'), `${tag} MIT effect page credits the author`)
  expect(attribution.includes('<details class="license-text">') && attribution.includes('MIT License'), `${tag} MIT effect page carries the full license text`)

  // ---- 配方类技能（CC-BY-4.0）：署名、许可证、全文、可复制的配方块；Nomi 自己的技能（AGPL）不重复许可证全文 ----
  const recipe = pageOf(locale, SAMPLE.recipe)
  const recipeAttribution = /<aside class="attribution"[\s\S]*?<\/aside>/.exec(recipe)?.[0] ?? ''
  expect(recipeAttribution.includes('<dd>CC-BY-4.0</dd>') && recipeAttribution.includes('LichAmnesia'), `${tag} CC-BY recipe credits its author and license`)
  expect(recipeAttribution.includes('<details class="license-text">') && recipeAttribution.includes('Creative Commons Attribution 4.0'), `${tag} CC-BY recipe carries the full license text`)
  expect(recipe.includes('<button class="copy-button" type="button" data-copy="recipe-text">') && recipe.includes('<pre class="prompt-text" id="recipe-text">'), `${tag} recipe section is a copyable prompt block`)
  const method = pageOf(locale, SAMPLE.method)
  const methodAttribution = /<aside class="attribution"[\s\S]*?<\/aside>/.exec(method)?.[0] ?? ''
  expect(methodAttribution.includes('<dd>AGPL-3.0-only</dd>') && !methodAttribution.includes('license-text'), `${tag} Nomi's own skill names AGPL-3.0-only without repeating the license text`)
  expect(method.includes('class="toc"'), `${tag} method skill page has its table of contents`)
  expect(count(method, /<div class="use-box">/g) === 2, `${tag} skill page explains how to use it in Nomi and elsewhere`)

  // ---- 提示词库与技能库首页 ----
  const promptIndex = pageOf(locale, SAMPLE.promptIndex)
  expect(count(promptIndex, /<section class="block lib-section" id="(?:effects|expressions|collections)"/g) === 3, `${tag} prompt library has effects, expression presets and open-source collections`)
  const collectionCards = count(promptIndex.slice(promptIndex.indexOf('id="collections"')), /<article class="lib-card/g)
  expect(collectionCards === 6, `${tag} prompt library lists the six open-source collections (found ${collectionCards})`)
  expect(count(pageOf(locale, SAMPLE.skillIndex), /<article class="lib-card linked">/g) === countFiles(`${prefix}/skills`), `${tag} skill library has one linked card per skill page`)
  const expressions = pageOf(locale, SAMPLE.expressions)
  expect(count(expressions, /<button class="copy-button"/g) === count(expressions, /<article class="effect-entry"/g), `${tag} every expression preset can be copied`)

  // ---- 页脚：三个库、功能、上手的入口都在 ----
  const footer = /<nav class="footer-links"[\s\S]*?<\/nav>/.exec(model)?.[0] ?? ''
  for (const route of ['/features', '/models', '/prompts', '/skills', '/quickstart']) expect(footer.includes(`href="${routeOf(locale, route)}"`), `${tag} footer links ${route}`)
}

console.log('MARKETING LIBRARIES STATIC PASS')
