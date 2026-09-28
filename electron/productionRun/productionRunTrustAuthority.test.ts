import { describe, expect, it } from 'vitest'

import {
  PROJECT_AGENT_APPROVAL_MODES,
  PROJECT_AGENT_SPEND_POLICIES,
  type ProjectAgentApprovalPolicy,
} from '../shared/agentCapabilities/capabilityApprovalPolicy'
import { TRUST_LEVEL_STRICTNESS, assertCallerDeclaredTrustLevel, isTrustDowngrade, trustLevelFromApprovalPolicy } from './productionRunTrustAuthority'
import { normalizeTrustLevel, type TrustLevel } from './productionRunTypes'

/**
 * 用户只在一个地方表达过「Nomi 还问不问我」。这组测试钉的是：那句话到 Run 那一侧的翻译
 * **只有一个答案**，而且穷举——三个档位 × 两条 spend 轴，一格都不许悬空。
 */
describe('trustLevelFromApprovalPolicy', () => {
  const expected: Record<string, TrustLevel> = {
    step: 'confirm_all',
    'safe-auto': 'key_confirm',
    project: 'budget_only',
  }

  it('穷举三档 × 两条 spend 轴：每一格都有唯一答案，且与 spend 无关', () => {
    const seen = new Set<string>()
    for (const mode of PROJECT_AGENT_APPROVAL_MODES) {
      for (const spend of PROJECT_AGENT_SPEND_POLICIES) {
        const policy = { mode, spend } as ProjectAgentApprovalPolicy
        const level = trustLevelFromApprovalPolicy(policy)
        expect(level, `${mode}/${spend}`).toBe(expected[mode])
        expect(normalizeTrustLevel(level), `${mode}/${spend} 必须是合法档位`).toBe(level)
        seen.add(`${mode}/${spend}`)
      }
    }
    expect(seen.size).toBe(PROJECT_AGENT_APPROVAL_MODES.length * PROJECT_AGENT_SPEND_POLICIES.length)
    // 三个权限档必须映到三个**不同**的信任档：塌成两档等于用户少了一个能表达的意思。
    expect(new Set(Object.values(expected)).size).toBe(3)
  })

  it('没有档位（老记录 / 还没选过）→ 默认那一档，而不是最松的那一档', () => {
    expect(trustLevelFromApprovalPolicy(undefined)).toBe('key_confirm')
    expect(TRUST_LEVEL_STRICTNESS[trustLevelFromApprovalPolicy(undefined)])
      .toBeGreaterThan(TRUST_LEVEL_STRICTNESS.budget_only)
  })

  it('「问得更多」的档位不会被当成放松（阳性对照）', () => {
    expect(isTrustDowngrade(trustLevelFromApprovalPolicy({ mode: 'safe-auto', spend: 'confirm' }), 'confirm_all')).toBe(false)
    expect(isTrustDowngrade(trustLevelFromApprovalPolicy({ mode: 'safe-auto', spend: 'confirm' }), 'budget_only')).toBe(true)
  })

  it('调用方自报的档位按**派生出来的**那一档判，而不是按硬编码默认档', () => {
    const fullAuto = { trustLevel: trustLevelFromApprovalPolicy({ mode: 'project', spend: 'confirm' }) }
    // 用户已经选了全自动 → 外部入口要 budget_only 不再是「放松」，放行。
    expect(() => assertCallerDeclaredTrustLevel('budget_only', fullAuto)).not.toThrow()
    const stepByStep = { trustLevel: trustLevelFromApprovalPolicy({ mode: 'step', spend: 'confirm' }) }
    // 用户选的是每步都问 → 同一个请求必须被拒，并指向那条会真的问人的路。
    expect(() => assertCallerDeclaredTrustLevel('budget_only', stepByStep)).toThrow(/set_trust/)
  })
})
