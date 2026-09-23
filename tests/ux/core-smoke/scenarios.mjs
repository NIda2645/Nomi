// 核心流程冒烟的**唯一清单**（2026-09-22 用户拍板，docs/plan/2026-09-22-core-flow-smoke-three-defenses.md）。
//
// 为什么要它：09-22 main 上 composer 消失 / 「2 版」托盘打不开 / 编组框删不掉，CI 全绿——
// 那条走查写了却不在任何 CI 套件里，而画布套件只在改到 generationCanvas 时才跑。
// 这里列的场景：**每个非纯文档 PR 与每次 main push 都跑，两种夹具各一遍**，分类器不许降档。
//
// 登记规矩（照着就能加，详见方案「如何登记新场景」）：
//   { id, script, needs?: string[], cases?: string[], timeoutMs?: number }
//   - 没有「只在某种夹具跑」的开关：场景必须在 CORE_SMOKE_FIXTURES 的每一种下都成立。
//   - needs 只能写 tests/ux/core-smoke/needs.mjs 里登记过的键；写错 → 起进程前就红。
//   - cases 让一个场景带多例（每例一个进程，走查从 smoke.caseId 读自己跑哪一例）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CORE_SMOKE_FIXTURES } from '../../../scripts/validation-policy.mjs'
import { checkNeeds } from './needs.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/** CI 两遍。清单 owner 在分类器（CI matrix 与合后收据要的 check 名都从它派生），这里转出去给夹具与 runner 用。 */
export { CORE_SMOKE_FIXTURES }
/** 只在本机跑：深拷贝用户真实 profile，跑完删。不进 CI（CI 上没有用户资料）。 */
export const LOCAL_ONLY_FIXTURES = Object.freeze(['profile-copy'])

export const CORE_SMOKE_SCENARIOS = Object.freeze([
  // 空节点 composer / 参数条、「2 版」托盘切版与下载、编组框 Delete/Backspace/菜单删除 + ⌘Z；
  // 前面先做一遍八种手势（含平移松手 150ms 内点卡、滚轮平移档）确认 data-dragging 收干净。
  Object.freeze({ id: 'node-params-and-version-pill', script: 'tests/ux/node-params-and-version-pill.walk.mjs', needs: Object.freeze([]) }),
  // 平移 / 框选 / 滚轮缩放 / 拖节点浮层隐身 / 中键与空格平移 / 画布手势设置两档（含平移档松手即点）。
  Object.freeze({ id: 'canvas-drag-pan-gestures', script: 'tests/ux/canvas-drag-pan-gestures.walk.mjs', needs: Object.freeze([]) }),
  // 花钱路最小一条（2026-09-22 总合并登记）：agent 要花钱 → 面板出报价卡 → 确认扣一次、× 一个节点都不动。
  // 零付费：远端只有 loopback（零额度）。两例一个进程一次：confirm / cancel。
  Object.freeze({ id: 'spend-confirm', script: 'tests/ux/core-smoke-spend-confirm.walk.mjs', needs: Object.freeze(['loopbackProvider', 'fixtureTextModel', 'paidGenerationRoute']), cases: Object.freeze(['confirm', 'cancel']) }),
])

const ALLOWED_KEYS = new Set(['id', 'script', 'needs', 'cases', 'timeoutMs'])

/** 清单自检：结构、脚本存在、依赖认得、没有逐夹具跳过的后门。返回问题列表。 */
export function checkCoreSmokeScenarios(scenarios = CORE_SMOKE_SCENARIOS, { root = repoRoot } = {}) {
  const problems = []
  const ids = new Set()
  for (const scenario of scenarios) {
    const label = scenario?.id ?? JSON.stringify(scenario)
    for (const key of Object.keys(scenario ?? {})) {
      if (!ALLOWED_KEYS.has(key)) problems.push(`${label}：不认识的字段「${key}」（没有逐夹具跳过/禁用的开关）`)
    }
    if (typeof scenario?.id !== 'string' || !/^[a-z0-9-]+$/.test(scenario.id)) problems.push(`${label}：id 必须是小写短横线`)
    else if (ids.has(scenario.id)) problems.push(`${label}：id 重复`)
    else ids.add(scenario.id)
    if (typeof scenario?.script !== 'string' || !fs.existsSync(path.join(root, scenario.script))) {
      problems.push(`${label}：脚本 ${scenario?.script} 不存在`)
    }
    for (const problem of checkNeeds(scenario?.needs ?? [])) problems.push(`${label}：${problem}`)
    if (scenario?.cases !== undefined) {
      if (!Array.isArray(scenario.cases) || scenario.cases.length === 0) problems.push(`${label}：cases 要么不写，要么是非空数组`)
      else if (new Set(scenario.cases).size !== scenario.cases.length || scenario.cases.some((item) => !/^[a-z0-9-]+$/.test(String(item)))) {
        problems.push(`${label}：cases 必须是不重复的小写短横线 id`)
      }
    }
  }
  return problems
}

/** 夹具 × 场景 × 用例 展开成一次次运行（每次一个进程）。 */
export function expandCoreSmokeRuns(fixture, scenarios = CORE_SMOKE_SCENARIOS) {
  if (![...CORE_SMOKE_FIXTURES, ...LOCAL_ONLY_FIXTURES].includes(fixture)) {
    throw new Error(`未知夹具「${fixture}」，可选：${[...CORE_SMOKE_FIXTURES, ...LOCAL_ONLY_FIXTURES].join(', ')}`)
  }
  return scenarios.flatMap((scenario) => (scenario.cases ?? [null]).map((caseId) => ({
    id: caseId ? `${scenario.id}--${caseId}` : scenario.id,
    scenarioId: scenario.id,
    script: scenario.script,
    needs: [...(scenario.needs ?? [])],
    caseId,
    fixture,
    ...(scenario.timeoutMs ? { timeoutMs: scenario.timeoutMs } : {}),
  })))
}
