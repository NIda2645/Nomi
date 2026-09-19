import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLaneFixture } from './laneFixture.mjs';
import { BACKGROUND_CONTEXT } from '@earendil-works/pi-agent-core/harness/context';
import { openLaneSession } from '../../electron/agentLane/laneSession.mjs';
import { isLaneInputMessage } from '../../electron/shared/agentLane/laneInputMessage.js';

test('R02 actual SDK compaction retains original branch IDs and visible skill history', async (t) => {
  const f = await createLaneFixture(t, [
    { type: 'text', text: 'history '.repeat(18000), usage: { input: 81000, output: 100 } },
    { type: 'text', text: 'summary without original input' },
    { type: 'text', text: 'summary' },
    { type: 'text', text: 'continued' },
  ]);
  const input = { capture: () => ({ approvalPolicy: { mode: 'safe-auto' as const, spend: 'confirm' as const }, skillKey: 'storyboard' }),
    activate: () => {}, providerContent: async (m: { content: string }) => m.content, rewritePayload: (p: unknown) => p };
  const lane = await f.openLane({ ...f.options, input, model: { ...f.options.model, contextWindow: 1000000 } });
  await lane.execute({ kind: 'prompt', text: 'Only three characters' });
  await lane.execute({ kind: 'prompt', text: 'Continue' });
  const visible = lane.projection().parts.filter(p => p.kind === 'user');
  await lane.close();
  const opened = await openLaneSession({ projectDir: f.projectDir }, BACKGROUND_CONTEXT);
  f.after(async () => { await opened.session.close(BACKGROUND_CONTEXT); await opened.release(BACKGROUND_CONTEXT); });
  const branch = await opened.session.branch('main', BACKGROUND_CONTEXT);
  const entries = await branch!.findEntries({ order: 'oldestFirst' }, BACKGROUND_CONTEXT);
  assert.ok(entries.some(e => e.type === 'compaction'), 'real pi compact lifecycle ran');
  const originals = entries.filter(e => e.type === 'message' && isLaneInputMessage(e.message));
  t.diagnostic(JSON.stringify({ originalIds: originals.map(e => e.id), visible }));
  assert.equal(visible.length, originals.length, 'compaction is not a UI history cutoff');
  assert.ok(visible.some(p => p.kind === 'user' && p.text === 'Only three characters' && p.skillKey === 'storyboard'));
});

test('R04 current operation original intent remains in requests when automatic compaction omits all inputs', async (t) => {
  const f = await createLaneFixture(t, [
    { type: 'text', text: 'history '.repeat(18000), usage: { input: 81000, output: 100 } },
    { type: 'text', text: 'summary intentionally omits user constraints' },
    { type: 'text', text: 'summary intentionally omits user constraints' },
    { type: 'text', text: 'done' },
  ]);
  const lane = await f.openLane({ ...f.options, model: { ...f.options.model, contextWindow: 1000000 } });
  await lane.execute({ kind: 'prompt', text: 'Earlier unrelated job' });
  await lane.execute({ kind: 'prompt', text: 'ONLY_THREE_CHARACTERS_CURRENT_JOB' });
  const request = JSON.stringify(f.http.requests.at(-1)!.body);
  assert.match(request, /ONLY_THREE_CHARACTERS_CURRENT_JOB/);
  assert.doesNotMatch(request, /Earlier unrelated job/);
});

test('R03 paged history remains current-branch-only and original IDs survive reopen', async (t) => {
  const f = await createLaneFixture(t, []);
  const opened = await openLaneSession({ projectDir: f.projectDir }, BACKGROUND_CONTEXT);
  const branch = await opened.session.createBranch('main', null, BACKGROUND_CONTEXT);
  const ids: string[] = [];
  for (let i = 0; i < 175; i++) ids.push(await branch.appendMessage({ role: 'user', content: `original ${i}`, timestamp: i }, BACKGROUND_CONTEXT));
  const side = await opened.session.createBranch('side', ids[2]!, BACKGROUND_CONTEXT);
  await side.appendMessage({ role: 'user', content: 'SIDE_BRANCH_SECRET', timestamp: 1 }, BACKGROUND_CONTEXT);
  await opened.session.close(BACKGROUND_CONTEXT); await opened.release(BACKGROUND_CONTEXT);
  const { openLaneHistory } = await import('../../electron/agentLane/laneHistory.mjs');
  const history = await openLaneHistory({ projectDir: f.projectDir });
  f.after(() => history.close());
  assert.equal(history.projection().parts.length, 80);
  while (history.projection().history?.hasMore) {
    await history.execute({ kind: 'history-older', before: history.projection().history!.before! });
  }
  assert.deepEqual(history.projection().parts.map(p => p.entryId), ids);
  assert.doesNotMatch(JSON.stringify(history.projection()), /SIDE_BRANCH_SECRET/);
  await history.close();
  const reopened = await openLaneHistory({ projectDir: f.projectDir });
  f.after(() => reopened.close());
  assert.deepEqual(reopened.projection().parts.map(p => p.entryId), ids.slice(-80));
});

