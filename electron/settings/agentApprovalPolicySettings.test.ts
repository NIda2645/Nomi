import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./settingsRoot', () => ({ getSettingsRoot: () => root }))

let root = ''
const roots: string[] = []
function freshRoot(): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-agent-approval-'))
  roots.push(root)
  return root
}

afterEach(() => { for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })

describe('主进程持有的权限档', () => {
  it('没写过 → 默认档（更常问的那一档），不是最松的那一档', async () => {
    freshRoot()
    const { readAgentApprovalPolicy } = await import('./agentApprovalPolicySettings')
    expect(readAgentApprovalPolicy()).toEqual({ mode: 'safe-auto', spend: 'confirm' })
  })

  it('用户切档 → 落盘 → 下一次开项目 / 另一条路读到的是同一个值', async () => {
    freshRoot()
    const { readAgentApprovalPolicy, writeAgentApprovalPolicy, agentApprovalPolicySettingsPath } = await import('./agentApprovalPolicySettings')
    expect(writeAgentApprovalPolicy({ mode: 'project', spend: 'confirm' })).toEqual({ mode: 'project', spend: 'confirm' })
    expect(fs.existsSync(agentApprovalPolicySettingsPath())).toBe(true)
    expect(readAgentApprovalPolicy()).toEqual({ mode: 'project', spend: 'confirm' })
  })

  it('认不出的值回落到默认档（更常问），不是静默放松', async () => {
    freshRoot()
    const { readAgentApprovalPolicy, writeAgentApprovalPolicy, agentApprovalPolicySettingsPath } = await import('./agentApprovalPolicySettings')
    writeAgentApprovalPolicy({ mode: 'project', spend: 'confirm' })
    fs.writeFileSync(agentApprovalPolicySettingsPath(), JSON.stringify({ schemaVersion: 1, policy: { mode: '全自动无敌版', spend: 'whatever' } }))
    expect(readAgentApprovalPolicy()).toEqual({ mode: 'safe-auto', spend: 'confirm' })
  })

  it('盘上是裸的 { mode, spend } 也读得出来（手改过的文件不整份丢掉）', async () => {
    freshRoot()
    const { readAgentApprovalPolicy, agentApprovalPolicySettingsPath } = await import('./agentApprovalPolicySettings')
    fs.mkdirSync(path.dirname(agentApprovalPolicySettingsPath()), { recursive: true })
    fs.writeFileSync(agentApprovalPolicySettingsPath(), JSON.stringify({ mode: 'step', spend: 'confirm' }))
    expect(readAgentApprovalPolicy()).toEqual({ mode: 'step', spend: 'confirm' })
  })
})
