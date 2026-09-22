// 核心冒烟场景的「环境依赖」登记表（单一 owner）。
//
// 场景在 CORE_SMOKE_SCENARIOS 里用 `needs: [...]` 声明自己要什么环境；夹具在**每一种夹具**下
// 按这里的 provisioner 把它们准备好。写了这里没有的键 → runner 起进程之前就报「缺依赖」而红，
// 不静默跳过（跳过就是「登记即放绿」，R17）。
//
// 加一条依赖：在 CORE_SMOKE_NEEDS 里加一项（requires 写它依赖的别的键），并在
// tests/ux/core-smoke/core-smoke.test.mjs 里补一条它真的把环境准备好的断言。
import fs from 'node:fs'
import path from 'node:path'

import { createAgentRuntimeFixture, FIXTURE_TEXT_MODEL, FIXTURE_VENDOR } from '../agent-runtime-fixture.mjs'

/**
 * provision({ repoRoot, settingsDir, handles }) → { handle, localStorage?, close? }
 * - handle：交给走查用的句柄（smoke.needs.<id>）
 * - localStorage：App 自己的本机偏好键（经 launchNomiApp 的 initialLocalStorage 写进首个文档之前）
 * - close：走查结束时释放（服务器、端口）
 */
export const CORE_SMOKE_NEEDS = Object.freeze({
  // 零额度的 loopback 供应商：真 HTTP 服务器 + 写进隔离 settings 的模型目录（agent-runtime-fixture.mjs）。
  loopbackProvider: Object.freeze({
    requires: Object.freeze([]),
    async provision({ repoRoot, settingsDir }) {
      // profile-copy 夹具里 settings 是用户真实资料的**拷贝**，已经有目录文件；
      // fixture 以 wx 写入（绝不覆盖），所以先把拷贝里那份挪开——原库从来不被碰到。
      const catalog = path.join(settingsDir, 'model-catalog.json')
      if (fs.existsSync(catalog)) fs.renameSync(catalog, path.join(settingsDir, 'model-catalog.profile-copy-original.json'))
      const fixture = await createAgentRuntimeFixture({ rootDir: repoRoot, settingsDir })
      return { handle: fixture, close: () => fixture.close() }
    },
  }),
  // Agent 默认文本模型 = fixture 文本模型（App 自己的偏好键 nomi.assistantModel，见 src/workbench/ai/assistantModelPref.ts）。
  fixtureTextModel: Object.freeze({
    requires: Object.freeze(['loopbackProvider']),
    async provision({ handles }) {
      const value = { vendorKey: FIXTURE_VENDOR, modelKey: FIXTURE_TEXT_MODEL }
      return { handle: { ...value, loopback: handles.loopbackProvider }, localStorage: { 'nomi.assistantModel': JSON.stringify(value) } }
    },
  }),
})

/** 声明是否都认得、依赖是否写全。返回问题列表（空 = 合法）。 */
export function checkNeeds(needs, registry = CORE_SMOKE_NEEDS) {
  const problems = []
  if (!Array.isArray(needs)) return ['needs 必须是数组']
  for (const id of needs) {
    const entry = registry[id]
    if (!entry) {
      problems.push(`缺依赖：「${id}」没有 provisioner（已登记：${Object.keys(registry).join(', ')}）`)
      continue
    }
    for (const required of entry.requires) {
      if (!needs.includes(required)) problems.push(`缺依赖：「${id}」需要「${required}」，场景没声明`)
    }
  }
  if (new Set(needs).size !== needs.length) problems.push(`needs 有重复：${needs.join(', ')}`)
  return problems
}

/** 按依赖顺序准备。任何一步失败都先释放已准备的，再把错误抛出去（让走查红）。 */
export async function provisionNeeds(needs, { repoRoot, settingsDir, registry = CORE_SMOKE_NEEDS }) {
  const problems = checkNeeds(needs, registry)
  if (problems.length) throw new Error(problems.join('\n'))
  const ordered = []
  const visit = (id) => {
    if (ordered.includes(id)) return
    for (const required of registry[id].requires) visit(required)
    ordered.push(id)
  }
  for (const id of needs) visit(id)
  const handles = {}
  const localStorage = {}
  const closers = []
  try {
    for (const id of ordered) {
      const result = await registry[id].provision({ repoRoot, settingsDir, handles })
      handles[id] = result.handle
      Object.assign(localStorage, result.localStorage ?? {})
      if (result.close) closers.push(result.close)
    }
  } catch (error) {
    for (const close of closers.reverse()) await Promise.resolve(close()).catch(() => undefined)
    throw error
  }
  return {
    handles,
    localStorage,
    close: async () => {
      for (const close of closers.reverse()) await Promise.resolve(close()).catch(() => undefined)
    },
  }
}