test('R04 active run intent and skill survive two summaries that omit both', async (t) => {
  const f = await createLaneFixture(t, [
    { type: 'message', parts: [{ type: 'text', text: 'material '.repeat(18000) }, { type: 'toolCall', id: 'read-one', name: 'read_script', arguments: { scope: 'full' } }], usage: { input: 81000, output: 100 } },
    { type: 'text', text: 'summary deliberately omits task' },
    { type: 'message', parts: [{ type: 'text', text: 'material '.repeat(18000) }, { type: 'toolCall', id: 'read-two', name: 'read_script', arguments: { scope: 'full' } }], usage: { input: 81000, output: 100 } },
    { type: 'text', text: 'summary deliberately omits task' },
    { type: 'text', text: 'finished' },
  ]);
  const input = { capture: () => ({ approvalPolicy: { mode: 'safe-auto' as const, spend: 'confirm' as const }, skillKey: 'storyboard' }),
    activate: () => {}, providerContent: async (m: { content: string }) => m.content, rewritePayload: (p: unknown) => p };
  const lane = await f.openLane({ ...f.options, input, model: { ...f.options.model, contextWindow: 1000000 } });
  await lane.execute({ kind: 'prompt', text: 'ONLY_THREE_CHARACTERS' });
  const assistantRequests = f.http.requests.filter(r => Array.isArray(r.body.tools) && r.body.tools.length);
  assert.ok(assistantRequests.length >= 2);
  assert.match(JSON.stringify(assistantRequests.at(-1)!.body), /ONLY_THREE_CHARACTERS/);
  assert.match(JSON.stringify(assistantRequests.at(-1)!.body), /storyboard/);
  const visible = lane.projection().parts;
  await lane.close();
  const reopened = await openLaneSession({ projectDir: f.projectDir }, BACKGROUND_CONTEXT);
  f.after(async () => { await reopened.session.close(BACKGROUND_CONTEXT); await reopened.release(BACKGROUND_CONTEXT); });
  const branch = await reopened.session.branch('main', BACKGROUND_CONTEXT);
  const entries = await branch!.findEntries({ order: 'oldestFirst' }, BACKGROUND_CONTEXT);
  assert.ok(entries.filter(e => e.type === 'compaction').length >= 2, 'two actual SDK compactions');
  const assistantIds = entries.filter(e => e.type === 'message' && e.message.role === 'assistant').map(e => e.id);
  const displayedIds = [...new Set(visible.filter(p => p.kind === 'assistant-text').map(p => p.entryId))];
  assert.deepEqual(displayedIds, assistantIds, 'retainedTail must not duplicate historical assistants');

});

test('S25 explicit Continue still addresses the original stopped entry after compaction', async t => {
  const { AgentHarness } = await import('@earendil-works/pi-agent-core');
  let harness!: import('@earendil-works/pi-agent-core').AgentHarness;
  const create = AgentHarness.create;
  t.mock.method(AgentHarness, 'create', async (options: import('@earendil-works/pi-agent-core').AgentHarnessOptions, context: import('@earendil-works/pi-agent-core/harness/context').Context) => {
    const result = await create(options, context); harness = result.harness; return result;
  });
  const f = await createLaneFixture(t, [
    { type: 'text', text: 'history '.repeat(18000), usage: { input: 81000, output: 100 } },
    { type: 'text', text: 'summary' },
    { type: 'text', text: 'summary' },
    { type: 'text', text: 'continued' },
  ]);
  let reference: string | undefined;
  const input = { capture: () => ({ approvalPolicy: { mode: 'safe-auto' as const, spend: 'confirm' as const }, continueFromEntryId: reference }),
    activate: () => {}, providerContent: async (m: { content: string }) => m.content, rewritePayload: (p: unknown) => p };
  const host = await f.openLane({ ...f.options, input, model: { ...f.options.model, contextWindow: 1000000 } });
  const lane = await harness.lane('main', BACKGROUND_CONTEXT);
  const id = await lane.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'STOPPED_ORIGINAL' }],
    api: 'openai-completions', provider: 'fixture', model: 'fixture', timestamp: 1, stopReason: 'aborted',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }, BACKGROUND_CONTEXT);
  await host.execute({ kind: 'prompt', text: 'Another job' });
  const watch = await lane.watch(BACKGROUND_CONTEXT);
  assert.ok(watch.snapshot.transcript.some(e => e.type === 'compaction'));
  assert.ok(!watch.snapshot.transcript.some(e => e.id === id));
  watch.unsubscribe();
  reference = id;
  await host.execute({ kind: 'prompt', text: 'Continue the selected stopped response' });
  assert.match(JSON.stringify(f.http.requests.at(-1)!.body), /STOPPED_ORIGINAL/);
});
