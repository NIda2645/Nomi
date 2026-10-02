import { describe, expect, it } from 'vitest';
import type { RuntimeErrorFacts } from '../shared/agentCapabilities/transportContracts';
import { parseVendorErrorFromMessage } from '../../src/workbench/generationCanvas/runner/vendorErrorIpc';
import { describeRuntimeError } from './runtimeVendorError';

describe('pi transport error classification', () => {
  it('maps connection failure into the existing network contract, not a generic provider failure', () => {
    const error: RuntimeErrorFacts = { kind: 'network', message: 'fetch failed: UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error (timeout: 10000ms)',
      code: 'UND_ERR_CONNECT_TIMEOUT', url: 'https://fixture.invalid/v1/chat/completions' };
    const structured = parseVendorErrorFromMessage(describeRuntimeError(error, 'provider'));
    expect(structured).toMatchObject({ vendorKey: 'provider', category: 'network', retryable: true,
      url: 'https://fixture.invalid/v1/chat/completions', upstreamMsg: expect.stringContaining('UND_ERR_CONNECT_TIMEOUT') });
    expect(structured).not.toHaveProperty('httpStatus');
  });

  it.each([[401, 'auth'], [429, 'quota'], [500, 'server']] as const)('keeps HTTP %s separate from network errors', (status, category) => {
    const structured = parseVendorErrorFromMessage(describeRuntimeError({ kind: 'http', status,
      message: `HTTP ${status}`, body: '{"error":{"message":"upstream reason"}}' }, 'provider'));
    expect(structured).toMatchObject({ httpStatus: status, category });
  });

  // 第三条把上游失败带过 IPC 的通道（另两条：vendorHttp 的媒体请求、aiSdkVendorError 的文本请求）也带上游自己的码：
  // 模型下线的 400 只靠状态码会被说成「参数不被接受」。
  it('carries the upstream error code the vendor itself gave, next to its message', () => {
    const structured = parseVendorErrorFromMessage(describeRuntimeError({ kind: 'http', status: 400,
      message: 'HTTP 400', body: '{"error":{"message":"The requested model is not available right now.","code":"model_not_found"}}' }, 'provider'));
    expect(structured).toMatchObject({ httpStatus: 400, category: 'input', upstreamCode: 'model_not_found', upstreamMsg: 'The requested model is not available right now.' });
  });

  it('does not invent a code when the body has none (or has a sentence where a code should be)', () => {
    const none = parseVendorErrorFromMessage(describeRuntimeError({ kind: 'http', status: 400, message: 'HTTP 400', body: '{"error":{"message":"bad request"}}' }, 'provider'));
    const sentence = parseVendorErrorFromMessage(describeRuntimeError({ kind: 'http', status: 400, message: 'HTTP 400', body: '{"error":{"message":"bad request","code":"this is a whole sentence, not a code"}}' }, 'provider'));
    expect(none).not.toHaveProperty('upstreamCode');
    expect(sentence).not.toHaveProperty('upstreamCode');
  });

  it('does not turn caller cancellation into a retryable vendor error', () => {
    const message = describeRuntimeError({ kind: 'abort', message: 'User cancelled' }, 'provider');
    expect(message).toBe('User cancelled');
    expect(parseVendorErrorFromMessage(message)).toBeNull();
  });
});
