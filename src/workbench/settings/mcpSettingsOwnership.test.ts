import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { enSettings, zhSettings } from '../../i18n/locales/settings'

const read = (relativePath: string): string => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('MCP connection settings ownership', () => {
  it('removes AI assistants from the model catalog and its data lifecycle', () => {
    const drawer = read('src/ui/onboarding/OnboardingDrawer.tsx')
    const catalog = read('src/ui/onboarding/useOnboardingDrawerCatalog.ts')
    const constants = read('src/ui/onboarding/onboardingDrawerConstants.ts')

    expect(drawer).not.toContain('ConnectAssistantCard')
    expect(drawer).not.toContain('ASSISTANT_CONNECTION_KEY')
    expect(drawer).not.toContain("kind: 'assistant'")
    expect(drawer).not.toContain('mcpInfo')
    expect(catalog).not.toContain('McpInfo')
    expect(catalog).not.toContain('mcpInfo')
    expect(constants).not.toContain('assistant-mcp')
  })

  it('keeps one MCP entry in Automation and a separate trusted-host section', () => {
    const automation = read('src/workbench/settings/AutomationPermissionsSection.tsx')
    const card = read('src/ui/onboarding/ConnectAssistantCard.tsx')

    expect(automation).toContain('data-settings-action="manage-mcp-connections"')
    expect(automation).toContain('data-settings-section="mcp-assistant-connections"')
    expect(automation).toContain('<ConnectAssistantCard')
    expect(automation).toContain('onOpenAutomationPermissions')
    expect(automation).toContain("section={host.key === 'cursor' ? 'cursor-host' : undefined}")
    expect(automation.indexOf('settings-mcp-title')).toBeLessThan(automation.indexOf('settings-hosts-title'))
    expect(card).toContain("tab: 'automation', section: 'cursor-host'")
  })

  it('provides the approved bilingual information architecture', () => {
    expect(zhSettings.automation.mcp).toMatchObject({
      title: 'AI 助手连接（MCP）',
      clients: 'Claude Code、Codex 与 Cursor',
      manage: '管理连接',
    })
    expect(enSettings.automation.mcp).toMatchObject({
      title: 'AI agent connections (MCP)',
      clients: 'Claude Code, Codex, and Cursor',
      manage: 'Manage connections',
    })
  })
})
