import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicError, callTool, imageBlock } from '../../server/anthropic';
import { resetUsage, usageReport } from '../../server/usage';

const fetchMock = vi.fn();
const tool = { name: 'submit_vector', description: 'Submit the drawing.', input_schema: { type: 'object' as const, properties: { doc: { type: 'object' } }, required: ['doc'] } };

/** A streamed Messages response, as server-sent events. */
function sse(content: 'tool' | 'text', stopReason = content === 'tool' ? 'tool_use' : 'end_turn') {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const block = content === 'tool'
    ? [ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'submit_vector', input: {} } }),
      ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{"doc": {"parts"' } }),
      ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: ': []}}' } })]
    : [ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Here it is.' } })];
  const body = [
    ev('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 1 } } }),
    ...block,
    ev('content_block_stop', { index: 0 }),
    ev('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 50 } }),
    ev('message_stop', {}),
  ].join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const call = () => callTool({ system: 'Call submit_vector.', messages: [{ role: 'user', content: [imageBlock(Buffer.from('png')), { type: 'text', text: 'Draw.' }] }], tool });

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  await resetUsage();
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_MODEL; });

describe('Claude provider', () => {
  it('needs a key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(call()).rejects.toMatchObject({ code: 'no_key' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams a request with the image and tool, and returns the tool input', async () => {
    fetchMock.mockResolvedValue(sse('tool'));
    process.env.ANTHROPIC_MODEL = 'claude-opus-5-5';
    const r = await call();
    expect(r.input).toEqual({ doc: { parts: [] } });
    expect(r.toolUseId).toBe('toolu_1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/v1/messages');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'claude-opus-5-5', stream: true, fallbacks: 'default', tool_choice: { type: 'auto' }, output_config: { effort: 'high' } });
    expect(body.tools[0]).toMatchObject({ name: 'submit_vector', eager_input_streaming: true });
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from('png').toString('base64') } });
  });

  it('records tokens, counting cache reads and writes as input', async () => {
    fetchMock.mockResolvedValue(sse('tool'));
    await call();
    const [row] = (await usageReport()).sessionRows;
    expect(row).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5', input: 150, output: 50, total: 200 });
  });

  it('reports an answer without the tool call, a cut-off answer and a refusal', async () => {
    fetchMock.mockResolvedValueOnce(sse('text'));
    await expect(call()).rejects.toMatchObject({ code: 'no_tool' });
    fetchMock.mockResolvedValueOnce(sse('tool', 'max_tokens'));
    await expect(call()).rejects.toMatchObject({ code: 'too_long' });
    fetchMock.mockResolvedValueOnce(sse('text', 'refusal'));
    await expect(call()).rejects.toMatchObject({ code: 'refused' });
  });

  it('maps a bad key', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } }));
    const e = await call().catch((x) => x);
    expect(e).toBeInstanceOf(AnthropicError);
    expect(e.code).toBe('bad_key');
  });
});
