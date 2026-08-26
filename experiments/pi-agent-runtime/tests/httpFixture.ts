import { createServer, type IncomingHttpHeaders } from 'node:http';
import { once } from 'node:events';

export interface CapturedRequest {
  path: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

export type FixtureReply =
  | { type: 'text'; text: string }
  | { type: 'tool'; calls: Array<{ id: string; name: string; arguments: unknown }> }
  | { type: 'error'; status: number; message: string };

/** A real HTTP endpoint: only the remote model is simulated, never the SDK loop. */
export async function createHttpFixture(initialReplies: FixtureReply[] = []) {
  const requests: CapturedRequest[] = [];
  const replies = [...initialReplies];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    requests.push({ path: request.url ?? '', headers: request.headers, body });
    const reply = replies.shift();
    if (!reply || reply.type === 'error') {
      response.writeHead(reply?.status ?? 500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: reply?.message ?? 'No fixture reply queued' } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
    const send = (data: unknown) => response.write(`data: ${JSON.stringify(data)}\n\n`);
    const pathname = new URL(request.url ?? '/', 'http://fixture').pathname;
    if (pathname.endsWith('/messages')) {
      const event = (type: string, value: Record<string, unknown>) => {
        response.write(`event: ${type}\n`);
        send({ type, ...value });
      };
      event('message_start', { message: { id: `msg-${requests.length}`, type: 'message',
        role: 'assistant', model: body.model, content: [], stop_reason: null,
        stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
      const blocks = reply.type === 'text' ? [{ type: 'text', text: reply.text }]
        : reply.calls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments }));
      blocks.forEach((block, index) => {
        event('content_block_start', { index, content_block: block.type === 'text'
          ? { type: 'text', text: '' } : { ...block, input: {} } });
        event('content_block_delta', { index, delta: block.type === 'text'
          ? { type: 'text_delta', text: 'text' in block ? block.text : '' }
          : { type: 'input_json_delta', partial_json: JSON.stringify('input' in block ? block.input : {}) } });
        event('content_block_stop', { index });
      });
      event('message_delta', { delta: { stop_reason: reply.type === 'tool' ? 'tool_use' : 'end_turn',
        stop_sequence: null }, usage: { output_tokens: 4 } });
      event('message_stop', {});
      response.end();
      return;
    }
    if (pathname.endsWith('/responses')) {
      let sequence = 0;
      const event = (type: string, value: Record<string, unknown>) => send({ type,
        sequence_number: sequence++, ...value });
      const id = `resp-${requests.length}`;
      event('response.created', { response: { id, status: 'in_progress', output: [] } });
      const items = reply.type === 'text'
        ? [{ id: `msg-${requests.length}`, type: 'message', role: 'assistant', status: 'completed',
            content: [{ type: 'output_text', text: reply.text, annotations: [] }] }]
        : reply.calls.map((call) => ({ id: `fc_${call.id}`, type: 'function_call', status: 'completed',
            call_id: call.id, name: call.name, arguments: JSON.stringify(call.arguments) }));
      items.forEach((item, output_index) => {
        event('response.output_item.added', { output_index, item: { ...item, status: 'in_progress',
          ...(item.type === 'message' ? { content: [] } : { arguments: '' }) } });
        if (reply.type === 'text') {
          event('response.output_text.delta', { output_index, content_index: 0, item_id: item.id, delta: reply.text });
        } else {
          event('response.function_call_arguments.delta', { output_index, item_id: item.id,
            delta: JSON.stringify(reply.calls[output_index].arguments) });
        }
        event('response.output_item.done', { output_index, item });
      });
      event('response.completed', { response: { id, status: 'completed', output: items,
        usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14,
          input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } });
      response.end();
      return;
    }
    const delta = reply.type === 'text'
      ? { role: 'assistant', content: reply.text }
      : { role: 'assistant', tool_calls: reply.calls.map((call, index) => ({
          index, id: call.id, type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })) };
    send({ id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1,
      model: body.model, choices: [{ index: 0, delta, finish_reason: null }] });
    send({ id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1,
      model: body.model, choices: [{ index: 0, delta: {},
        finish_reason: reply.type === 'tool' ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } });
    response.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected an ephemeral TCP address');
  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    requests,
    push: (...next: FixtureReply[]) => { replies.push(...next); },
    close: () => new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
