import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openaiToolChat } from '../../server/openai';
import { resetUsage } from '../../server/usage';

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tool = { name: 'submit_vector', description: 'Submit.', parameters: { properties: { doc: { type: 'object' } } } };
const usage = { input_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens: 200, total_tokens: 1200 };
const done = (id: string, call: string) => json({ id, status: 'completed', usage, output: [{ type: 'reasoning' }, { type: 'function_call', name: 'submit_vector', call_id: call, arguments: '{"doc":{"parts":[]}}' }] });

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  process.env.OPENAI_API_KEY = 'sk-test';
  await resetUsage();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete process.env.OPENAI_API_KEY; });

describe('OpenAI drawing chat', () => {
  it('runs in background mode, polls until done, and continues with previous_response_id', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'resp_1', status: 'queued' }))
      .mockResolvedValueOnce(json({ id: 'resp_1', status: 'in_progress' }))
      .mockResolvedValueOnce(done('resp_1', 'call_1'))
      .mockResolvedValueOnce(done('resp_2', 'call_2'));
    const chat = openaiToolChat('Call submit_vector.', tool, 'gpt-6.2-astra');
    const first = chat.send([{ type: 'text', text: 'Draw.' }, { type: 'image', png: Buffer.from('png') }]);
    await vi.runAllTimersAsync();
    const r = await first;
    expect(r.input).toEqual({ doc: { parts: [] } });
    // 600 new input at $8, 400 cached at $0.40, 200 output at $40 per 1M
    expect(r.usage).toMatchObject({ provider: 'openai', model: 'gpt-6.2-astra', kind: 'draw', input: 1000, output: 200 });
    expect(r.usage.cost).toBeCloseTo((600 * 8 + 400 * 0.4 + 200 * 40) / 1e6, 9);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'gpt-6.2-astra', instructions: 'Call submit_vector.', background: true, store: true, tool_choice: { type: 'function', name: 'submit_vector' } });
    expect(body.previous_response_id).toBeUndefined();
    expect(body.input[0].content[1]).toEqual({ type: 'input_image', image_url: `data:image/png;base64,${Buffer.from('png').toString('base64')}`, detail: 'high' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.openai.com/v1/responses/resp_1');

    await chat.send([{ type: 'text', text: 'Errors: none' }, { type: 'image', png: Buffer.from('sheet') }]);
    const next = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(next.previous_response_id).toBe('resp_1');
    expect(next.input[0]).toEqual({ type: 'function_call_output', call_id: 'call_1', output: 'Errors: none' });
    expect(next.input[1].content[1].type).toBe('input_image');
  });

  it('fails when the response does not complete', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'resp_1', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage }));
    await expect(openaiToolChat('s', tool).send([{ type: 'text', text: 'x' }])).rejects.toMatchObject({ code: 'timed_out' });
  });
});

describe('OpenAI drawing chat retries', () => {
  it('sends the same request again when the background job fails as overloaded', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'resp_1', status: 'failed', error: { type: 'service_unavailable_error', code: 'server_is_overloaded', headers: { 'retry-after-ms': '6000' } } }))
      .mockResolvedValueOnce(done('resp_2', 'call_2'));
    const p = openaiToolChat('s', tool).send([{ type: 'text', text: 'x' }]);
    await vi.runAllTimersAsync();
    expect((await p).input).toEqual({ doc: { parts: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });
});

describe('OpenAI drawing chat cancel', () => {
  it('stops polling and cancels the background job on OpenAI when the signal aborts', async () => {
    fetchMock.mockImplementation(async (url: string) => (String(url).endsWith('/cancel') ? json({ id: 'resp_1', status: 'cancelled' }) : json({ id: 'resp_1', status: 'in_progress' })));
    const ac = new AbortController();
    const p = openaiToolChat('s', tool).send([{ type: 'text', text: 'x' }], ac.signal);
    const caught = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(6_000);
    ac.abort();
    await vi.advanceTimersByTimeAsync(6_000);
    expect((await caught).name).toBe('AbortError');
    expect(fetchMock.mock.calls.some(([u, init]) => u === 'https://api.openai.com/v1/responses/resp_1/cancel' && init.method === 'POST')).toBe(true);
  });
});
