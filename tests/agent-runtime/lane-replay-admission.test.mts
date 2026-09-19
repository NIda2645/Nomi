import assert from 'node:assert/strict';
import test from 'node:test';
import { originalLaneEntry, precedingLaneInput, replayLaneInput } from '../../electron/agentLane/laneOriginalInput.mjs';
import { createLaneFixture } from './laneFixture.mjs';
import { openLaneSession } from '../../electron/agentLane/laneSession.mjs';
import { MemorySessionRepo } from '@earendil-works/pi-agent-core/harness/session';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/pi-agent-core/harness/context';
import { z } from 'zod';
const policy = { mode: 'safe-auto' as const, spend: 'confirm' as const };
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (text: string) => ({ role: 'assistant' as const, content: [{ type: 'text' as const, text }], api: 'openai-completions' as const, provider: 'fixture', model: 'fixture', timestamp: 1, stopReason: 'aborted' as const, usage });

test('control: paged predecessor lookup stays on current branch and rejects existing foreign ID', async t => {
  const session = await new MemorySessionRepo().create({}, context); t.after(() => session.close(context));
  const main = await session.createBranch('main', null, context);
  const original = await main.appendMessage({ role: 'user', content: [{ type: 'text', text: 'ROOT_INPUT' }], timestamp: 1 }, context);
  const side = await session.createBranch('side', original, context);
  const foreign = await side.appendMessage({ role: 'user', content: 'SIDE_SECRET', timestamp: 2 }, context);
  for (let i = 0; i < 171; i++) await main.appendMessage(assistant('step ' + i), context);
  assert.equal((await precedingLaneInput(main, await main.getTipId(context), context))?.id, original);
  await assert.rejects(originalLaneEntry(main, foreign, context), /reference/);
});

test('text-array user entries exposed as Retry targets can actually be replayed', async t => {
  const session = await new MemorySessionRepo().create({}, context); t.after(() => session.close(context));
  const branch = await session.createBranch('main', null, context);
  const id = await branch.appendMessage({ role: 'user', content: [{ type: 'text', text: 'LEGACY_TEXT_ARRAY' }], timestamp: 1 }, context);
  const entry = await originalLaneEntry(branch, id, context);
  const replayed = replayLaneInput(entry, { approvalPolicy: policy, retryFromEntryId: id }, 'Retry');
  assert.equal(replayed.content, 'LEGACY_TEXT_ARRAY');
});

async function seedContinueChain(f: any) {
  const opened = await openLaneSession({ projectDir: f.projectDir }, context);
  const branch = await opened.session.createBranch('main', null, context);
  const originalId = await branch.appendMessage({ role: 'nomi.input', content: 'ORIGINAL_TASK_ONLY_THREE_CHARACTERS', timestamp: 1, context: { approvalPolicy: policy, skillKey: 'original-skill' } }, context);
  const stopped1 = await branch.appendMessage(assistant('STOPPED_PROSE_ONE'), context);
  const continue1 = await branch.appendMessage({ role: 'nomi.input', content: 'Continue', timestamp: 2, context: { approvalPolicy: policy, skillKey: 'original-skill', retryFromEntryId: originalId, continueFromEntryId: stopped1 } }, context);
  const stopped2 = await branch.appendMessage(assistant('STOPPED_PROSE_TWO'), context);
  await opened.session.close(context); await opened.release(context);
  return { originalId, stopped1, continue1, stopped2 };
}

for (const action of ['continue-again', 'retry-continue'] as const) {
  test(`${action} carries the root original task in the newly admitted provider input`, async t => {
    const f = await createLaneFixture(t, [{ type: 'text', text: 'done' }]);
    const ids = await seedContinueChain(f);
    const captured = { approvalPolicy: policy, ...(action === 'continue-again' ? { continueFromEntryId: ids.stopped2 } : { retryFromEntryId: ids.continue1 }) };
    const host = await f.openLane({ ...f.options, input: { capture: () => captured, activate: () => {}, providerContent: async (m: any) => m.content, rewritePayload: (p: any) => p } });
    await host.execute({ kind: 'prompt', text: action === 'continue-again' ? 'Continue' : 'Retry' });
    const users = (f.http.requests.at(-1)!.body.messages as any[]).filter(m => m.role === 'user');
    const lastUser = JSON.stringify(users.at(-1));
    t.diagnostic(JSON.stringify({ action, lastProviderUser: users.at(-1) }));
    assert.ok(lastUser.includes('ORIGINAL_TASK_ONLY_THREE_CHARACTERS'), 'new input must contain the root task even after previous inputs are compacted away');
    assert.ok(lastUser.includes(action === 'continue-again' ? 'STOPPED_PROSE_TWO' : 'STOPPED_PROSE_ONE'));
  });
}

