// 三个库的数据读取与选择规则。数据只有一个来源：scripts/site/export-site-data.mts 导出的
// marketing/data/site-data.json（它读 App 的模型身份、模型档案、技能加载器与提示词来源）。
// 这里只决定「官网展示哪些、按什么顺序、地址是什么」——不改写任何事实。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { editorialFileName, parseEditorial } from './editorial.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const DATA_FILE = path.join(root, 'marketing/data/site-data.json')
const EDITORIAL_DIR = path.join(root, 'marketing/content/models')

export function loadSiteData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
}

/**
 * 目录里哪些模型有资格上官网：认得的（有档案）、没退役、至少有一家能用 API Key 接。
 * 即梦会员、本地 ComfyUI、Codex 登录额度这类本地桥接是「渠道」不是模型，不单独成页。
 * 这条资格只有这一处定义：页面生成（publicModels）、介绍门岗和每周同步的「缺介绍」清单都读它。
 */
export function catalogEligibleModels(data) {
  return data.models.filter((model) => model.recognized && model.lifecycle !== 'legacy' && model.vendors.some((vendor) => vendor.authType !== 'none'))
}

/**
 * 官网列哪些模型：有资格上官网，而且**中英两份介绍都写好了**。
 * 没写介绍的新模型不上官网（方案 §4 / §12）：每周同步把它们列进「缺介绍」清单，写好再上。
 */
export function publicModels(data) {
  const tierOrder = { flagship: 0, value: 1, companion: 2 }
  return catalogEligibleModels(data)
    .filter((model) => modelEditorial(model.slug, 'zh-CN') && modelEditorial(model.slug, 'en'))
    .map((model, index) => ({ model, index }))
    .sort((left, right) => (tierOrder[left.model.lifecycle] ?? 3) - (tierOrder[right.model.lifecycle] ?? 3) || left.index - right.index)
    .map(({ model }) => model)
}

/** 人写的模型介绍：`marketing/content/models/<slug>.<zh-CN|en>.md`。没写的模型不出详情页（方案 §4）。格式见 editorial.mjs。 */
export function modelEditorial(slug, locale) {
  const file = path.join(EDITORIAL_DIR, editorialFileName(slug, locale))
  if (!fs.existsSync(file)) return null
  return parseEditorial(fs.readFileSync(file, 'utf8'), path.relative(root, file))
}

/** 分组展示顺序（只管顺序，不管分组本身——分组来自 SKILL.md 的 library.group）。 */
const GROUP_ORDER = {
  effect: ['camera', 'composition', 'character', 'scene', 'storyboard', 'editing', 'natural-texture'],
  skill: ['directing', 'writing', 'advertising', 'character-and-scene', 'workflow'],
}

/** 某一类（effect / skill）按分组排好：[{ id, label: {zh-CN,en}, items }]。数据里出现了顺序表没有的分组就报错，不许悄悄掉。 */
export function libraryGroups(data, kind) {
  const items = data.library.filter((item) => item.kind === kind)
  const order = GROUP_ORDER[kind]
  const unknown = [...new Set(items.map((item) => item.groupId))].filter((id) => !order.includes(id))
  if (unknown.length) throw new Error(`官网不认识的${kind}分组：${unknown.join(', ')}（加进 library/data.mjs 的 GROUP_ORDER）`)
  return order
    .map((id) => {
      const groupItems = items.filter((item) => item.groupId === id)
      return groupItems.length ? { id, label: groupItems[0].group, items: groupItems } : null
    })
    .filter(Boolean)
}

/** 公开合集：只有 Nomi 安装包里带了提示词的合集才出页；在线拉取的合集只在库首页列卡片。 */
export function collectionsWithPages(data) {
  return data.collections.filter((collection) => collection.prompts.length > 0)
}

export const libraryPaths = {
  models: '/models',
  model: (slug) => `/models/${slug}`,
  prompts: '/prompts',
  effectGroup: (groupId) => `/prompts/${groupId}`,
  expressions: '/prompts/expressions',
  collection: (id) => `/prompts/collections/${id}`,
  skills: '/skills',
  skill: (name) => `/skills/${name}`,
}
