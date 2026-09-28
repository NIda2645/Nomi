import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareLaneSkillContext } from '../../electron/agentLane/laneInputPreparation.js'
import { laneErrorCodeOf } from '../../electron/shared/agentLane/laneErrorCodes.js'
import type { LaneComposerContext } from '../../electron/shared/agentLane/laneDesktopContracts.js'
import type { SkillRecord } from '../../electron/skills/skillStore.js'
import { createLaneFixture } from './laneFixture.mjs'

const skill = { name: 'Original skill', contentHash: 'hash-original', content: 'EXACT_SKILL_BODY' } as SkillRecord
for (const change of ['unchanged', 'changed', 'deleted'] as const) {
  test(`S29 replay validates the installed skill after resolving the original input: ${change}`, async t => {
    const f = await createLaneFixture(t, [{ type: 'text', text: 'original reply' }, { type: 'text', text: 'retry reply' }])
    let installed: SkillRecord | null = skill
    let captured: LaneComposerContext = { approvalPolicy: { mode: 'step', spend: 'confirm' },
      skillKey: 'original-skill', systemPrompt: 'ORIGINAL_TEMPLATE' }
    const lane = await f.openLane({ ...f.options, input: {
      capture: () => captured, activate: () => {},
      prepare: context => prepareLaneSkillContext(context, { resolve: async () => installed,
        render: async resolved => resolved.content }),
      providerContent: async message => message.content, rewritePayload: payload => payload,
    } })
    await lane.execute({ kind: 'prompt', text: 'ORIGINAL_TASK' })
    const original = lane.projection().parts.find(part => part.kind === 'user')!
    const before = lane.projection().parts.length
    captured = { approvalPolicy: { mode: 'step', spend: 'confirm' }, retryFromEntryId: original.entryId }
    installed = change === 'deleted' ? null : change === 'changed' ? { ...skill, contentHash: 'hash-changed' } : skill
    if (change === 'unchanged') {
      await lane.execute({ kind: 'prompt', text: 'Retry' })
      const payload = JSON.stringify(f.http.requests.at(-1)!.body)
      assert.ok(payload.includes('ORIGINAL_TEMPLATE'))
      assert.equal(payload.split('EXACT_SKILL_BODY').length - 1, 1, 'skill body is freshly prepared once, never appended to an old composed prompt')
      assert.equal(f.http.requests.length, 2)
    } else {
      const code = change === 'deleted' ? 'agent_skill_unavailable' : 'agent_skill_version_changed'
      await assert.rejects(lane.execute({ kind: 'prompt', text: 'Retry' }), error => laneErrorCodeOf(error) === code)
      assert.equal(f.http.requests.length, 1)
      assert.equal(lane.projection().parts.length, before, 'rejected replay must not enter the native transcript')
    }
  })
}

test('restored draft pins its skill version; old unversioned replay cannot silently adopt a current skill', async () => {
  const skills = { resolve: async () => skill, render: async () => skill.content }
  const context: LaneComposerContext = { approvalPolicy: { mode: 'step', spend: 'confirm' }, skillKey: 'original-skill' }
  await assert.rejects(prepareLaneSkillContext({ ...context, expectedSkillHash: 'old-version' }, skills), /agent_skill_version_changed/)
  await assert.rejects(prepareLaneSkillContext({ ...context, retryFromEntryId: 'old-unversioned' }, skills), /agent_skill_version_changed/)
  assert.equal((await prepareLaneSkillContext(context, skills)).skillSnapshot?.contentHash, skill.contentHash)
})
