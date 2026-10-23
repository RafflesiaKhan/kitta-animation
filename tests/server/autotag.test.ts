import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const generateContent = vi.fn();
const made: string[] = []; // temp dirs created by audio.ts, recorded so each can be checked individually
vi.mock('node:fs/promises', async (orig) => {
  const real = await orig<typeof import('node:fs/promises')>();
  return { ...real, mkdtemp: async (...a: Parameters<typeof real.mkdtemp>) => { const d = await real.mkdtemp(...a); made.push(d); return d; } };
});
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));
import { autoTag, transcribe, GeminiError } from '../../server/gemini';
import { createApp } from '../../server/index';

const json = (v: unknown) => ({ text: typeof v === 'string' ? v : JSON.stringify(v) });
const wav = join(__dirname, '../fixtures/hello.wav');
const app = createApp();

beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key'; generateContent.mockReset(); });
afterEach(() => { delete process.env.GEMINI_API_KEY; });

describe('autoTag', () => {
  it('uses structured JSON output constrained to the enums', async () => {
    generateContent.mockResolvedValue(json([{ expression: 'happy', gesture: 'wave' }, { expression: 'sad', gesture: 'none' }]));
    const tags = await autoTag(['Hi!', 'Oh no']);
    expect(tags).toEqual([{ expression: 'happy', gesture: 'wave' }, { expression: 'sad', gesture: 'none' }]);
    const arg = generateContent.mock.calls[0][0];
    expect(arg.config.responseMimeType).toBe('application/json');
    expect(JSON.stringify(arg.config.responseSchema)).toContain('surprised');
    expect(JSON.stringify(arg.config.responseSchema)).toContain('lookDown');
    expect(arg.contents).toContain('1. Hi!');
    expect(arg.contents).toContain('2. Oh no');
  });

  it('coerces values outside the lists to neutral/none', async () => {
    generateContent.mockResolvedValue(json([{ expression: 'excited', gesture: 'jump' }, null, { expression: 'angry' }]));
    expect(await autoTag(['a', 'b', 'c'])).toEqual([
      { expression: 'neutral', gesture: 'none' }, { expression: 'neutral', gesture: 'none' }, { expression: 'angry', gesture: 'none' },
    ]);
  });

  it('pads missing items and truncates extras', async () => {
    generateContent.mockResolvedValue(json([{ expression: 'happy', gesture: 'nod' }]));
    expect(await autoTag(['a', 'b', 'c'])).toEqual([
      { expression: 'happy', gesture: 'nod' }, { expression: 'neutral', gesture: 'none' }, { expression: 'neutral', gesture: 'none' },
    ]);
    generateContent.mockResolvedValue(json([{ expression: 'sad' }, { expression: 'sad' }, { expression: 'sad' }]));
    expect(await autoTag(['a'])).toHaveLength(1);
  });

  it('returns all neutral/none on malformed JSON, and [] for no texts without calling the API', async () => {
    generateContent.mockResolvedValue(json('not json {'));
    expect(await autoTag(['a', 'b'])).toEqual(Array(2).fill({ expression: 'neutral', gesture: 'none' }));
    generateContent.mockReset();
    expect(await autoTag([])).toEqual([]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('maps no key, 429 (status or code) and other failures', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('q'), { code: 429 }));
    await expect(autoTag(['a'])).rejects.toMatchObject({ code: 'rate_limited' });
    generateContent.mockRejectedValue(new Error('boom'));
    await expect(autoTag(['a'])).rejects.toMatchObject({ code: 'failed' });
    delete process.env.GEMINI_API_KEY;
    await expect(autoTag(['a'])).rejects.toBeInstanceOf(GeminiError);
  });

  it('maps 503 / high demand to busy', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'), { status: 503 }));
    await expect(autoTag(['a'])).rejects.toMatchObject({ code: 'busy' });
    generateContent.mockRejectedValue(new Error('This model is currently experiencing high demand.'));
    await expect(autoTag(['a'])).rejects.toMatchObject({ code: 'busy' });
  });

  it('sends a timeout signal and maps a timeout to timed_out', async () => {
    generateContent.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    await expect(autoTag(['a'])).rejects.toMatchObject({ code: 'timed_out' });
    const { config } = generateContent.mock.calls[0][0];
    expect(config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(config.httpOptions.retryOptions.attempts).toBeLessThanOrEqual(2);
  });
});

