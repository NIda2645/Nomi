// 「读目录失败不许静默置空」这条不变量的机器化持有者（批次 E，2026-09-21）。
//
// 用户报的那句「所有模型配置都没了」，最后一步就发生在渲染层的一个裸 catch 里：
// `catch { setVendorMeta(new Map()); setModels([]); setMappings([]) }`——三个列表全空、
// 一个字都不说，而盘上的文件一个字节都没少（根因 scratchpad rootcause-config-loss-on-reinstall.md §0）。
//
// 为什么是源码扫描而不是渲染测试：要证的是「**每一个**读目录的 hook 都不这么写」，这是对一组文件的
// 断言；渲染测试只能一个一个证，而漏掉的那个恰恰是没人想起来写测试的那个（本仓也没有 React hook
// 的渲染测试设施，加一个测试库不在这条 lane 的范围里）。
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 扫描范围：会同步读模型目录（vendors/models/mappings）并把结果放进 React state 的渲染层模块。
 * 新增一个这样的 hook 而忘了处理读失败，它会落进 found 里、不在 baseline 里，当场红。
 */
const SCANNED = [
  'src/ui/onboarding/useOnboardingDrawerCatalog.ts',
  'src/ui/onboarding/workflowPage/useWorkflowCatalog.ts',
  'src/workbench/settings/AiModelsSection.tsx',
  'src/workbench/ai/v4/useAgentPanelV4Data.ts',
]

/**
 * 存量登记（棘轮，只减不增）。**2026-09-22 归零**：原本登记的三处（`useWorkflowCatalog` /
 * `AiModelsSection` / `useAgentPanelV4Data`）已由渲染层 lane 各自改成「留住上一份数据 + 把错误
 * 交给界面」，合并进集成分支后扫描结果为空。按这条棘轮自己写的程序（「修好的请把那一行删掉，
 * 棘轮不留永久豁免」）把登记清空——留着就是一张永久豁免票。
 */
const REGISTERED_SILENT_RESETS: readonly string[] = []

/** catch 块里把 state 清空，且同一个块里没有任何「把错误说出去」的动作。 */
const EMPTY_RESET = /set[A-Z]\w*\(\s*(?:\[\]|new Map\(\)|\{\}|null)\s*\)/
const SURFACES_ERROR = /set\w*(?:Error|Failure|Status|ReadOnly|Notice|Message)\b|toast|logError|captureError/i

/**
 * 两种 catch 都要认：`try/catch {}` 和 promise 的 `.catch(() => {})`。
 * 只认前一种的话，`useAgentPanelV4Data` 那处（`.catch(() => { setModels([]) })`）会安静逃掉
 * ——而它正是同一个病。
 */
function catchBodies(source: string): string[] {
  const bodies: string[] = []
  const pattern = /(?:\.catch\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{|catch\s*(?:\([^)]*\))?\s*\{)/g
  for (const match of source.matchAll(pattern)) {
    let depth = 1
    let index = match.index + match[0].length
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1
      else if (source[index] === '}') depth -= 1
      index += 1
    }
    bodies.push(source.slice(match.index, index))
  }
  return bodies
}

function silentlyResets(file: string): boolean {
  const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  return catchBodies(source).some((body) => EMPTY_RESET.test(body) && !SURFACES_ERROR.test(body))
}

describe('a failed catalog read is never silently turned into an empty screen', () => {
  // 阳性对照：扫描器认不出任何一处时，下面的断言会「空集通过」，而空集通过和真通过长得一模一样。
  it('can actually recognise the shape it claims to scan for', () => {
    expect(catchBodies('try { a() } catch { setModels([]) }').some((body) => EMPTY_RESET.test(body))).toBe(true)
    expect(catchBodies('p.catch(() => { setModels([]) })').some((body) => EMPTY_RESET.test(body))).toBe(true)
    expect(catchBodies('try { a() } catch (e) { setError(e); setModels([]) }').some(
      (body) => EMPTY_RESET.test(body) && !SURFACES_ERROR.test(body),
    )).toBe(false)
    // 登记归零之后，「空集通过」的风险改由**扫描范围**来挡：扫的文件必须真的在盘上，
    // 否则 found 恒空而断言恒绿（路径打错、文件被改名都属于这一种）。
    for (const file of SCANNED) expect(fs.existsSync(path.join(process.cwd(), file)), `扫描范围里的 ${file} 不在盘上`).toBe(true)
  })

  it('keeps the model settings drawer out of the silent-reset list', () => {
    expect(
      silentlyResets('src/ui/onboarding/useOnboardingDrawerCatalog.ts'),
      '读目录失败时这个 hook 又把三个列表清空了：上一份已知数据必须留在屏幕上，错误必须交给 loadError / readOnly',
    ).toBe(false)
  })

  it('never grows a new silent reset, and drops the registration once one is fixed', () => {
    const found = SCANNED.filter(silentlyResets).sort()
    const registered = [...REGISTERED_SILENT_RESETS].sort()
    expect(
      found,
      '读配置失败 → 静默置空的写法只减不增：新增的请改成「留住上一份数据 + 把错误交给界面」，'
        + '修好的请把 REGISTERED_SILENT_RESETS 里那一行删掉（棘轮不留永久豁免）。',
    ).toEqual(registered)
  })
})
