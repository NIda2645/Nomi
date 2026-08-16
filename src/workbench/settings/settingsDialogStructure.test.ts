import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const settingsSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/settings/SettingsDialog.tsx'), 'utf8')
const aiModelsSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/settings/AiModelsSection.tsx'), 'utf8')
const taskCenterSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/taskCenter/TaskCenterPanel.tsx'), 'utf8')
const studioSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/NomiStudioApp.tsx'), 'utf8')
const controllerSource = fs.readFileSync(path.join(process.cwd(), 'src/workbench/settings/useSettingsDialogController.ts'), 'utf8')
const settingsDirectory = path.join(process.cwd(), 'src/workbench/settings')

const MAIN_NON_MODEL_SECTION_SHA256 = {
  'ProjectLocationSection.tsx': 'ad37c2f07c403b60cf42385f4d93fce8e2ff494c934467c670a7ae4b8c8d5523',
  'AiModelsSection.tsx': '0d0e65d5000222a5f02a8408ba12a1fc6c652ccb880d4c5ae68ca5172518e957',
  'AutomationPermissionsSection.tsx': 'a0ea704afb1a31c33ffa3e00821658d8696cc15d5069e6361032b194e638b352',
  'CanvasGestureSection.tsx': '51c9806c303e5a02a09c9184a38835b4d2d8cad3cd6bb3f56a2408c96264c571',
  'AboutSection.tsx': '11cef90c261d43a70653a25c91e0401df8c09c27cd0555b8ab561cbeeb44419e',
} as const

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
    expect(settingsSource).toContain('data-settings-tab-id={id}')
    expect(settingsSource).toContain('active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2')
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
    expect(settingsSource).toContain("onOpenModelCatalog={() => selectTab('models')}")
  })

  it('keeps the origin/main frame and sidebar for every settings tab', () => {
    expect(settingsSource).toContain('data-settings-dialog')
    expect(settingsSource).toContain('data-settings-tab={tab}')
    expect(settingsSource).toContain('className="fixed inset-0 flex items-center justify-center bg-black/45 p-2 sm:p-6"')
    expect(settingsSource).toContain('max-w-[760px]')
    expect(settingsSource).toContain('sm:h-[min(560px,calc(100svh-48px))]')
    expect(settingsSource).toContain('sm:w-[196px]')
    expect(settingsSource).not.toContain('sm:max-w-[900px]')
    expect(settingsSource).not.toContain('sm:h-[min(540px')
    expect(settingsSource).not.toContain('sm:w-[184px]')
  })

  it('keeps main padding and single-column content outside the unpadded model workspace', () => {
    expect(settingsSource).toContain('data-settings-content')
    expect(settingsSource).toContain('data-settings-model-workspace')
    expect(settingsSource).toContain("tab === 'models' ? 'overflow-hidden p-0' : 'overflow-y-auto p-4 sm:p-6'")
    expect(settingsSource).toContain('flex h-full min-h-0 flex-col overflow-hidden')
    expect(settingsSource).not.toContain('data-settings-page-grid')
    expect(settingsSource).not.toContain('SETTINGS_TWO_COLUMN_GRID_CLASS')
    expect(settingsSource).not.toContain('min-[972px]')
    expect(fs.existsSync(path.join(settingsDirectory, 'settingsLayout.tsx'))).toBe(false)
  })

  it('keeps all five non-model sections byte-for-byte at the origin/main baseline', () => {
    for (const [fileName, expectedHash] of Object.entries(MAIN_NON_MODEL_SECTION_SHA256)) {
      const source = fs.readFileSync(path.join(settingsDirectory, fileName))
      expect(createHash('sha256').update(source).digest('hex'), fileName).toBe(expectedHash)
    }
  })

  it('lets model subpages own their header without colliding with the dialog close action', () => {
    expect(settingsSource).not.toContain("{t('settings.tab.models')}</h2>")
    expect(settingsSource).toContain('data-settings-close')
    expect(settingsSource).toContain('[&_[data-model-settings-page]>header]:pr-14')
    expect(settingsSource).toContain('[&>div:not([data-model-settings-page])>:first-child]:pr-14')
  })

  it('keeps the lazy model workspace mounted after its first visit', () => {
    expect(settingsSource).toContain('modelsMounted')
    expect(settingsSource).toContain("if (nextTab === 'models') setModelsMounted(true)")
    expect(settingsSource).toContain("hidden={tab !== 'models'}")
    expect(settingsSource).toContain("style={{ display: tab !== 'models' ? 'none' : undefined }}")
    expect(settingsSource).toContain('<React.Suspense')
    expect(settingsSource).toContain('<OnboardingDrawer />')
  })
})
