import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));
import { createApp } from '../../server/index';
import { RETRY } from '../../server/retry';

const fixture = readFileSync(join(__dirname, '../fixtures/hello.wav'));
const app = createApp();
const L = (text: string, extra = {}) => ({ text, voice: 'Kore', expression: 'happy', gesture: 'wave', ...extra });

const speech = { candidates: [{ content: { parts: [{ inlineData: { data: fixture.toString('base64') } }] } }] };
beforeEach(() => { generateContent.mockReset(); process.env.GEMINI_API_KEY = 'test-key'; RETRY.delaysMs = []; vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { delete process.env.GEMINI_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.VOICESTUDIO_URL; vi.unstubAllGlobals(); vi.mocked(console.warn).mockRestore(); });

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

  it('returns the invalid-key error', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('API key not valid'), { status: 400 }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await request(app).post('/api/tts').send({ lines: [L('hi')] });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Gemini key looks invalid — check GEMINI_API_KEY in .env' });
    spy.mockRestore();
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

describe('POST /api/tts retries and providers', () => {
  const busy = Object.assign(new Error('The model is overloaded. Please try again later.'), { status: 503 });
  const realFetch = globalThis.fetch;
  /** Routes OpenAI and VoiceStudio calls to fake, leaving supertest's own requests alone. */
  const stubApis = (fake: (url: string, init: any) => Promise<Response>) =>
    vi.stubGlobal('fetch', (url: any, init?: any) => (/api\.openai\.com|localhost:3900/.test(String(url)) ? fake(String(url), init) : realFetch(url, init)));

  it('rides out a busy model with retries and logs what Google said', async () => {
    RETRY.delaysMs = [5, 5, 5];
    generateContent.mockRejectedValueOnce(busy).mockRejectedValueOnce(busy).mockResolvedValue(speech);
    const r = await request(app).post('/api/tts').send({ lines: [L('hi')] });
    expect(r.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledWith('gemini tts: busy', 503, 'The model is overloaded. Please try again later.');
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);

  it('gives up after the retries, pointing at the other providers that are set up', async () => {
    RETRY.delaysMs = [5, 5];
    process.env.OPENAI_API_KEY = 'sk-test';
    generateContent.mockRejectedValue(busy);
    const r = await request(app).post('/api/tts').send({ lines: [L('hi')] });
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('Gemini is busy right now. Try again in a minute, or switch "Voice by" to OpenAI.');
  });

  it('does not retry errors that will not go away', async () => {
    RETRY.delaysMs = [5, 5];
    generateContent.mockRejectedValue(Object.assign(new Error('API key not valid'), { status: 400 }));
    await request(app).post('/api/tts').send({ lines: [L('hi')] });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('speaks with OpenAI: tone as instructions, pause tags not read out', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const calls: any[] = [];
    stubApis(async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(fixture); });
    const r = await request(app).post('/api/tts').send({ provider: 'openai', lines: [L('Hi <short pause> there', { voice: 'coral', expression: 'wink', note: 'whispering' })] });
    expect(r.status).toBe(200);
    expect(calls[0].url).toBe('https://api.openai.com/v1/audio/speech');
    expect(calls[0].body).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'coral', input: 'Hi ... there', response_format: 'wav', instructions: 'Speak naturally, in a playful tone, whispering.' });
    expect(generateContent).not.toHaveBeenCalled();
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);

  it('speaks with a local VoiceStudio through its OpenAI-compatible API', async () => {
    process.env.VOICESTUDIO_URL = 'http://localhost:3900/';
    const calls: any[] = [];
    stubApis(async (url, init) => { calls.push({ url, init }); return new Response(fixture); });
    const r = await request(app).post('/api/tts').send({ provider: 'voicestudio', lines: [L('Hello', { voice: 'My clone' })] });
    expect(r.status).toBe(200);
    expect(calls[0].url).toBe('http://localhost:3900/v1/audio/speech');
    expect(calls[0].init.headers.Authorization).toBeUndefined(); // local: no key
    expect(JSON.parse(calls[0].init.body)).toEqual({ model: 'tts-1', voice: 'My clone', input: 'Hello', response_format: 'wav' });
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);

  it("says when VoiceStudio isn't running", async () => {
    process.env.VOICESTUDIO_URL = 'http://localhost:3900';
    stubApis(async () => { throw new TypeError('fetch failed'); });
    const r = await request(app).post('/api/tts').send({ provider: 'voicestudio', lines: [L('Hello')] });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe("VoiceStudio isn't running at http://localhost:3900. Start it, then try again.");
  });

  it('reports VoiceStudio status, installed engines and voices (aliases collapsed), and providers', async () => {
    process.env.VOICESTUDIO_URL = 'http://localhost:3900';
    process.env.OPENAI_API_KEY = 'sk-test';
    // Shapes copied from a real VoiceStudio 0.5.6
    stubApis(async (url) => url.endsWith('/health') ? new Response(JSON.stringify({ status: 'ok', device: 'mps', version: '0.5.6' })) : new Response(JSON.stringify({
      voices: [
        { voice_id: 'alloy', name: 'Alloy', type: 'openai_alias' }, { voice_id: 'coral', name: 'Coral', type: 'openai_alias' },
        { voice_id: 'demo0001', name: 'VoiceStudio Demo Voice', type: 'profile', language: 'English' },
      ],
      engines: [
        { id: 'omnivoice', display_name: 'VoiceStudio (k2-fsa/OmniVoice, 600+ languages)', available: true, supports_cloning: true, supports_emotion: false },
        { id: 'indextts2', display_name: 'IndexTTS 2.5', available: false, supports_cloning: true, supports_emotion: true },
        { id: 'kittentts', display_name: 'KittenTTS (English)', available: true, supports_cloning: false, supports_emotion: false },
      ],
    })));
    expect((await request(app).get('/api/voicestudio')).body).toEqual({
      running: true, url: 'http://localhost:3900', version: '0.5.6', device: 'mps',
      voices: [{ id: 'demo0001', label: 'VoiceStudio Demo Voice (English)', kind: 'profile' }, { id: 'alloy', label: "Engine's default voice", kind: 'default' }],
      engines: [
        { id: 'omnivoice', label: 'VoiceStudio (k2-fsa/OmniVoice, 600+ languages)', cloning: true, emotion: false },
        { id: 'kittentts', label: 'KittenTTS (English)', cloning: false, emotion: false },
      ],
    });
    expect((await request(app).get('/api/health')).body.ttsProviders).toEqual(['gemini', 'openai', 'voicestudio']);
  });

  it('reports a VoiceStudio that is not running', async () => {
    process.env.VOICESTUDIO_URL = 'http://localhost:3900';
    stubApis(async () => { throw new TypeError('fetch failed'); });
    expect((await request(app).get('/api/voicestudio')).body).toMatchObject({ running: false, voices: [], engines: [] });
  });

  it('uses the chosen VoiceStudio engine, its own tags and whisper style', async () => {
    process.env.VOICESTUDIO_URL = 'http://localhost:3900';
    const calls: any[] = [];
    stubApis(async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(fixture); });
    const r = await request(app).post('/api/tts').send({ provider: 'voicestudio', engine: 'kittentts', lines: [L('Well <short pause> [laughter] that [excited] is <long pause> funny', { voice: 'demo0001', note: 'whispering' })] });
    expect(r.status).toBe(200);
    expect(calls[0]).toMatchObject({ model: 'kittentts', input: 'Well [pause] [laughter] that is [pause 1s] funny', instruct: 'whisper' });
    expect((await request(app).post('/api/tts').send({ provider: 'voicestudio', engine: '../x', lines: [L('hi')] })).status).toBe(400);
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);

  it('transcribes locally with VoiceStudio when it is running', async () => {
    process.env.VOICESTUDIO_URL = 'http://localhost:3900';
    const up = await request(app).post('/api/audio').attach('file', join(__dirname, '../fixtures/hello.wav'));
    let form: FormData | undefined;
    stubApis(async (url, init) => {
      if (url.endsWith('/health')) return new Response(JSON.stringify({ status: 'ok' }));
      if (url.endsWith('/audio/voices')) return new Response(JSON.stringify({ voices: [] }));
      form = init.body;
      return new Response(JSON.stringify({ segments: [{ start: 0.1, end: 0.9, text: ' Hello there. ' }, { start: 0.8, end: 1.7, text: 'How are you?' }] }));
    });
    const r = await request(app).post('/api/transcribe').send({ audioId: up.body.audioId });
    expect(r.body.lines).toEqual([{ text: 'Hello there.', startMs: 100, endMs: 800 }, { text: 'How are you?', startMs: 800, endMs: 1700 }]);
    expect(form!.get('response_format')).toBe('verbose_json');
    expect(generateContent).not.toHaveBeenCalled();
    rmSync(join('data/audio', `${up.body.audioId}.wav`), { force: true });
  }, 30000);

  it('rejects an unknown provider', async () => {
    expect((await request(app).post('/api/tts').send({ provider: 'acme', lines: [L('hi')] })).status).toBe(400);
  });
});
