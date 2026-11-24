import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));
import { createApp } from '../../server/index';
import { resetAuthStateForTests } from '../../server/auth';
import { resetSettingsCache, setSettingsFileForTests } from '../../server/settings';
import { autoTag } from '../../server/gemini';
import { recordAnthropic, recordGemini, recordOpenAI, recordUsage, resetUsage, usageHistory, usageReport } from '../../server/usage';
import { costOf } from '../../shared/prices';

describe('prices', () => {
  it('uses the dated period in force (Gemini 3.8 doubles on 2027-01-01) and has no price for unknown models', () => {
    expect(costOf('gemini', 'gemini-3.8-flash', { input: 1e6, output: 1e6 }, new Date('2026-12-31T23:00:00Z'))).toBeCloseTo(0.75 + 3.75, 9);
    expect(costOf('gemini', 'gemini-3.8-flash', { input: 1e6, output: 1e6 }, new Date('2027-01-01T01:00:00Z'))).toBeCloseTo(1.5 + 7.5, 9);
    expect(costOf('openai', 'gpt-9', { input: 1 })).toBeNull();
  });
});

const app = createApp();
let settingsDir = '';
beforeEach(async () => {
  generateContent.mockReset();
  process.env.GEMINI_API_KEY = 'k';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  settingsDir = mkdtempSync(join(tmpdir(), 'kitta-usage-settings-'));
  setSettingsFileForTests(join(settingsDir, 'settings.json'));
  resetAuthStateForTests();
  await resetUsage();
});
afterEach(() => { delete process.env.GEMINI_API_KEY; vi.mocked(console.log).mockRestore(); resetSettingsCache(); rmSync(settingsDir, { recursive: true, force: true }); });

