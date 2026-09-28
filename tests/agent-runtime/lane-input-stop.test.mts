import assert from 'node:assert/strict';
import test from 'node:test';
import { createLaneFixture } from './laneFixture.mjs';

test('independent: stop invalidates an input still preparing before native acceptance', async t => {
  const f = await createLaneFixture(t, [{ type: 'text', text: 'this must not run after stop' }]);
  let enter!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let accepted = 0;
  let prepared = 0;
  const host = await f.openLane({ ...f.options, input: {
    capture: () => ({ approvalPolicy: { mode: 'step', spend: 'confirm' } }),
    prepare: async context => { if (++prepared === 1) { enter(); await waiting; } return context; },
    activate: () => {}, providerContent: async message => message.content, rewritePayload: payload => payload,
  } });
  const sending = host.execute({ kind: 'prompt', text: 'old pending request' }, { onAccepted: () => accepted++ }).then(value => ({ value }), error => ({ error }));
  await entered;
  await host.execute({ kind: 'abort' });
  release();
  const result = await sending;
  t.diagnostic(JSON.stringify({ accepted, requests: f.http.requests.length, error: 'error' in result ? String(result.error) : undefined }));
  assert.equal(f.http.requests.length, 0, 'an explicit stop must prevent the already pending pre-admission input from starting a new provider request');
  assert.equal(accepted, 0, 'stopped pending input must not be acknowledged as accepted');
  await host.execute({ kind: 'prompt', text: 'new input after Stop' });
  assert.equal(f.http.requests.length, 1, 'a fresh input uses a new admission scope');
});

for (const kind of ['steer', 'follow-up'] as const) test(`independent: stop also invalidates ${kind} still preparing while the real lane is running`, async t => {
  let modelEntered!: () => void;
  const modelStarted = new Promise<void>(resolve => { modelEntered = resolve; });
  let finishModel!: () => void;
  const modelWaiting = new Promise<void>(resolve => { finishModel = resolve; });
  const f = await createLaneFixture(t, [{ type: 'text', text: 'working', beforeFinish: async () => { modelEntered(); await modelWaiting; } }]);
  let inputEntered!: () => void;
  const inputStarted = new Promise<void>(resolve => { inputEntered = resolve; });
  let finishInput!: () => void;
  const inputWaiting = new Promise<void>(resolve => { finishInput = resolve; });
  let captures = 0;
  let queuedAccepted = 0;
  const host = await f.openLane({ ...f.options, input: {
    capture: () => ({ approvalPolicy: { mode: 'step', spend: 'confirm' }, systemPrompt: `input-${++captures}` }),
    prepare: async context => { if (captures === 2) { inputEntered(); await inputWaiting; } return context; },
    activate: () => {}, providerContent: async message => message.content, rewritePayload: payload => payload,
  } });
  const running = host.execute({ kind: 'prompt', text: 'already running' }).then(value => ({ value }), error => ({ error }));
  await modelStarted;
  const queuing = host.execute({ kind, text: 'old pending follow-up' }, { onAccepted: () => queuedAccepted++ }).then(value => ({ value }), error => ({ error }));
  await inputStarted;
  await host.execute({ kind: 'abort' });
  finishModel();
  await running;
  finishInput();
  const queued = await queuing;
  t.diagnostic(JSON.stringify({ queuedAccepted, outcome: 'value' in queued ? queued.value : undefined, error: 'error' in queued ? String(queued.error) : undefined, projection: host.projection() }));
  assert.equal(queuedAccepted, 0, 'a pre-stop follow-up must not be accepted after stop already drained both queues');
});

test('F12: Stop cancels native skill-index refresh before a prompt can be accepted', async t => {
  const f = await createLaneFixture(t, []);
  let entered!: () => void, release!: () => void;
  const refreshing = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let pause = false;
  const host = await f.openLane({ ...f.options, native: { settingsRoot: f.projectDir, skills: async () => {
    if (pause) { entered(); await waiting; }
    return [];
  } } });
  let accepted = 0;
  pause = true;
  const input = host.execute({ kind: 'prompt', text: 'must not run' }, { onAccepted: () => accepted++ }).then(value => ({ value }), error => ({ error }));
  try {
    await refreshing;
    await host.execute({ kind: 'abort' });
    const result = await input;
    assert.ok('error' in result);
    assert.equal(accepted, 0);
    assert.equal(f.http.requests.length, 0);
  } finally { release(); }
});
