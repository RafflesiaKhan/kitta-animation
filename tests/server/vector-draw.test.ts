import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import sample from '../../shared/vector-avator/sample/usagi.vector.json';
import { drawVector } from '../../server/vector-draw';
import type { ChatBlock, ToolChat } from '../../server/tool-chat';
import type { UsageEntry } from '../../shared/usage';

const png = (w: number, h: number) => createCanvas(w, h).toBuffer('image/png');
const usage: UsageEntry = { at: '', provider: 'anthropic', model: 'm', kind: 'draw', input: 10, output: 5, total: 15, cost: 0.001 };
const send = vi.fn<(b: ChatBlock[]) => Promise<{ input: unknown; usage: UsageEntry }>>();
const answer = (input: object) => ({ input, usage });
const chat = (s: string): ToolChat => { system = s; return { provider: 'anthropic', model: 'fake', send }; };
let system = '';
const broken = () => { const d = structuredClone(sample) as { parts: { id: string }[] }; d.parts = d.parts.filter((p) => p.id !== 'nose'); return d; };
const run = (maxRounds = 4) => drawVector({ name: 'Test', front: png(1024, 1536), faceSheet: png(1536, 1024), maxRounds, chat });
const text = (blocks: ChatBlock[]) => blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');

beforeEach(() => send.mockReset());

describe('drawing loop', () => {
  it('sends errors and the check picture back, and stops when the model accepts a clean doc', async () => {
    send.mockResolvedValueOnce(answer({ doc: broken() })).mockResolvedValueOnce(answer({ doc: sample })).mockResolvedValueOnce(answer({ done: true }));
    const r = await run();
    expect(r.rounds.map((x) => [x.errors.length > 0, x.done])).toEqual([[true, false], [false, false], [false, true]]);
    expect(r.doc).toEqual(sample);
    expect(r.errors).toEqual([]);
    expect(r.rounds[0].usage.cost).toBe(0.001);
    // the first send has the three pictures; the second carries the first round's errors and check picture
    expect(send.mock.calls[0][0].filter((b) => b.type === 'image')).toHaveLength(3);
    expect(text(send.mock.calls[1][0])).toContain('missing required part: nose');
    expect(send.mock.calls[1][0].some((b) => b.type === 'image')).toBe(true);
    // the system prompt carries the spec and the worked example
    expect(system).toContain('<parts-spec>');
    expect(system).toContain('"format":"so-chara-vector/1"');
  });

  it('refuses done while the last doc has errors, and keeps the best doc when rounds run out', async () => {
    send.mockResolvedValueOnce(answer({ doc: broken() })).mockResolvedValueOnce(answer({ done: true })).mockResolvedValueOnce(answer({ doc: { parts: [] } }));
    const r = await run(3);
    expect(send).toHaveBeenCalledTimes(3);
    expect(text(send.mock.calls[2][0])).toContain('Cannot finish');
    expect(r.doc).toEqual(broken());
    expect(r.errors).toContain('missing required part: nose');
  });
});
