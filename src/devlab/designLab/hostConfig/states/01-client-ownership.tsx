import React from 'react'
import { ConnectAssistantCard } from '../../../../ui/onboarding/ConnectAssistantCard'
import type { McpInfo } from '../../../../desktop/mcpBridgeTypes'
import type { LabState } from '../../labScreen'
import { SETTINGS_CELL_WIDTH } from '../../settings/settingsLabKit'

// The production card receives the same readMcpInfo snapshot shape as the settings host.
function OwnershipStage(): JSX.Element {
  const info: McpInfo = React.useMemo(() => ({
    tokenReady: true,
    rpcRunning: true,
    server: { command: '/Applications/Nomi.app/Contents/MacOS/Nomi', args: [] },
    trustedHosts: [],
    clients: {
      claude: {
        installed: true, appInstalled: true, configPath: '/Users/me/.claude.json', snippet: '{}',
        configState: 'launcher-elsewhere', launcherKind: 'packaged',
        configuredCommand: '/Users/me/Downloads/Nomi Preview.app/Contents/Frameworks/Nomi Helper.app/Contents/MacOS/Nomi Helper',
        configuredSettingsDir: '/Users/me/Library/Application Support/Nomi',
      },
    },
  }), [])
  React.useMemo(() => {
    ;(window as unknown as { nomiDesktop: unknown }).nomiDesktop = { capability: { mcpInfo: () => info } }
  }, [info])
  return (
    <div style={{ width: SETTINGS_CELL_WIDTH }} data-design-lab-stage="host-config">
      <ConnectAssistantCard info={info} detailMode onChanged={() => {}} onTrustChange={() => {}} />
    </div>
  )
}

export const HOST_CONFIG_STATES: readonly LabState[] = [
  {
    id: 'host-config-01-elsewhere',
    name: '另一份 Nomi · 常驻归属与主动切换',
    source: 'src/ui/onboarding/ConnectAssistantCard.tsx',
    coverage: 'shell',
    render: () => <OwnershipStage />,
  },
]
