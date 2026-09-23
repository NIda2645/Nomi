// dispatcher 路由闭包 —— 「名单外 fail-open」的机器判据。
//
// 守的不变量：**没有验证过的项目会话或租约，任何路径都改不了用户的项目内容**。
// 历史上 `canvas.addNodes` / `canvas.connect` / `canvas.setPrompt` / `canvas.deleteNodes` 四个 case
// 不在 `PROJECT_SESSION_ONLY_METHODS` 里，也不取租约——2026-09-21 真机复现：一个只读到
// `<NOMI_CAPABILITY_DIR>/instance*.json` 的普通本机进程，拿裸 bearer 就能加节点、改别人的提示词、
// 连边、删节点（200，磁盘 `nodes=[]`，全程零个 undoToken），而同一件事走 `canvas.write`/`canvas.delete` 是 403。
//
// 四个 case 已删。这条测试钉的是**下一个**：dispatcher 再长出一个 case，不在两张表里点名就红；
// 走得到项目内容写执行点却不取租约，也红。
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  LOCAL_BEARER_ROUTE_REGISTER,
  PROJECT_CONTENT_MUTATORS,
  PROJECT_SESSION_ONLY_METHODS,
} from './localProjectSessionTransportPolicy'

const DISPATCHER = new URL('./dispatcher.ts', import.meta.url)

type DispatcherCase = { method: string; body: string }

/** dispatcher 的 switch 分支是字面量 case（无反射、无按名字查表），所以可以机械枚举。 */
function readDispatcherCases(): DispatcherCase[] {
  const lines = fs.readFileSync(DISPATCHER, 'utf8').split('\n')
  const heads: { index: number; method: string }[] = []
  lines.forEach((line, index) => {
    const matched = /^ {4}case '([^']+)':/.exec(line)
    if (matched) heads.push({ index, method: matched[1] })
  })
  return heads.map((head, position) => ({
    method: head.method,
    body: lines.slice(head.index, heads[position + 1]?.index ?? lines.length).join('\n'),
  }))
}

describe('dispatcher 路由闭包（名单外不许 fail-open）', () => {
  const cases = readDispatcherCases()

  it('枚举得到 case（枚举本身失效时先红，不给后面的断言留空跑的机会）', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20)
    expect(cases.map((entry) => entry.method)).toContain('canvas.write')
  })

  it('每一个 case 都被点名：要么进会话名单，要么进裸 bearer 登记表', () => {
    const unclassified = cases
      .map((entry) => entry.method)
      .filter((method) => !PROJECT_SESSION_ONLY_METHODS.has(method) && !(method in LOCAL_BEARER_ROUTE_REGISTER))
    expect(unclassified).toEqual([])
  })

  it('同一个 case 不许同时出现在两张表里（两份判词 = 又一个名单外）', () => {
    const both = cases
      .map((entry) => entry.method)
      .filter((method) => PROJECT_SESSION_ONLY_METHODS.has(method) && method in LOCAL_BEARER_ROUTE_REGISTER)
    expect(both).toEqual([])
  })

  it('登记表里没有陈旧行（登记了一个已经不存在的 case = 判词没人核）', () => {
    const methods = new Set(cases.map((entry) => entry.method))
    expect(Object.keys(LOCAL_BEARER_ROUTE_REGISTER).filter((method) => !methods.has(method))).toEqual([])
  })

  it('每条登记都写了「靠什么把关」，不许空判词', () => {
    expect(Object.entries(LOCAL_BEARER_ROUTE_REGISTER).filter(([, reason]) => reason.trim().length < 4)).toEqual([])
  })

  it('写项目内容的 case 必须取租约（legacy 四扇门就是死在这一条上）', () => {
    const offenders = cases
      .filter((entry) => PROJECT_CONTENT_MUTATORS.some((symbol) => new RegExp(`\\b${symbol}\\(`).test(entry.body)))
      .filter((entry) => !entry.body.includes('leasedProject('))
      .map((entry) => entry.method)
    expect(offenders).toEqual([])
  })

  it('四个 legacy 画布 case 不许长回来（P1：没有并行版）', () => {
    const methods = cases.map((entry) => entry.method)
    for (const legacy of ['canvas.addNodes', 'canvas.connect', 'canvas.setPrompt', 'canvas.deleteNodes']) {
      expect(methods).not.toContain(legacy)
    }
  })
})
