// 结构不变量：**有状态**的模型选择器必须渲染第二段（供应商）——否则用户选不了「走哪家」。
//
// 起因（2026-08-18 用户报「框选没办法选择不同供应商的模型 导致一直生成失败」）：
// CanvasSelectionToolbar 调 useDedupedModelSelect 时把当前值写死成 ''，于是 hook 内的 selectedModel
// 恒为 null → providerOptions 恒为 []，供应商那一段**结构上不可能出现**。UI 看着好好的、类型全对、
// 七道门岗全绿，但供应商被 pickHealthiestProvider 替用户定死一家；那家在他账号上不通 = 每次都失败。
//
// 这是「语法对、语义错」的一类：光看单文件看不出来，只有把「谁用了这个 hook」摆一起才看得见。
// 故用源码结构断言钉住它——第 5 个调用点再犯同样的错，这条会红。
//
// 两条出路，各自合法：
//   A. 有状态选择器（节点参数条/镜卡）→ 用 useDedupedModelSelect，且必须渲染 onProviderPick 那一段。
//   B. 一次性批量命令（无常驻值）→ 根本不该用这个 hook，改用 BulkModelPicker（选项自带厂商，一家一行）。
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = path.join(process.cwd(), 'src')
const HOOK_NAME = 'useDedupedModelSelect'
const HOOK_FILE = path.join(SRC_ROOT, 'workbench/common/useDedupedModelSelect.ts')

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

/** 真正 import 了这个 hook 的源文件（排除 hook 自身与测试）。 */
function filesImportingHook(): string[] {
  return listSourceFiles(SRC_ROOT).filter((file) => {
    if (path.resolve(file) === path.resolve(HOOK_FILE)) return false
    const source = fs.readFileSync(file, 'utf8')
    return new RegExp(`import\\s*\\{[^}]*\\b${HOOK_NAME}\\b[^}]*\\}\\s*from`).test(source)
  })
}

describe('model select structure — 选了模型就必须选得了供应商', () => {
  it('每个用 useDedupedModelSelect 的文件都渲染了供应商那一段（onProviderPick）', () => {
    const offenders = filesImportingHook().filter(
      (file) => !fs.readFileSync(file, 'utf8').includes('onProviderPick'),
    )

    expect(
      offenders.map((file) => path.relative(process.cwd(), file)),
      [
        '不变量：useDedupedModelSelect 是**两段式**选择器——第二段（供应商）不渲染，',
        '用户就锁不了「走哪家」，供应商只能由 pickHealthiestProvider 定死一家；',
        '那家在用户账号上不通就每次生成都失败、且界面上无路可换',
        '（2026-08-18 用户实报：「框选没办法选择不同供应商的模型 导致一直生成失败」）。',
        '',
        '上面这些文件 import 了该 hook 却没有引用 onProviderPick。两条出路：',
        '  A. 它是有状态选择器（节点/镜卡，有常驻当前值）→ 补上供应商那一段 NomiSelect；',
        '  B. 它是一次性批量命令（无常驻值，如「统一模型」）→ 别用这个 hook，',
        '     改用 src/workbench/common/BulkModelPicker.tsx（选项按供应商摊平，一家一行）。',
      ].join('\n'),
    ).toEqual([])
  })

  it('批量选模型只有一份实现：两个批量调用点都走 BulkModelPicker，不各写各的', () => {
    const bulkCallSites = [
      'src/workbench/generationCanvas/components/CanvasSelectionToolbar.tsx',
      'src/workbench/creation/storyboard/StoryboardBulkBar.tsx',
    ]
    for (const relative of bulkCallSites) {
      const source = fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
      expect(source, `${relative} 应使用共享的 BulkModelPicker`).toContain('BulkModelPicker')
      // P1 无并行版：批量调用点不许再自己调那个两段式 hook（调了就又会退化成「选不了家」）。
      expect(source, `${relative} 不该再直接用 ${HOOK_NAME}`).not.toContain(HOOK_NAME)
    }
  })

  it('BulkModelPicker 选中后把 vendor 一起交出去（只写 modelKey 就等于没修）', () => {
    const picker = fs.readFileSync(path.join(SRC_ROOT, 'workbench/common/BulkModelPicker.tsx'), 'utf8')
    expect(picker).toContain('resolveProviderByAddress')
    expect(picker).toContain('onPick(provider.option.value, provider.vendor)')

    const toolbar = fs.readFileSync(
      path.join(SRC_ROOT, 'workbench/generationCanvas/components/CanvasSelectionToolbar.tsx'),
      'utf8',
    )
    expect(toolbar).toContain('onApplyModel({ executionKind: group.executionKind, value, vendor')
  })
})