describe('usage ledger', () => {
  it('maps Gemini usageMetadata, counting thinking tokens as output', () => {
    recordGemini('auto-tag', 'gemini-3.8-flash', { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 50, totalTokenCount: 200 });
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\[usage\] gemini gemini-3\.8-flash auto-tag: 120 in \+ 80 out = 200 tokens, \$0\.\d{4}$/));
  });
  it('prices each call when it is recorded, from the provider breakdown', async () => {
    vi.useFakeTimers({ now: new Date('2026-12-01T12:00:00Z'), toFake: ['Date'] });
    try {
      // gpt-image-2: text in $5, image in $8, image out $30 per 1M
      recordOpenAI('image', 'gpt-image-2', { input_tokens: 4506, input_tokens_details: { image_tokens: 1024, text_tokens: 3482 }, output_tokens: 343, output_tokens_details: { image_tokens: 343 } });
      // Claude Opus 5.5: in $4, cache read $0.20, 1-hour cache write $8, out $20 per 1M
      recordAnthropic('draw', 'claude-opus-5-5', { input_tokens: 10, cache_read_input_tokens: 60000, cache_creation_input_tokens: 5000, cache_creation: { ephemeral_1h_input_tokens: 5000 }, output_tokens: 1000 });
      // Gemini image model: image output $30, text output $7.50 per 1M
      recordGemini('image', 'gemini-nano-banana-2.1', { promptTokenCount: 100, candidatesTokenCount: 1140, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1120 }, { modality: 'TEXT', tokenCount: 20 }], totalTokenCount: 1240 });
      recordUsage({ provider: 'openai', model: 'gpt-4o-mini-tts', kind: 'voice', input: null, output: null });
      recordUsage({ provider: 'gemini', model: 'not-a-priced-model', kind: 'voice', input: 5, output: 5 });
      const costs = (await usageReport()).recent.map((e) => e.cost);
      expect(costs[4]).toBeCloseTo((3482 * 5 + 1024 * 8 + 343 * 30) / 1e6, 9);
      expect(costs[3]).toBeCloseTo((10 * 4 + 60000 * 0.2 + 5000 * 8 + 1000 * 20) / 1e6, 9);
      expect(costs[2]).toBeCloseTo((100 * 1.5 + 1120 * 30 + 20 * 7.5) / 1e6, 9);
      expect(costs.slice(0, 2)).toEqual([null, null]); // no price; no tokens reported
      const s = (await usageReport()).session;
      expect(s).toMatchObject({ calls: 5, unpriced: 2, estimated: 0 });
      expect(s.cost).toBeCloseTo(costs[2]! + costs[3]! + costs[4]!, 9);
    } finally {
      vi.useRealTimers();
    }
  });
  it('estimates ledger lines written before costs were tracked from input/output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kitta-usage-'));
    process.env.KITTA_USAGE_FILE = join(dir, 'usage.jsonl');
    try {
      writeFileSync(process.env.KITTA_USAGE_FILE, `${JSON.stringify({ at: '2026-11-14T23:15:01.555Z', provider: 'openai', model: 'gpt-5-mini', kind: 'mouth', input: 1000000, output: 1000000, total: 2000000 })}\n`);
      const r = await usageReport();
      expect(r.allTime).toMatchObject({ calls: 1, estimated: 1, unpriced: 0 });
      expect(r.allTime.cost).toBeCloseTo(0.25 + 2, 9);
    } finally {
      process.env.KITTA_USAGE_FILE = 'off';
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('maps both OpenAI usage shapes and keeps unreported calls as calls', async () => {
    recordOpenAI('image', 'gpt-image-2', { input_tokens: 50, output_tokens: 4000, total_tokens: 4050 });
    recordOpenAI('mouth', 'gpt-5-mini', { prompt_tokens: 900, completion_tokens: 40 });
    recordUsage({ provider: 'openai', model: 'gpt-4o-mini-tts', kind: 'voice', input: null, output: null });
    const r = await usageReport();
    expect(r.session).toMatchObject({ calls: 3, input: 950, output: 4040, total: 4990, unreported: 1 });
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
    const admin = request.agent(app);
    await admin.post('/api/auth/setup').send({ password: 'usage-test-password' }).expect(201);
    expect((await admin.delete('/api/usage')).status).toBe(204);
    expect((await request(app).get('/api/usage')).body.session.calls).toBe(0);
  });

  it('groups the last days by provider, model, use, and estimates old lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kitta-history-'));
    process.env.KITTA_USAGE_FILE = join(dir, 'usage.jsonl');
    vi.useFakeTimers({ now: new Date('2026-11-24T12:00:00Z'), toFake: ['Date'] });
    try {
      writeFileSync(process.env.KITTA_USAGE_FILE, `${JSON.stringify({ at: '2026-11-23T12:00:00.000Z', provider: 'openai', model: 'gpt-5-mini', kind: 'mouth', input: 100, output: 50, total: 150 })}\n`);
      recordUsage({ provider: 'gemini', model: 'gemini-3.8-flash', kind: 'voice', input: 10, output: 20 });
      const result = await usageHistory(3);
      expect(result.days.map((d) => d.date)).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);
      expect(result.days[0]?.tokens).toBe(0);
      expect(result.days[1]?.providers.openai.tokens).toBe(150);
      expect(result.days[1]?.providers.openai.estimated).toBe(true);
      expect(result.rows).toEqual(expect.arrayContaining([expect.objectContaining({ provider: 'openai', model: 'gpt-5-mini', total: 150, estimated: 1 })]));
      expect(result.kindRows).toEqual(expect.arrayContaining([expect.objectContaining({ provider: 'openai', kind: 'mouth', calls: 1 })]));
      expect(result.totals.calls).toBe(2);
    } finally {
      vi.useRealTimers();
      process.env.KITTA_USAGE_FILE = 'off';
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('protects usage history with the same admin session as settings', async () => {
    expect((await request(app).get('/api/usage/history?days=3')).status).toBe(401);
    const admin = request.agent(app);
    await admin.post('/api/auth/setup').send({ password: 'usage-history-password' }).expect(201);
    expect((await admin.get('/api/usage/history?days=3')).status).toBe(200);
  });
});
