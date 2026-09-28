import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLaneApprovalGate } from '../../electron/agentLane/laneApprovalGate.js';
import { createLaneNativeApprovalResolver } from '../../electron/agentLane/laneNativeApproval.js';
import { LANE_CODING_TOOL_EFFECTS } from '../../electron/agentLane/laneCodingTools.mjs';

function gate(mode: 'safe-auto' | 'project' | 'step', sandboxActive = true, hasUserInterface = true) {
  return createLaneApprovalGate({ specs: [], policy: () => ({ mode, spend: 'confirm' }), hasUserInterface,
    resolveSubject: createLaneNativeApprovalResolver({ projectDir: '/project', sandboxActive, effects: LANE_CODING_TOOL_EFFECTS }) });
}

test('native read and project writes derive the existing safe-auto approval semantics', async () => {
  const instance = gate('safe-auto', true, false);
  for (const toolName of ['read', 'write', 'edit']) {
    assert.equal((await instance.preflight({ toolCallId: toolName, toolName, args: {} }, undefined)).decision, 'auto-granted');
  }
});

test('shell hard deny and mandatory confirmation survive project mode and earlier grants', async () => {
  const instance = gate('project');
  const denied = await instance.preflight({ toolCallId: 'secret', toolName: 'bash', args: { command: 'cat ~/.ssh/id_rsa' } }, undefined);
  assert.equal(denied.decision, 'denied-by-policy');
  const pending = instance.preflight({ toolCallId: 'publish', toolName: 'bash', args: { command: 'git push origin main' } }, undefined);
  assert.equal(instance.pending()?.grantable, false);
  assert.equal(instance.answer('publish', 'allow-session'), false);
  assert.equal(instance.answer('publish', 'allow-once'), true);
  assert.equal((await pending).decision, 'granted-once');
  const again = instance.preflight({ toolCallId: 'publish-again', toolName: 'bash', args: { command: 'git push origin main' } }, undefined);
  assert.equal(instance.pending()?.toolCallId, 'publish-again');
  instance.answer('publish-again', 'deny');
  assert.equal((await again).decision, 'denied');
});

test('sandbox unavailable does not auto-allow bash in any approval mode or without a window', async () => {
  for (const mode of ['safe-auto', 'project', 'step'] as const) {
    const instance = gate(mode, false);
    const pending = instance.preflight({ toolCallId: mode, toolName: 'bash', args: { command: 'echo fixture' } }, undefined);
    assert.equal(instance.pending()?.grantable, false);
    instance.answer(mode, 'deny');
    assert.equal((await pending).decision, 'denied');
    assert.equal((await gate(mode, false, false).preflight({ toolCallId: mode, toolName: 'bash', args: { command: 'echo fixture' } }, undefined)).decision, 'denied-by-policy');
  }
});

test('native resolver cannot make write tools available in ask work mode', async () => {
  const instance = createLaneApprovalGate({ specs: [], policy: () => ({ mode: 'project', spend: 'confirm' }), workMode: () => 'ask', hasUserInterface: true,
    resolveSubject: createLaneNativeApprovalResolver({ projectDir: '/project', sandboxActive: true, effects: LANE_CODING_TOOL_EFFECTS }) });
  assert.equal((await instance.preflight({ toolCallId: 'write', toolName: 'write', args: {} }, undefined)).decision, 'denied-by-policy');
  assert.equal((await instance.preflight({ toolCallId: 'read', toolName: 'read', args: {} }, undefined)).decision, 'auto-granted');
});


test('hard-list publication remains disallowed in edit-selection mode', async () => {
  const instance = createLaneApprovalGate({ specs: [], policy: () => ({ mode: 'project', spend: 'confirm' }),
    workMode: () => 'editSelection', hasUserInterface: true,
    resolveSubject: createLaneNativeApprovalResolver({ projectDir: '/project', sandboxActive: true, effects: LANE_CODING_TOOL_EFFECTS }) });
  assert.equal((await instance.preflight({ toolCallId: 'publish', toolName: 'bash', args: { command: 'git push origin main' } }, undefined)).decision, 'denied-by-policy');
});

// T-ED-02：工具回执要说真话，就得问得到「这一次到底是怎么过闸的」。
// 闸是这件事的唯一 owner；此前它根本不对外说，于是回执只能查一张静态表。
test('the gate remembers how each call actually passed, and forgets it when the host says so', async () => {
  const instance = gate('safe-auto');
  await instance.preflight({ toolCallId: 'read-1', toolName: 'read', args: {} }, undefined);
  assert.equal(instance.decisionFor('read-1'), 'auto-granted');

  const waiting = instance.preflight({ toolCallId: 'push-1', toolName: 'bash', args: { command: 'git push origin main' } }, undefined);
  instance.answer('push-1', 'allow-once');
  await waiting;
  assert.equal(instance.decisionFor('push-1'), 'granted-once');

  // 没进过闸的调用不许编一个结论出来：回执据此不提卡。
  assert.equal(instance.decisionFor('never-seen'), undefined);

  instance.forget('push-1');
  assert.equal(instance.decisionFor('push-1'), undefined);
});
