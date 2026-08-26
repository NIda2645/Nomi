import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { createHttpFixture } from '../tests/httpFixture.js';
import { createControlledSession, type ControlledSessionOptions } from './session.js';
import { exportSnapshot, importSnapshot } from './snapshot.js';

interface ElectronProbeContext {
  isolatedRoot: string;
  appPath: string;
  packaged: boolean;
}

const hostToolName = 'nomi_probe_echo';
const toolCallId = 'call_nomi_pi_probe';
const toolResultText = 'NOMI_PI_HOST_RESULT';
const initialText = 'NOMI_PI_INITIAL_TEXT';
const finalText = 'NOMI_PI_FINAL_TEXT';
const restoredText = '恢复成功';
const systemPrompt = 'Nomi R0 compatibility probe. Only the explicitly supplied host tool is available.';

/** Invoked only by the isolated Electron executable, never by the Nomi app. */
export async function runElectronProbe(context: ElectronProbeContext, nativeSdkFactory: unknown) {
  // The CJS host must have used native import(), and both module graphs must agree.
  assert.equal(nativeSdkFactory, createAgentSession);
  const packageIds = ['@earendil-works/pi-coding-agent', '@earendil-works/pi-agent-core',
    '@earendil-works/pi-ai', 'typebox', 'zod', 'zod-to-json-schema'];
  const entries = Object.fromEntries(packageIds.map((id) => [id, fileURLToPath(import.meta.resolve(id))]));
  if (context.packaged) {
    assert.ok(context.appPath.endsWith(`${sep}app.asar`));
    for (const path of Object.values(entries)) {
      assert.ok(path.startsWith(context.appPath + sep), `SDK dependency escaped the ASAR: ${path}`);
    }
  }
  const versions = Object.fromEntries(await Promise.all(packageIds.slice(0, 3).map(async (id) => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.resolve(id)), 'utf8'));
    assert.equal(manifest.version, '0.84.3', `Unexpected SDK version for ${id}`);
    return [id, manifest.version as string];
  })));

  const sessionRoot = await mkdtemp(join(context.isolatedRoot, 'session-'));
  const cwd = join(sessionRoot, 'project');
  const agentDir = join(sessionRoot, 'agent');
  let http: Awaited<ReturnType<typeof createHttpFixture>> | undefined;
  let controlled: Awaited<ReturnType<typeof createControlledSession>> | undefined;
  let restored: Awaited<ReturnType<typeof createControlledSession>> | undefined;
  let hostToolCalls = 0;
  try {
    await Promise.all([mkdir(cwd), mkdir(agentDir)]);
    http = await createHttpFixture([
      { type: 'text', text: initialText },
      { type: 'tool', calls: [{ id: toolCallId, name: hostToolName, arguments: { value: 'approved-input' } }] },
      { type: 'text', text: finalText },
    ]);
    const options: ControlledSessionOptions = { cwd, agentDir, systemPrompt,
      model: { kind: 'openai-compatible', providerId: 'nomi-electron-probe',
        modelId: 'nomi-r0-local-model', baseURL: http.baseURL,
        authType: 'api-key', apiKey: 'nomi-pi-probe-not-a-real-key' },
      tools: [{ name: hostToolName, description: 'Return one approved Nomi host result.',
        schema: z.object({ value: z.literal('approved-input') }).strict(),
        execute: async (args, call) => {
          assert.deepEqual(args, { value: 'approved-input' });
          assert.equal(call.toolCallId, toolCallId);
          assert.equal(call.signal.aborted, false);
          hostToolCalls += 1;
          return { status: 'ok', content: [{ type: 'text', text: toolResultText }] };
        } }],
    };
    controlled = await createControlledSession(options);
    const { session } = controlled;
    assert.deepEqual(session.getActiveToolNames(), [hostToolName]);
    assert.deepEqual(session.resourceLoader.getAgentsFiles().agentsFiles, []);
    assert.deepEqual(session.resourceLoader.getSkills().skills, []);
    assert.deepEqual(session.resourceLoader.getExtensions().extensions, []);
    await session.prompt('Return the initial probe text.');
    assert.equal(http.requests.length, 1);
    const initial = session.messages.at(-1);
    assert.ok(initial?.role === 'assistant');
    assert.deepEqual(initial.content.filter((item) => item.type === 'text'), [{ type: 'text', text: initialText }]);
    await session.prompt('Use the approved host tool once, then return the final probe text.');
    assert.equal(http.requests.length, 3);
    assert.equal(hostToolCalls, 1);
    for (const request of http.requests) {
      assert.equal(request.path, '/v1/chat/completions');
      assert.equal(request.body.model, 'nomi-r0-local-model');
      assert.equal(request.headers.authorization, 'Bearer nomi-pi-probe-not-a-real-key');
      const messages = request.body.messages as Array<Record<string, unknown>>;
      assert.deepEqual(messages[0], { role: 'system', content: systemPrompt });
      const tools = request.body.tools as Array<{ function: { name: string } }>;
      assert.deepEqual(tools.map((tool) => tool.function.name), [hostToolName]);
    }
    const results = session.messages.filter((message) => message.role === 'toolResult');
    assert.equal(results.length, 1);
    assert.equal(results[0].toolCallId, toolCallId);
    assert.equal(results[0].toolName, hostToolName);
    assert.equal(results[0].isError, false);
    assert.deepEqual(results[0].content, [{ type: 'text', text: toolResultText }]);
    const final = session.messages.at(-1);
    assert.ok(final?.role === 'assistant');
    assert.deepEqual(final.content.filter((item) => item.type === 'text'), [{ type: 'text', text: finalText }]);
    const wireResults = (http.requests[2].body.messages as Array<Record<string, unknown>>)
      .filter((message) => message.role === 'tool');
    assert.equal(wireResults.length, 1);
    assert.equal(wireResults[0].tool_call_id, toolCallId);
    const wireContent = wireResults[0].content;
    const wireText = typeof wireContent === 'string' ? wireContent
      : (wireContent as Array<{ type: string; text?: string }>).map((item) => item.text ?? '').join('');
    assert.equal(wireText, toolResultText);
    assert.deepEqual(await readdir(cwd), [], 'The host tool must not write project files');
    assert.deepEqual(await readdir(agentDir), [], 'The SDK must not persist user settings');
    await controlled.stop();
    assert.equal(session.isStreaming, false);
    const serialized = exportSnapshot(session);
    const scratch = join(sessionRoot, 'snapshot-scratch');
    await mkdir(scratch);
    const sessionManager = await importSnapshot(serialized, { cwd, tempRoot: scratch });
    assert.deepEqual(await readdir(scratch), [], 'The public JSONL loader must remove its temporary file');
    restored = await createControlledSession({ ...options, sessionManager });
    http.push({ type: 'text', text: restoredText });
    await restored.session.prompt('Continue from the restored working context.');
    assert.equal(http.requests.length, 4);
    assert.equal(hostToolCalls, 1, 'Restoring context must not replay the host side effect');
    const restoredResult = restored.session.messages.filter((message) => message.role === 'toolResult');
    // JSON has no undefined-valued object members (pi adds optional usage: undefined).
    assert.deepEqual(restoredResult, JSON.parse(JSON.stringify(results)),
      'The restored context must retain the exact serializable tool result');
    const restoredFinal = restored.session.messages.at(-1);
    assert.ok(restoredFinal?.role === 'assistant');
    assert.deepEqual(restoredFinal.content.filter((item) => item.type === 'text'), [{ type: 'text', text: restoredText }]);
    const restoredWireResults = (http.requests[3].body.messages as Array<Record<string, unknown>>)
      .filter((message) => message.role === 'tool');
    assert.deepEqual(restoredWireResults, wireResults, 'The resumed model request must receive the original tool result');
    assert.equal(http.requests[3].path, '/v1/chat/completions');
    assert.equal(http.requests[3].body.model, 'nomi-r0-local-model');
    assert.deepEqual(restored.session.getActiveToolNames(), [hostToolName]);
    await restored.stop();
    assert.equal(restored.session.isStreaming, false);
  } finally {
    try {
      await restored?.dispose();
    } finally {
      try { await controlled?.dispose(); }
      finally {
        try { await http?.close(); }
        finally { await rm(sessionRoot, { recursive: true, force: true }); }
      }
    }
  }
  return { versions, entries, session: { requests: http?.requests.length, hostToolCalls,
    toolResult: toolResultText, finalText, restoredText, snapshotRestored: true,
    activeTools: [hostToolName], disposed: true } };
}
