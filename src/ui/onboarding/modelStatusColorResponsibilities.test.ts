import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const read = (file: string): string => fs.readFileSync(path.join(dir, file), 'utf8')

describe('模型设置颜色职责', () => {
  it('能力与启用态使用 Nomi accent，不把可用性冒充验证成功', () => {
    const home = read('ModelSettingsHome.tsx')
    expect(home).toContain("working: 'bg-nomi-accent'")
    expect(home).toContain("verified: 'bg-workbench-success'")
    expect(read('ModelChipGroups.tsx')).toContain("connected && m.enabled ? 'bg-nomi-accent'")
    expect(read('ModelChipGroups.tsx')).toContain('border-nomi-accent-soft bg-nomi-accent-soft')
    expect(read('CodexLocalImageCard.tsx')).toContain('bg-nomi-accent-soft')
    expect(read('ComfyuiTemplateLibrary.tsx')).toContain('text-micro text-nomi-accent bg-nomi-accent-soft')
    expect(read('ComfyuiPresetSection.tsx')).toContain('text-micro text-nomi-accent bg-nomi-accent-soft')
  })

  it('已连接摘要使用中性表面，只保留小号成功证据', () => {
    const foldable = read('FoldableModelCard.tsx')
    expect(foldable).toContain('bg-nomi-ink-10')
    expect(foldable).toContain("status === 'ok' ? 'bg-workbench-success'")
    expect(foldable).not.toContain('workbench-success-soft')

    const network = read('NetworkSection.tsx')
    expect(network).toContain("pill.ok ? 'bg-workbench-success'")
    expect(network).not.toContain("pill.ok\n              ? 'bg-[var(--workbench-success-soft)]")

    for (const file of ['ConnectAssistantCard.tsx', 'ComfyuiLocalCard.tsx', 'DreaminaMemberCard.tsx']) {
      expect(read(file)).toContain('rounded-nomi-sm bg-nomi-ink-05')
    }
  })

  it('真实测试与文件就绪结果继续使用 success green', () => {
    expect(read('OnboardingWizard.tsx')).toContain('testState === \'ok\'')
    expect(read('OnboardingWizard.tsx')).toContain('c="var(--workbench-success)"')
    expect(read('ComfyuiPresetSection.tsx')).toContain('text-workbench-success bg-[var(--workbench-success-soft)]')
    expect(read('ComfyuiPresetSection.tsx')).toContain('text-workbench-success shrink-0')
  })
})
