import assert from 'node:assert/strict';
import test from 'node:test';
import { openLane } from '../../electron/agentLane/laneHost.mjs';
import { createCanvasLaneTools } from '../../electron/agentLane/laneCanvasTools.js';
import { createExtendedLaneTools } from '../../electron/agentLane/laneExtendedTools.js';
import type { CanvasWriteInput, CanvasWriteResult } from '../../electron/shared/agentCapabilities/canvasWrite.js';
import { createLaneFixture } from './laneFixture.mjs';

// 草稿保存与付费授权分离；回执只陈述实际结果，不把保存等同于落画布或开跑。
// 此夹具明确使用 safe-auto + confirm，generate 必须保留等待用户付款确认的 STOP 语义。
const shots = [{ title: 'Fixture sunrise', prompt: 'Fixture sunrise.', taskKind: 'text_to_image' }];

test('safe-auto saves draft_shots without a review card or a generation-start claim', async (t) => {
  const fixture = await createLaneFixture(t, [
    { type: 'tool', calls: [{ id: 'fixture-draft', name: 'draft_shots', arguments: { shots } }] },
    { type: 'text', text: 'Fixture complete.' },
  ], { hasUserInterface: true, policy: () => ({ mode: 'safe-auto', spend: 'confirm' }) });
  let writes = 0, cards = 0;
  const lane = await openLane({ ...fixture.options, tools: createExtendedLaneTools({
    execute: async (call) => { writes += 1; assert.equal(call.toolName, 'draft_shots');
      return { ok: true, result: { operation: { operationId: 'op-1', state: 'draft', cardHidden: true } } }; },
  }) });
  try {
    lane.subscribe((projection) => { if (projection.pending) cards += 1; });
    await lane.execute({ kind: 'prompt', text: 'Draft the fixture storyboard.' });
    assert.equal(writes, 1);
    assert.equal(cards, 0, 'a draft is a reversible local write: no card');
    const result = lane.projection().parts.find((part) => part.kind === 'tool-result');
    assert.ok(result?.kind === 'tool-result' && !result.isError);
    assert.match(result.text, /Draft changes are saved in the project/);
    assert.doesNotMatch(result.text, /are on the canvas|price badge|generation has started/);
  } finally { await lane.close(); }
});

test('generate returns isError + STOP: the model cannot claim generation started', async (t) => {
  const fixture = await createLaneFixture(t, [
    { type: 'tool', calls: [{ id: 'fixture-generate', name: 'generate', arguments: { operationId: 'op-1' } }] },
    { type: 'text', text: 'The card is in front of you.' },
  ], { hasUserInterface: true, policy: () => ({ mode: 'safe-auto', spend: 'confirm' }) });
  const lane = await openLane({ ...fixture.options, tools: createExtendedLaneTools({
    execute: async (call) => { assert.equal(call.toolName, 'generate');
      return { ok: true, result: { operation: { operationId: 'op-1', state: 'draft' }, shots: ['shot-1', 'shot-2'], nextAction: 'await_user' } }; },
  }) });
  try {
    await lane.execute({ kind: 'prompt', text: 'Generate them.' });
    const result = lane.projection().parts.find((part) => part.kind === 'tool-result');
    assert.ok(result?.kind === 'tool-result' && result.isError, `the spend card is delivered as an error result: ${result?.kind === 'tool-result' ? result.text : String(result?.kind)}`);
    assert.match(result.text, /priced confirmation card in Nomi/);
    assert.match(result.text, /for 2 shot\(s\)/);
    assert.match(result.text, /STOP/);
    assert.match(result.text, /Generation has NOT started/);
  } finally { await lane.close(); }
});

function applied(input: CanvasWriteInput): CanvasWriteResult {
  const common = { applied: true as const, proposalId: 'fixture-proposal', reconciliation: { ok: true, deviationCount: 0 } };
  if (input.operation !== 'create_canvas_nodes') throw new Error(`fixture only writes artifacts, got ${input.operation}`);
  return { ...common, operation: input.operation, affectedNodeIds: ['fixture-node'], affectedEdgeIds: [], clientIdToNodeId: { 'artifact-1': 'fixture-node' }, connectedCount: 0, skippedEdges: [] };
}

test('safe-auto still executes an ordinary local canvas write without a review card', async (t) => {
  const fixture = await createLaneFixture(t, [
    { type: 'tool', calls: [{ id: 'fixture-local-write', name: 'make_artifact',
      arguments: { fileType: 'text', title: 'Fixture note', content: 'Fixture local edit.' } }] },
    { type: 'text', text: 'Fixture complete.' },
  ], { hasUserInterface: true, policy: () => ({ mode: 'safe-auto', spend: 'confirm' }) });
  let writes = 0, cards = 0;
  const lane = await openLane({ ...fixture.options, tools: createCanvasLaneTools({
    read: async () => { throw new Error('Fixture does not read.'); },
    write: async (input) => { writes += 1; return applied(input); },
  }) });
  try {
    lane.subscribe((projection) => { if (projection.pending) cards += 1; });
    await lane.execute({ kind: 'prompt', text: 'Put a note on the canvas.' });
    assert.equal(writes, 1);
    assert.equal(cards, 0);
  } finally { await lane.close(); }
});
