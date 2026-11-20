import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import sample from '../../shared/vector-avator/sample/usagi.vector.json';

const callTool = vi.fn();
vi.mock('../../server/anthropic', async (orig) => ({ ...(await orig<object>()), callTool: (...a: unknown[]) => callTool(...a) }));
import { drawVector } from '../../server/vector-draw';

const png = (w: number, h: number) => createCanvas(w, h).toBuffer('image/png');
const usage = { input_tokens: 10, output_tokens: 5 };
const answer = (input: object, id: string) => ({ input, toolUseId: id, message: { content: [{ type: 'tool_use', id, name: 'submit_vector', input }], usage } });
const broken = () => { const d = structuredClone(sample) as { parts: { id: string }[] }; d.parts = d.parts.filter((p) => p.id !== 'nose'); return d; };
const run = (maxRounds = 4) => drawVector({ name: 'Test', front: png(1024, 1536), faceSheet: png(1536, 1024), maxRounds });

beforeEach(() => callTool.mockReset());

describe('drawing loop', () => {
  it('sends errors and the check picture back, and stops when the model accepts a clean doc', async () => {
    callTool.mockResolvedValueOnce(answer({ doc: broken() }, 't1')).mockResolvedValueOnce(answer({ doc: sample }, 't2')).mockResolvedValueOnce(answer({ done: true }, 't3'));
    const r = await run();
    expect(r.rounds.map((x) => [x.errors.length > 0, x.done])).toEqual([[true, false], [false, false], [false, true]]);
    expect(r.doc).toEqual(sample);
    expect(r.errors).toEqual([]);
    // the second request carries the first round's tool result: the error list and the check picture
    const msgs = callTool.mock.calls[1][0].messages;
    const result = msgs[2].content[0];
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    expect(result.content[0].text).toContain('missing required part: nose');
    expect(result.content[1].type).toBe('image');
    // the system prompt carries the spec and the worked example
    expect(callTool.mock.calls[0][0].system).toContain('<parts-spec>');
    expect(callTool.mock.calls[0][0].system).toContain('"format":"so-chara-vector/1"');
  });

  it('refuses done while the last doc has errors, and keeps the best doc when rounds run out', async () => {
    callTool.mockResolvedValueOnce(answer({ doc: broken() }, 't1')).mockResolvedValueOnce(answer({ done: true }, 't2')).mockResolvedValueOnce(answer({ doc: { parts: [] } }, 't3'));
    const r = await run(3);
    expect(callTool).toHaveBeenCalledTimes(3);
    expect(callTool.mock.calls[2][0].messages.at(-1).content[0].content[0].text).toContain('Cannot finish');
    expect(r.doc).toEqual(broken());
    expect(r.errors).toContain('missing required part: nose');
  });
});
