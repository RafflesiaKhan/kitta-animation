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
    expect(generateContent).toHaveBeenCalledTimes(3); // the pause splits line 2 into two pieces with silence between
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
      { lines: [L('x', { pitch: 30 })] },
      { lines: [L('x', { speed: 'fast' })] },
      { lines: [L('x', { language: 'xx' })] },
      { lines: [L('x', { style: 'shout' })] },
      { lines: [L('x', { variability: 'wild' })] },
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

  it('speaks with OpenAI: tone, language and cues as instructions, pauses as real silence', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const calls: any[] = [];
    stubApis(async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(fixture); });
    const r = await request(app).post('/api/tts').send({ provider: 'openai', lines: [L('Hi <short pause> [excited]there', { voice: 'coral', expression: 'wink', note: 'softly', language: 'en-GB' })] });
    expect(r.status).toBe(200);
    expect(calls[0].url).toBe('https://api.openai.com/v1/audio/speech');
    expect(calls[0].body).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'coral', input: 'Hi', response_format: 'wav', instructions: 'Speak naturally, in a playful tone, softly, with a British accent.' });
    expect(calls[1].body).toMatchObject({ input: 'there', instructions: 'Speak naturally, in a playful tone, softly, with a British accent, excited.' });
    expect(calls[0].body.speed).toBeUndefined();
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
    expect(JSON.parse(calls[0].init.body)).toEqual({ model: 'tts-1', voice: 'My clone', input: 'Hello', response_format: 'wav', seed: expect.any(Number) });
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
    stubApis(async (url) => url.endsWith('/health') ? new Response(JSON.stringify({ status: 'ok', device: 'mps', version: '0.5.6' }))
      : url.endsWith('/personalities') ? new Response(JSON.stringify([{ id: 'narrator', name: 'Narrator', instruct: 'middle-aged, low pitch', icon: '📖' }]))
      : new Response(JSON.stringify({
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
      voices: [
        { id: 'demo0001', label: 'VoiceStudio Demo Voice (English)', kind: 'profile' },
        { id: 'persona:narrator', label: 'Narrator', kind: 'persona', icon: '📖' },
        { id: 'alloy', label: "Engine's default voice", kind: 'default' },
      ],
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

  it('splits VoiceStudio lines at pauses and cues, with language, accent, speed and one seed', async () => {
    process.env.VOICESTUDIO_URL = 'http://localhost:3900';
    const calls: any[] = [];
    stubApis(async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(fixture); });
    const line = L('Well [laughter] [pause 1s] that [excited]is great[/excited] ok [bogus]', { voice: 'demo0001', language: 'en-GB', speed: 10 });
    const r = await request(app).post('/api/tts').send({ provider: 'voicestudio', engine: 'omnivoice', lines: [line] });
    expect(r.status).toBe(200);
    expect(calls.map((c) => c.input)).toEqual(['Well [laughter]', 'that', 'is great', 'ok']);
    expect(calls[0]).toMatchObject({ model: 'omnivoice', voice: 'demo0001', language: 'en', instruct: 'british accent', speed: 1.1 });
    expect(calls[2].speed).toBe(1.23); // excited: +12% on top of the line's +10%
    expect(new Set(calls.map((c) => c.seed)).size).toBe(1); // steady: one seed for the whole line
    expect(r.body.durationMs).toBeGreaterThan(1000); // the pause is real silence
    expect((await request(app).post('/api/tts').send({ provider: 'voicestudio', engine: '../x', lines: [L('hi')] })).status).toBe(400);
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);

  it('gives the engine default voice one described speaker on every line and piece, so it stays the same person', async () => {
    process.env.VOICESTUDIO_URL = 'http://localhost:3900';
    const calls: any[] = [];
    stubApis(async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(fixture); });
    const r = await request(app).post('/api/tts').send({ provider: 'voicestudio', lines: [
      L('First line', { voice: 'alloy' }),
      L('Second [pause 1s] line', { voice: 'alloy', speaker: 'woman', language: 'en-GB' }),
      L('Named voice', { voice: 'demo0001', speaker: 'woman' }),
    ] });
    expect(r.status).toBe(200);
    expect(calls.map((c) => c.instruct)).toEqual(['male, young adult, moderate pitch', 'female, young adult, moderate pitch, british accent', 'female, young adult, moderate pitch, british accent', undefined]);
    expect(new Set(calls.slice(0, 3).map((c) => c.seed)).size).toBe(1);
    const other = await request(app).post('/api/tts').send({ provider: 'voicestudio', engine: 'kittentts', lines: [L('Hi', { voice: 'alloy' })] });
    expect(calls.at(-1).instruct).toBeUndefined(); // only OmniVoice designs voices
    for (const res of [r, other]) rmSync(join('data/audio', `${res.body.audioId}.wav`), { force: true });
  }, 30000);

  it('rejects an unknown speaker', async () => {
    const r = await request(app).post('/api/tts').send({ provider: 'voicestudio', lines: [L('Hi', { voice: 'alloy', speaker: 'robot' })] });
    expect(r.status).toBe(400);
  });

  it('drops reaction sounds on engines that would read them, and whispers', async () => {
    process.env.VOICESTUDIO_URL = 'http://localhost:3900';
    const calls: any[] = [];
    stubApis(async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(fixture); });
    const r = await request(app).post('/api/tts').send({ provider: 'voicestudio', engine: 'kittentts', lines: [L('Well [laughter] that is funny', { voice: 'demo0001', note: 'whispering' })] });
    expect(calls[0]).toMatchObject({ model: 'kittentts', input: 'Well that is funny', instruct: 'whisper' });
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);

  it('speaks a VoiceStudio persona from its attributes, with the picked accent instead of its own', async () => {
    process.env.VOICESTUDIO_URL = 'http://localhost:3900';
    const calls: any[] = [];
    stubApis(async (url, init) => {
      if (url.endsWith('/personalities')) return new Response(JSON.stringify([{ id: 'storyteller', name: 'Storyteller', instruct: 'middle-aged, moderate pitch, british accent' }, { id: 'sichuan', name: 'Sichuan', instruct: 'female, 四川话' }]));
      calls.push(JSON.parse(init.body));
      return new Response(fixture);
    });
    const r = await request(app).post('/api/tts').send({ provider: 'voicestudio', lines: [L('Once upon a time', { voice: 'persona:storyteller', language: 'en-US', style: 'whisper', variability: 'varied' })] });
    expect(r.status).toBe(200);
    expect(calls[0]).toMatchObject({ voice: 'default', instruct: 'middle-aged, moderate pitch, american accent, whisper', language: 'en' });
    // a Chinese dialect gives way to an English accent too (OmniVoice refuses both together)
    const r2 = await request(app).post('/api/tts').send({ provider: 'voicestudio', lines: [L('Hi', { voice: 'persona:sichuan', language: 'en-GB' })] });
    expect(calls[1].instruct).toBe('female, british accent');
    rmSync(join('data/audio', `${r2.body.audioId}.wav`), { force: true });
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);

  it('previews one line as audio, with pitch shifted and the length kept', async () => {
    generateContent.mockResolvedValue(speech);
    const plain = await request(app).post('/api/tts/preview').send({ provider: 'gemini', line: L('Hi there') }).buffer(true);
    const shifted = await request(app).post('/api/tts/preview').send({ provider: 'gemini', line: L('Hi there', { pitch: 20 }) }).buffer(true);
    expect(plain.status).toBe(200);
    expect(plain.headers['content-type']).toMatch(/audio\/wav/);
    expect(shifted.status).toBe(200);
    const seconds = (wav: Buffer) => (wav.length - 44) / (wav.readUInt32LE(28)); // data bytes / bytes per second
    expect(Math.abs(seconds(shifted.body) - seconds(plain.body))).toBeLessThan(0.1);
    expect((await request(app).post('/api/tts/preview').send({ line: L('[pause 1s]') })).body).toEqual({ error: 'Line 1 is empty' });
    expect((await request(app).post('/api/tts/preview').send({ line: L('hi', { speed: 90 }) })).status).toBe(400);
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

describe('POST /api/tts with stage directions', () => {
  const isDirector = (req: any) => req?.config?.responseMimeType === 'application/json';
  const directed = [
    L('[expression: warm smile] [action: waves hand gently] Have you ever wondered?', { expression: 'neutral', gesture: 'none' }),
    L('[action: pauses for two seconds] [action: leans forward slightly] Well, let me tell you.', { expression: 'neutral', gesture: 'none' }),
  ];

  it('never speaks the directions, makes pauses real, and returns marks matched by the AI director', async () => {
    generateContent.mockImplementation(async (req: any) => (isDirector(req) ? { text: JSON.stringify(['happy', 'wave', 'none']) } : speech));
    const r = await request(app).post('/api/tts').send({ lines: directed });
    expect(r.status).toBe(200);
    const spoken = generateContent.mock.calls.map(([req]) => req).filter((req) => !isDirector(req)).map((req) => JSON.stringify(req.contents));
    expect(spoken.join(' ')).not.toMatch(/expression:|action:|warm smile|leans/);
    const asked = generateContent.mock.calls.map(([req]) => req).find(isDirector);
    expect(asked.contents).toMatch(/1\. expression: warm smile\n2\. action: waves hand gently\n3\. action: leans forward slightly/);
    expect(r.body.lines[1].text).toBe('[pause 2s] Well, let me tell you.');
    expect(r.body.lines[1].endMs - r.body.lines[1].startMs).toBeGreaterThan(r.body.lines[0].endMs - r.body.lines[0].startMs + 1500); // 2 s of silence first
    expect(r.body.directedBy).toBe('gemini');
    expect(r.body.marks).toEqual({ expressions: [{ startMs: 0, expression: 'happy' }], actions: [{ startMs: 0, endMs: 2000, gesture: 'wave' }] });
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);

  it('falls back to the keyword rules when the director fails, and still returns the voice', async () => {
    generateContent.mockImplementation(async (req: any) => {
      if (isDirector(req)) throw Object.assign(new Error('quota'), { status: 429 });
      return speech;
    });
    const r = await request(app).post('/api/tts').send({ lines: directed });
    expect(r.status).toBe(200);
    expect(r.body.directedBy).toBe('keywords');
    expect(r.body.marks.expressions).toEqual([{ startMs: 0, expression: 'happy' }]);
    expect(r.body.marks.actions[0]).toMatchObject({ startMs: 0, gesture: 'wave' });
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);

  it('leaves an undirected script as it was: no marks', async () => {
    generateContent.mockResolvedValue(speech);
    const r = await request(app).post('/api/tts').send({ lines: [L('Hi there')] });
    expect(r.body.marks).toBeUndefined();
    expect(r.body.directedBy).toBeUndefined();
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);
});

describe('POST /api/tts director fallback to OpenAI', () => {
  const realFetch = globalThis.fetch;
  it('asks OpenAI when Gemini is busy', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    generateContent.mockImplementation(async (req: any) => {
      if (req?.config?.responseMimeType === 'application/json') throw Object.assign(new Error('busy'), { status: 503 });
      return speech;
    });
    const asked: any[] = [];
    vi.stubGlobal('fetch', async (url: any, init?: any) => {
      if (!/api\.openai\.com/.test(String(url))) return realFetch(url, init);
      asked.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ picks: ['sad', 'none'] }) } }] }));
    });
    const r = await request(app).post('/api/tts').send({ lines: [L('[expression: gloomy] [action: hand on heart] Hello.', { expression: 'neutral', gesture: 'none' })] });
    expect(r.status).toBe(200);
    expect(asked[0].model).toBe('gpt-5-mini');
    expect(r.body.directedBy).toBe('openai');
    expect(r.body.marks).toEqual({ expressions: [{ startMs: 0, expression: 'sad' }], actions: [] });
    rmSync(join('data/audio', `${r.body.audioId}.wav`), { force: true });
  }, 30000);
});
