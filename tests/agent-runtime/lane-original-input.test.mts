import assert from 'node:assert/strict'
import test from 'node:test'
import type { LaneComposerContext } from '../../electron/shared/agentLane/laneDesktopContracts.js'
import { createLaneFixture } from './laneFixture.mjs'

test('S21 original-input retry retains full text, skill and attachments instead of the new composer', async t => {
  const f = await createLaneFixture(t, [{ type: 'text', text: 'first reply' }, { type: 'text', text: 'retried reply' }])
  let captured: LaneComposerContext = { approvalPolicy: { mode: 'safe-auto', spend: 'confirm' },
    skillKey: 'original-skill', systemPrompt: 'ORIGINAL_SKILL_BODY', displayText: 'short display',
    attachments: [{ assetId: 'original-asset', version: 2 }], documentId: 'original-document' }
  const activated: LaneComposerContext[] = []
  const lane = await f.openLane({ ...f.options, input: {
    capture: () => captured, activate: value => activated.push(value),
    providerContent: async message => message.content, rewritePayload: payload => payload,
  } })
  await lane.execute({ kind: 'prompt', text: 'FULL_ORIGINAL_EXECUTION_TEXT' })
  const original = lane.projection().parts.find(part => part.kind === 'user')!
  assert.ok(original.entryId)
  captured = { approvalPolicy: { mode: 'step', spend: 'confirm' }, skillKey: 'new-composer-skill',
    attachments: [{ assetId: 'new-composer-asset', version: 1 }],
    retryFromEntryId: original.entryId } as LaneComposerContext
  await lane.execute({ kind: 'prompt', text: 'Retry' })
  const current = activated.at(-1)!
  assert.equal(current.skillKey, 'original-skill')
  assert.equal(current.systemPrompt, 'ORIGINAL_SKILL_BODY')
  assert.deepEqual(current.attachments, [{ assetId: 'original-asset', version: 2 }])
  assert.equal(current.documentId, 'original-document')
  assert.deepEqual(current.approvalPolicy, { mode: 'step', spend: 'confirm' })
  const body = JSON.stringify(f.http.requests.at(-1)!.body)
  assert.ok(body.includes('FULL_ORIGINAL_EXECUTION_TEXT'))
  assert.ok(!body.includes('new-composer-skill'))
  assert.equal(lane.projection().parts.filter(part => part.kind === 'user' && part.text === 'short display').length, 2)
})

test('S21 unknown original input is rejected before native admission or provider request', async t => {
  const f = await createLaneFixture(t, [{ type: 'text', text: 'must not request' }])
  const lane = await f.openLane({ ...f.options, input: {
    capture: () => ({ approvalPolicy: { mode: 'step', spend: 'confirm' }, retryFromEntryId: 'foreign-input' } as LaneComposerContext),
    activate: () => {}, providerContent: async message => message.content, rewritePayload: payload => payload,
  } })
  await assert.rejects(lane.execute({ kind: 'prompt', text: 'Retry' }), /input|reference/i)
  assert.equal(f.http.requests.length, 0)
  assert.equal(lane.projection().parts.length, 0)
})
