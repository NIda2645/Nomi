import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLocaleParity, locales, shared } from './marketing/content.mjs'
import { assertFeaturesParity, featurePages } from './marketing/features.mjs'
import { assertLibraryCopyParity } from './marketing/library/copy.mjs'
import { loadSiteData } from './marketing/library/data.mjs'
import { modelPages } from './marketing/library/models-pages.mjs'
import { promptPages } from './marketing/library/prompts-pages.mjs'
import { skillPages } from './marketing/library/skills-pages.mjs'
import { renderHomepage, renderQuickstart } from './marketing/template.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const runtimeFacts = Object.freeze({ ...shared, version: packageJson.version })
const checkOnly = process.argv.includes('--check')

assertLocaleParity()
assertLibraryCopyParity()
assertFeaturesParity()

// 生成物：首页、快速上手、三个库（数据来自 marketing/data/site-data.json），各一中一英。
const siteData = loadSiteData()
const pages = [
  { render: renderHomepage, output: { 'zh-CN': 'marketing/index.html', en: 'marketing/en/index.html' } },
  { render: renderQuickstart, output: { 'zh-CN': 'marketing/quickstart.html', en: 'marketing/en/quickstart.html' } },
  ...featurePages(),
  ...modelPages(siteData),
  ...promptPages(siteData),
  ...skillPages(siteData),
]

const outputs = pages.flatMap(({ render, output }) => locales.map((locale) => {
  const relativePath = output[locale]
  if (!relativePath) throw new Error(`No output path for locale: ${locale}`)
  return { relativePath, contents: render(locale, runtimeFacts) }
}))

if (checkOnly) {
  const stale = outputs
    .filter(({ relativePath, contents }) => {
      const target = path.join(root, relativePath)
      return !fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== contents
    })
    .map(({ relativePath }) => relativePath)
  if (stale.length) {
    console.error(`Marketing site output is stale:\n${stale.map((item) => `- ${item}`).join('\n')}`)
    process.exitCode = 1
  } else {
    console.log('MARKETING SITE CHECK PASS')
  }
} else {
  for (const { relativePath, contents } of outputs) {
    const target = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`)
    fs.writeFileSync(temporary, contents)
    fs.renameSync(temporary, target)
    console.log(`Generated ${relativePath}`)
  }
}