test('replaying an old canvas target must not grant current document surface destructive authority', async t => {
  const f = await createLaneFixture(t, [{ type: 'text', text: 'original done' },
    { type: 'tool', calls: [{ id: 'delete-on-replay', name: 'mutate_surface', arguments: {} }] }, { type: 'text', text: 'done' }]);
  let captured: any = { approvalPolicy: policy, target: { kind: 'canvas', nodeIds: ['old-node'] } };
  let executions = 0;
  const host = await f.openLane({ ...f.options, input: { capture: () => captured, activate: () => {}, providerContent: async (m: any) => m.content, rewritePayload: (p: any) => p },
    tools: [{ name: 'mutate_surface', contractId: 'canvas.delete', description: 'Counter only.', promptSnippet: 'Counter only.', nextAction: 'none',
      describe: { does: 'Counter only.', useWhen: 'Test.', notWhen: 'Production.', params: 'None.' }, schema: z.object({}), examples: [], effect: 'irreversible', execution: { timeoutMs: 30000 },
      execute: async () => { executions++; return { ok: true, text: 'applied' }; } }],
    toolLifecycle: { prepare: async () => {}, approved: async () => {}, settled: () => {} },
  });
  await host.execute({ kind: 'prompt', text: 'Original canvas instruction' });
  const original = host.projection().parts.find((p: any) => p.kind === 'user');
  assert.ok(original?.entryId);
  captured = { approvalPolicy: policy, target: { kind: 'document', documentId: 'current-doc', anchor: { kind: 'whole-document' } }, retryFromEntryId: original.entryId };
  await host.execute({ kind: 'prompt', text: 'Retry' });
  t.diagnostic(JSON.stringify({ currentSurface: captured.target.kind, executions }));
  assert.equal(executions, 0, 'historical target is a selector, not a fresh surface grant');
});


test('a recovered draft preserves its old target without borrowing its surface authority', async t => {
  const f = await createLaneFixture(t, [
    { type: 'tool', calls: [{ id: 'delete-recovered', name: 'mutate_surface', arguments: {} }] },
    { type: 'text', text: 'done' },
  ]);
  let executions = 0;
  let admitted: any;
  const captured: any = { approvalPolicy: policy,
    target: { kind: 'document', documentId: 'current-doc', anchor: { kind: 'whole-document' } },
    systemPrompt: 'CURRENT_TEMPLATE',
    restoredIntent: { target: { kind: 'canvas', nodeIds: ['old-node'] }, systemPrompt: 'ORIGINAL_TEMPLATE' },
  };
  const host = await f.openLane({ ...f.options,
    input: { capture: () => captured, activate: () => {},
      providerContent: async (message: any) => { admitted = message.context; return message.content; }, rewritePayload: (p: any) => p },
    tools: [{ name: 'mutate_surface', contractId: 'canvas.delete', description: 'Counter only.', promptSnippet: 'Counter only.', nextAction: 'none',
      describe: { does: 'Counter only.', useWhen: 'Test.', notWhen: 'Production.', params: 'None.' }, schema: z.object({}), examples: [], effect: 'irreversible', execution: { timeoutMs: 30000 },
      execute: async () => { executions++; return { ok: true, text: 'applied' }; } }],
    toolLifecycle: { prepare: async () => {}, approved: async () => {}, settled: () => {} },
  });
  await host.execute({ kind: 'prompt', text: 'Recovered input' });
  assert.equal(executions, 0);
  assert.equal(admitted.admissionSurface, 'document');
  assert.deepEqual(admitted.target, { kind: 'canvas', nodeIds: ['old-node'] });
  assert.equal(admitted.systemPrompt, 'ORIGINAL_TEMPLATE');
  assert.equal(admitted.restoredIntent, undefined, 'the transport envelope must not become nested historical intent');
});