describe('transcribe', () => {
  it('sends the WAV inline and maps numbers and mm:ss.mmm strings to sorted, clipped ms', async () => {
    generateContent.mockResolvedValue(json([
      { text: 'second', start: '00:01.500', end: '00:03.000' },
      { text: '  ', start: 0, end: 1 },
      { text: 'first', start: 0.2, end: 2.0 },
      { text: 'third', start: '3.5', end: 4.25 },
    ]));
    const lines = await transcribe(wav);
    expect(lines).toEqual([
      { text: 'first', startMs: 200, endMs: 1500 },
      { text: 'second', startMs: 1500, endMs: 3000 },
      { text: 'third', startMs: 3500, endMs: 4250 },
    ]);
    const arg = generateContent.mock.calls[0][0];
    const part = arg.contents[0].parts.find((p: any) => p.inlineData);
    expect(part.inlineData.mimeType).toBe('audio/wav');
    expect(arg.config.responseMimeType).toBe('application/json');
  });

  it('downsamples a 44.1 kHz upload to 16 kHz mono and removes its temp dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kitta-in-'));
    const input = join(dir, 'upload.wav');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', input]);
    try {
      expect(readFileSync(input).readUInt32LE(24)).toBe(44100);
      generateContent.mockResolvedValue(json([]));
      made.length = 0;
      await transcribe(input);
      const part = generateContent.mock.calls[0][0].contents[0].parts.find((p: any) => p.inlineData);
      const sent = Buffer.from(part.inlineData.data, 'base64');
      expect(sent.subarray(0, 4).toString()).toBe('RIFF');
      expect(sent.readUInt16LE(22)).toBe(1);
      expect(sent.readUInt32LE(24)).toBe(16000);
      expect(sent.readUInt16LE(34)).toBe(16);
      expect(sent.length).toBeLessThan(statSync(input).size);
      expect(made).toHaveLength(1);
      expect(existsSync(made[0])).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('removes its temp dir when ffmpeg or the API fails', async () => {
    made.length = 0;
    await expect(transcribe(join(tmpdir(), 'does-not-exist.wav'))).rejects.toMatchObject({ code: 'failed' });
    generateContent.mockRejectedValue(new Error('boom'));
    await expect(transcribe(wav)).rejects.toMatchObject({ code: 'failed' });
    expect(made).toHaveLength(2);
    for (const d of made) expect(existsSync(d)).toBe(false);
  });

  it('sends a timeout signal and maps busy and timeout errors', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('UNAVAILABLE'), { status: 503 }));
    await expect(transcribe(wav)).rejects.toMatchObject({ code: 'busy' });
    expect(generateContent.mock.calls[0][0].config.abortSignal).toBeInstanceOf(AbortSignal);
    generateContent.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await expect(transcribe(wav)).rejects.toMatchObject({ code: 'timed_out' });
  });

  it('drops items whose end is not after start, and survives malformed JSON', async () => {
    generateContent.mockResolvedValue(json([{ text: 'bad', start: 2, end: 2 }, { text: 'ok', start: 0, end: 1 }]));
    expect(await transcribe(wav)).toEqual([{ text: 'ok', startMs: 0, endMs: 1000 }]);
    generateContent.mockResolvedValue(json('nope'));
    expect(await transcribe(wav)).toEqual([]);
  });
});

describe('POST /api/autotag', () => {
  it('returns tags', async () => {
    generateContent.mockResolvedValue(json([{ expression: 'happy', gesture: 'wave' }]));
    const r = await request(app).post('/api/autotag').send({ texts: ['Hello'] });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ tags: [{ expression: 'happy', gesture: 'wave' }] });
  });

  it('rejects bad input', async () => {
    for (const b of [{}, { texts: 'x' }, { texts: [1] }, { texts: Array(51).fill('x') }, { texts: ['x'.repeat(501)] }]) {
      const r = await request(app).post('/api/autotag').send(b);
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: 'Invalid request' });
    }
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('maps Gemini errors', async () => {
    delete process.env.GEMINI_API_KEY;
    let r = await request(app).post('/api/autotag').send({ texts: ['a'] });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Gemini key missing — add GEMINI_API_KEY to .env' });
    process.env.GEMINI_API_KEY = 'k';
    generateContent.mockRejectedValue(Object.assign(new Error('x'), { status: 429 }));
    r = await request(app).post('/api/autotag').send({ texts: ['a'] });
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: 'Free Gemini limit reached, try again later' });
    generateContent.mockRejectedValue(new Error('boom'));
    r = await request(app).post('/api/autotag').send({ texts: ['a'] });
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: 'AI tagging failed. Please try again.' });
    generateContent.mockRejectedValue(Object.assign(new Error('UNAVAILABLE'), { status: 503 }));
    r = await request(app).post('/api/autotag').send({ texts: ['a'] });
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'Gemini is busy right now. Please try again in a minute.' });
    generateContent.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    r = await request(app).post('/api/autotag').send({ texts: ['a'] });
    expect(r.status).toBe(504);
    expect(r.body).toEqual({ error: 'Gemini took too long to answer. Please try again.' });
  });
});

describe('POST /api/transcribe', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  it('404s on unknown audio', async () => {
    const r = await request(app).post('/api/transcribe').send({ audioId: id });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Audio not found' });
    expect((await request(app).post('/api/transcribe').send({ audioId: '../x' })).status).toBe(404);
  });

  it('returns transcribed lines', async () => {
    copyFileSync(wav, join('data/audio', `${id}.wav`));
    try {
      generateContent.mockResolvedValue(json([{ text: 'hello', start: 0, end: 1.2 }]));
      const r = await request(app).post('/api/transcribe').send({ audioId: id });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ lines: [{ text: 'hello', startMs: 0, endMs: 1200 }] });
    } finally { rmSync(join('data/audio', `${id}.wav`), { force: true }); }
  });
});

describe('no Gemini key', () => {
  it('/api/audio and /api/export never touch Gemini', async () => {
    delete process.env.GEMINI_API_KEY;
    const up = await request(app).post('/api/audio').attach('file', wav);
    expect(up.status).toBe(200);
    const ex = await request(app).post('/api/export').send({ audioId: up.body.audioId });
    expect(ex.status).toBe(400); // reached validation, not Gemini
    expect(generateContent).not.toHaveBeenCalled();
    rmSync(join('data/audio', `${up.body.audioId}.wav`), { force: true });
  });
});
