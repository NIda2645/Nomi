// ComfyUI 接入面「预检不拦人」的结构保证（2026-08-11 用户要求，见 precheckGate.ts 顶注）。
//
// 光有 precheckGate 的单测不够——它只证「门槛函数本身非阻断」。真正的回归风险是**组件绕过它**：
// 有人图省事写回 disabled={!ready}，函数再对也没用（这正是 2026-08-11 之前的形态）。
// 所以这里直接对源码断言：ComfyUI 三个接入面必须经由 resolvePrecheckGateAction 决定按钮可点性，
// 且不得把 ready / 缺件 / serverReachable 直接接进 disabled。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { zhOnboardingProviders, enOnboardingProviders } from '../../i18n/locales/onboardingProviders'

const dir = path.dirname(fileURLToPath(import.meta.url))
const read = (file: string): string => fs.readFileSync(path.join(dir, file), 'utf8')
/** 只看真代码：注释里会引用旧写法讲为什么改（本文件的顶注就是），扫到它是误报。 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** 走预检门槛的 ComfyUI 接入面。 */
const GATED_SURFACES = ['ComfyuiPresetSection.tsx', 'ComfyuiTemplateLibrary.tsx'] as const

describe('ComfyUI 预检非阻断（缺件/未连接只提示，不拦）', () => {
  it.each(GATED_SURFACES)('%s 用共用门槛函数决定按钮，而不是自己写一套', (file) => {
    const source = read(file)
    expect(source).toContain('resolvePrecheckGateAction')
    // 二次确认两态都得渲染出来，否则 arm 之后用户看不到「再点一次」的出口。
    expect(source).toContain("gate === 'arm'")
    expect(source).toContain("gate === 'confirm'")
  })

  it.each(GATED_SURFACES)('%s 不把「预检没过」直接接进 disabled（这就是原来的死门）', (file) => {
    const source = stripComments(read(file))
    const disabledExprs = [...source.matchAll(/disabled=\{([^}]*)\}/g)].map((m) => m[1])
    expect(disabledExprs.length).toBeGreaterThan(0)
    for (const expr of disabledExprs) {
      // ready / missing* / serverReachable 出现在 disabled 里 = 缺件又变成硬拦。
      expect(expr).not.toMatch(/\bready\b|missing|serverReachable/i)
    }
    // 唯一允许的 disabled 判据是「结构上做不成」，且必须来自门槛函数的裁决。
    expect(source).toContain("disabled={gate === 'disabled'}")
  })

  it('缺件/未连接的风险话术在两种语言里都说清「会发生什么」，不是笼统一句可能失败', () => {
    for (const locale of [zhOnboardingProviders, enOnboardingProviders]) {
      for (const section of [locale.comfyPreset, locale.comfyTemplates] as Array<Record<string, string>>) {
        for (const key of ['riskMissing', 'riskOffline', 'enableAnyway', 'enableConfirm']) {
          expect(String(section[key] ?? '')).not.toBe('')
        }
        // 死门时代的话术留着就是骗人（按钮已经点得动了，文案还说「不给启用 / Blocked while…」）。
        expect(section.gateNote).not.toMatch(/不给启用|Blocked while/i)
      }
    }
  })
})
