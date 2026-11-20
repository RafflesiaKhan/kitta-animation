import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));
import { createApp } from '../../server/index';
import { autoTag } from '../../server/gemini';
import { recordGemini, recordOpenAI, recordUsage, resetUsage, usageReport } from '../../server/usage';

const app = createApp();
beforeEach(async () => {
  generateContent.mockReset();
  process.env.GEMINI_API_KEY = 'k';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await resetUsage();
});
afterEach(() => { delete process.env.GEMINI_API_KEY; vi.mocked(console.log).mockRestore(); });

describe('usage ledger', () => {
  it('maps Gemini usageMetadata, counting thinking tokens as output', () => {
    recordGemini('auto-tag', 'gemini-3.8-flash', { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 50, totalTokenCount: 200 });
    expect(console.log).toHaveBeenCalledWith('[usage] gemini gemini-3.8-flash auto-tag: 120 in + 80 out = 200 tokens');
  });
  it('maps both OpenAI usage shapes and keeps unreported calls as calls', async () => {
    recordOpenAI('image', 'gpt-image-2', { input_tokens: 50, output_tokens: 4000, total_tokens: 4050 });
    recordOpenAI('mouth', 'gpt-5-mini', { prompt_tokens: 900, completion_tokens: 40 });
    recordUsage({ provider: 'openai', model: 'gpt-4o-mini-tts', kind: 'voice', input: null, output: null });
    const r = await usageReport();
    expect(r.session).toEqual({ calls: 3, input: 950, output: 4040, total: 4990, unreported: 1 });
    expect(r.sessionRows.map((x) => [x.model, x.total])).toEqual([['gpt-image-2', 4050], ['gpt-5-mini', 940], ['gpt-4o-mini-tts', 0]]);
    expect(r.recent[0]).toMatchObject({ model: 'gpt-4o-mini-tts', total: null }); // newest first
  });
  it('records real calls with what the provider reported', async () => {
    generateContent.mockResolvedValue({ text: '[]', usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 8, totalTokenCount: 48 } });
    await autoTag(['hi']);
    const r = await usageReport();
    expect(r.recent[0]).toMatchObject({ provider: 'gemini', kind: 'auto-tag', input: 40, output: 8, total: 48 });
  });
  it('persists to the ledger file across reports and resets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kitta-usage-'));
    process.env.KITTA_USAGE_FILE = join(dir, 'usage.jsonl');
    try {
      recordUsage({ provider: 'gemini', model: 'm', kind: 'voice', input: 10, output: 90 });
      const r = await usageReport();
      expect(r.allTime.total).toBe(100);
      expect(JSON.parse(readFileSync(process.env.KITTA_USAGE_FILE, 'utf8').trim())).toMatchObject({ model: 'm', total: 100 });
      await resetUsage();
      expect((await usageReport()).allTime.calls).toBe(0);
    } finally {
      process.env.KITTA_USAGE_FILE = 'off';
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('serves and resets the report over the API', async () => {
    recordUsage({ provider: 'gemini', model: 'm', kind: 'image', input: 1, output: 2 });
    expect((await request(app).get('/api/usage')).body.session).toMatchObject({ calls: 1, total: 3 });
    expect((await request(app).delete('/api/usage')).status).toBe(204);
    expect((await request(app).get('/api/usage')).body.session.calls).toBe(0);
  });
});
