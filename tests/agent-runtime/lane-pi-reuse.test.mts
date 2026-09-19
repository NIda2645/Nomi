import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { AgentHarness, reduceLaneSnapshot } from '@earendil-works/pi-agent-core';
import { MemorySessionRepo, operationMeta } from '@earendil-works/pi-agent-core/harness/session';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/pi-agent-core/harness/context';
import { createModels } from '@earendil-works/pi-ai';
import { createLaneFixture } from './laneFixture.mjs';
import { createNomiProvider } from '../../electron/agentLane/laneModelProvider.mjs';
import { laneInputIntent } from '../../electron/agentLane/laneInputIntent.mjs';

const require = createRequire(import.meta.url);

test('R01/R04 public fixed SDK exports, run metadata lifetime and consumed steer ancestry', async t => {
  assert.equal(require('@earendil-works/pi-agent-core/package.json').version, '0.85.1');
  const f = await createLaneFixture(t, [{ type: 'text', text: 'done' }]);
  const session = await new MemorySessionRepo().create({}, context);
  const configured = await createNomiProvider(f.options.model, globalThis.fetch);
  const models = createModels({ credentials: configured.credentials }); models.setProvider(configured.provider);
  const { harness } = await AgentHarness.create({ session, models, model: configured.model, tools: [] }, context);
  f.after(() => harness.close(context));
  await assert.rejects(harness.watchSession(context), /watchSession|not implemented/i);
  const lane = await harness.lane('main', context);
  const accepted = await lane.accept({ kind: 'prompt', prompt: 'ORIGINAL_INTENT' }, context);
  assert.ok(accepted.ok);
  const id = accepted.value.operationId;
  const meta = (await session.getValue(operationMeta(id), context))!.value;
  assert.equal(meta.intent.kind, 'run');
  const queued = await lane.steer('STEER_ONLY_THREE', undefined, context);
  assert.ok(queued.ok);
  let observed = '';
  harness.hooks.on('transform_context', async (event, hookContext) => {
    observed = await laneInputIntent(session, 'main', event.runId, [], hookContext);
    return undefined;
  });
  const driven = await lane.drive({ operationId: id, waitForRetry: true }, context);
  assert.ok(driven.ok);
  assert.match(observed, /ORIGINAL_INTENT/);
  assert.match(observed, /STEER_ONLY_THREE/);
  assert.ok(meta.intent.kind === 'run' && !meta.intent.promptEntryIds.includes(queued.value.entryId), 'steer does not mutate initial prompt IDs');
  assert.equal(await session.getValue(operationMeta(id), context), undefined, 'terminal cleanup removes operation metadata');
  assert.equal(await laneInputIntent(session, 'main', id, [], context), '', 'completed operation is not revived');
  const next = await lane.accept({ kind: 'prompt', prompt: 'NEW_JOB' }, context);
  assert.ok(next.ok);
  const nextIntent = await laneInputIntent(session, 'main', next.value.operationId, [], context);
  assert.match(nextIntent, /NEW_JOB/);
  assert.doesNotMatch(nextIntent, /ORIGINAL_INTENT|STEER_ONLY_THREE/);
  await lane.abort(context);
});

test('R05 upstream watch resnapshot buffers entries and preserves original ordering across navigation', async t => {
  const f = await createLaneFixture(t, []);
  const session = await new MemorySessionRepo().create({}, context);
  const configured = await createNomiProvider(f.options.model, globalThis.fetch);
  const models = createModels({ credentials: configured.credentials }); models.setProvider(configured.provider);
  const { harness } = await AgentHarness.create({ session, models, model: configured.model, tools: [] }, context);
  f.after(() => harness.close(context));
  const lane = await harness.lane('main', context);
  const first = await lane.appendCustomEntry('fixture', { number: 1 }, context);
  const watch = await lane.watch(context);
  let snapshot = watch.snapshot;
  let resolveSeen!: () => void;
  const seen = new Promise<void>(resolve => { resolveSeen = resolve; });
  watch.start(async (event, eventContext) => {
    if (reduceLaneSnapshot(snapshot, event) === 'rebase') snapshot = await watch.resnapshot(eventContext);
    if (event.type === 'entry_added' && event.entry.type === 'custom' && event.entry.data
      && typeof event.entry.data === 'object' && !Array.isArray(event.entry.data) && event.entry.data.number === 3) resolveSeen();
  });
  await lane.appendCustomEntry('fixture', { number: 2 }, context);
  const navigated = await lane.navigateTree(first, { summarize: false }, context);
  assert.ok(navigated.ok);
  await lane.appendCustomEntry('fixture', { number: 3 }, context);
  await seen;
  const branch = await session.branch('main', context);
  assert.deepEqual(snapshot.transcript.map(e => e.id), (await branch!.findEntries({ order: 'oldestFirst' }, context)).map(e => e.id));
  watch.unsubscribe();
  await assert.rejects(watch.resnapshot(context), /unsubscribed/);
});
