import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));
import { createApp } from '../../server/index';

const fixture = readFileSync(join(__dirname, '../fixtures/hello.wav'));
const app = createApp();
const L = (text: string, extra = {}) => ({ text, voice: 'Kore', expression: 'happy', gesture: 'wave', ...extra });

const speech = { candidates: [{ content: { parts: [{ inlineData: { data: fixture.toString('base64') } }] } }] };
beforeEach(() => { generateContent.mockReset(); process.env.GEMINI_API_KEY = 'test-key'; });
afterEach(() => { delete process.env.GEMINI_API_KEY; });

describe('POST /api/tts', () => {
  it('generates two lines with ordered timings and lipsync cues', async () => {
    generateContent.mockResolvedValue(speech);
    const r = await request(app).post('/api/tts').send({ lines: [L('Hi there'), L('Second <short pause> line', { expression: 'sad', gesture: 'nod' })] });
    expect(r.status).toBe(200);
    expect(r.body.lines).toHaveLength(2);
    expect(r.body.lines[1].startMs).toBeGreaterThanOrEqual(r.body.lines[0].endMs);
    expect(r.body.lines[1]).toMatchObject({ text: 'Second <short pause> line', expression: 'sad', gesture: 'nod' });
    expect(r.body.cues.length).toBeGreaterThan(0);
    expect(r.body.durationMs).toBe(r.body.lines[1].endMs);
    expect(generateContent).toHaveBeenCalledTimes(2);
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);

  it('rejects an empty line with its 1-based number', async () => {
    const r = await request(app).post('/api/tts').send({ lines: [L('ok'), L('   ')] });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Line 2 is empty' });
  });

  it('rejects bad input', async () => {
    const bad = [
      { lines: [] },
      { lines: Array.from({ length: 51 }, () => L('x')) },
      { lines: [L('x'.repeat(501))] },
      { lines: [L('x', { expression: 'bored' })] },
      { lines: [L('x', { gesture: 'dance' })] },
    ];
    for (const b of bad) {
      const r = await request(app).post('/api/tts').send(b);
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: 'Invalid request' });
    }
  });

  it('returns the missing-key error', async () => {
    delete process.env.GEMINI_API_KEY;
    const r = await request(app).post('/api/tts').send({ lines: [L('hi')] });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Gemini key missing — add GEMINI_API_KEY to .env' });
  });

  it('passes a 429 through with the friendly message', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));
    const r = await request(app).post('/api/tts').send({ lines: [L('hi')] });
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: 'Free Gemini limit reached, try again later' });
  });

  it('maps other Gemini failures to 502 and logs server-side', async () => {
    generateContent.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await request(app).post('/api/tts').send({ lines: [L('hi')] });
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: 'Voice generation failed. Please try again.' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
