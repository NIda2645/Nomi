import assert from 'node:assert/strict';
import test from 'node:test';
import { openLane } from '../../electron/agentLane/laneHost.mjs';
import { openLaneWorkspace } from '../../electron/agentLane/laneWorkspace.mjs';
import { createLaneFixture } from './laneFixture.mjs';

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function address(workspace: import('../../electron/shared/agentLane/laneContracts.js').LaneWorkspaceHandle) {
  const snapshot = workspace.projection();
  const current = snapshot.lanes.find(lane => lane.laneName === snapshot.active.lane);
  assert.ok(current, 'real pi session appears in the same published summary');
  return { laneName: current.laneName, sessionId: current.sessionId };
}
function controlledOpener(fixture: Awaited<ReturnType<typeof createLaneFixture>>) {
  let pause: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  return {
    pauseNext() { const gate = { entered: deferred(), release: deferred() }; pause = gate; fixture.after(() => gate.release.resolve()); return gate; },
    async open(options: import('../../electron/agentLane/laneWorkspace.mjs').LaneWorkspaceOptions) {
      const gate = pause; pause = undefined;
      const handle = await openLane({ ...options, model: options.model! });
      fixture.after(() => handle.close());
      if (gate) { gate.entered.resolve(); await gate.release.promise; }
      return handle;
    },
  };
}


for (const stopped of [false, true]) test(`F12: same-session model readiness ${stopped ? 'cannot revive a stopped input' : 'still admits an uncancelled input'}`, async t => {
  const fixture = await createLaneFixture(t, [{ type: 'text', text: 'new input' }]);
  const opener = controlledOpener(fixture);
  const workspace = await openLaneWorkspace(fixture.options, opener.open);
  fixture.after(() => workspace.close());
  const expected = address(workspace);
  const gate = opener.pauseNext();
  const replacement = workspace.configureModel({ ...fixture.options.model, modelId: 'second-model' });
  await gate.entered.promise;
  const pending = workspace.execute({ kind: 'prompt', text: 'waiting for readiness' }, { expectedConversation: expected }).then(value => ({ value }), error => ({ error }));
  const abort = stopped ? workspace.execute({ kind: 'abort' }, { expectedConversation: expected }) : Promise.resolve({});
  const next = stopped ? workspace.execute({ kind: 'prompt', text: 'new input during readiness' }, { expectedConversation: expected }) : undefined;
  gate.release.resolve();
  await Promise.all([replacement, abort]);
  const result = await pending;
  assert.deepEqual(address(workspace), expected);
  await next;
  assert.equal(fixture.http.requests.length, 1);
  if (stopped) {
    assert.ok('error' in result);
    const text = JSON.stringify(fixture.http.requests[0]!.body);
    assert.match(text, /new input during readiness/);
    assert.doesNotMatch(text, /waiting for readiness/);
  } else assert.ok('value' in result);
});
