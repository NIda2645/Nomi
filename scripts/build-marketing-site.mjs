import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLocaleParity, shared } from './marketing/content.mjs'
import { assertFeaturesParity } from './marketing/features.mjs'
import { assertLibraryCopyParity } from './marketing/library/copy.mjs'
import { loadSiteData } from './marketing/library/data.mjs'
import { renderSiteOutputs } from './marketing/pages.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const runtimeFacts = Object.freeze({ ...shared, version: packageJson.version })
const checkOnly = process.argv.includes('--check')

assertLocaleParity()
assertLibraryCopyParity()
assertFeaturesParity()

// 生成物：首页、快速上手、三个库（数据来自 marketing/data/site-data.json），各一中一英。
// 「官网有哪些页面」只有一份 owner：marketing/pages.mjs 的 sitePages()（站点地图也读它，见 build-marketing-sitemap.mjs）。
const siteData = loadSiteData()
const outputs = renderSiteOutputs(siteData, runtimeFacts)

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
