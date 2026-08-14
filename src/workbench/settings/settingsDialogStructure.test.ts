import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const settingsSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/settings/SettingsDialog.tsx'), 'utf8')
const aiModelsSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/settings/AiModelsSection.tsx'), 'utf8')
const taskCenterSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/taskCenter/TaskCenterPanel.tsx'), 'utf8')
const studioSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/NomiStudioApp.tsx'), 'utf8')
const controllerSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/settings/useSettingsDialogController.ts'), 'utf8')

describe('settings dialog structure', () => {
  // 2026-08-12 由五 tab 扩到六 tab（用户拍板）。原五 tab 拍板为什么不再成立：
  // 定它那会儿「模型」= 几个 API key，塞进「AI 与模型」够用；现在多实例 ComfyUI + 自定义工作流
  // 已长成一个要整页的子系统。而原 ai tab 里的东西服务的是 MCP 代跑护栏（trustedHosts /
  // allowedProviders / maxSpend），不是「我的模型」——名不副实正是群里「改 api url 翻半天
  // 找不到」的根因，故拆出「模型」tab 并把原 tab 改名「AI 策略」。
  it('uses the approved six-tab information architecture', () => {
    for (const id of ["'file'", "'models'", "'ai'", "'automation'", "'general'", "'about'"]) {
      expect(settingsSource).toContain(`id: ${id}`)
    }
    // 模型的家 = 直接渲染既有 OnboardingDrawer，不为设置另写一份模型列表（P1 无并行实现）。
    expect(settingsSource).toContain('<OnboardingDrawer />')
    expect(settingsSource).toContain('<AiModelsSection')
    expect(settingsSource).toContain('<AutomationPermissionsSection')
    expect(settingsSource).toContain('sm:flex-row')
    expect(settingsSource).toContain('overflow-x-auto')
    expect(settingsSource).toContain("'production-policy'")
    expect(aiModelsSource).toContain('data-settings-field="hard-budget"')
  })

  it('keeps notification policy in settings instead of duplicating it in task center', () => {
    expect(taskCenterSource).not.toContain('PrefToggle')
    expect(taskCenterSource).not.toContain('writeTaskCenterPrefs')
    expect(settingsSource).toContain('automationPolicy')
  })

  it('keeps model management in one settings host', () => {
    expect(studioSource).not.toContain('OnboardingFloatingPanel')
    expect(studioSource).not.toContain('modelCatalogOpened')
    expect(controllerSource).toContain("window.addEventListener('nomi-open-model-catalog'")
    expect(controllerSource).toContain("openSettings({ tab: 'models' })")
    expect(settingsSource).toContain("onOpenModelCatalog={() => setTab('models')}")
  })
})
