import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));
import { createApp } from '../../server/index';
import { CHARACTERS_DIR } from '../../server/characters';
import { generateImage, findMouth, OpenAIError } from '../../server/openai';

const fixture = readFileSync(join(__dirname, '../fixtures/magenta-robot.png'));
const app = createApp();
const created: string[] = [];
const realFetch = globalThis.fetch;
const fetchMock = vi.fn();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const imageOk = () => json({ data: [{ b64_json: fixture.toString('base64') }] });
const mouthOk = () => json({ choices: [{ message: { content: JSON.stringify({ found: true, box_2d: [550, 450, 600, 550], skin: '#112233' }) } }] });
/** Fake OpenAI: images endpoints paint the fixture, chat answers the mouth question. */
const openai = () => fetchMock.mockImplementation(async (url: string) => (String(url).includes('/images/') ? imageOk() : mouthOk()));

beforeEach(() => {
  fetchMock.mockReset();
  generateContent.mockReset();
  // supertest talks to the app over real HTTP, so only api.openai.com goes to the mock
  vi.stubGlobal('fetch', (url: any, init?: any) => (String(url).startsWith('https://api.openai.com') ? fetchMock(url, init) : realFetch(url, init)));
  process.env.OPENAI_API_KEY = 'sk-test';
  delete process.env.GEMINI_API_KEY;
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_IMAGE_MODEL; });
afterAll(() => { for (const id of created) rmSync(join(CHARACTERS_DIR, id), { recursive: true, force: true }); });

describe('openai client', () => {
  it('generates with images/generations and the configured model', async () => {
    openai();
    process.env.OPENAI_IMAGE_MODEL = 'gpt-image-2.5-flare';
    const png = await generateImage('a robot');
    expect(png.equals(fixture)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-image-2.5-flare', prompt: 'a robot', size: '1024x1024' });
  });
  it('edits with images/edits, sending the reference as a file', async () => {
    openai();
    await generateImage('make it happy', [{ data: fixture, mimeType: 'image/png' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    const form = init.body as FormData;
    expect(form.get('prompt')).toBe('make it happy');
    expect((form.get('image[]') as Blob).type).toBe('image/png');
  });
  it('maps errors', async () => {
    const cases: [Response, string][] = [
      [json({ error: { message: 'bad key' } }, 401), 'bad_key'],
      [json({ error: { message: 'slow down' } }, 429), 'rate_limited'],
      [json({ error: {} }, 503), 'busy'],
      [json({ error: { code: 'moderation_blocked' } }, 400), 'no_image'],
      [json({ data: [] }), 'no_image'],
    ];
    for (const [res, code] of cases) {
      fetchMock.mockResolvedValueOnce(res);
      await expect(generateImage('x')).rejects.toMatchObject({ name: 'OpenAIError', code });
    }
    delete process.env.OPENAI_API_KEY;
    await expect(generateImage('x')).rejects.toBeInstanceOf(OpenAIError);
  });
  it('finds the mouth with a vision model and structured output', async () => {
    openai();
    expect(await findMouth(fixture)).toEqual({ x: 0.5, y: 0.575, w: 0.1, skin: '#112233' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });
});

describe('AI characters with OpenAI', () => {
  it('reports OpenAI as the image provider', async () => {
    expect((await request(app).get('/api/health')).body).toMatchObject({ gemini: false, imageProviders: ['openai'] });
  });

  it('creates with OpenAI, remembers it, and draws later poses with it too', async () => {
    openai();
    const r = await request(app).post('/api/characters').field('description', 'a robot').field('style', 'anime');
    expect(r.status).toBe(200);
    const c = r.body.character;
    created.push(c.id);
    expect(c.provider).toBe('openai');
    expect(c.images.neutral.mouth.skin).toBe('#112233'); // OpenAI vision found the mouth (no Gemini key)
    fetchMock.mockClear();
    const p = await request(app).post(`/api/characters/${c.id}/poses/wink`);
    expect(p.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/images/edits');
    expect(generateContent).not.toHaveBeenCalled();
  }, 30000);

  it('prefers Gemini for the mouth when both keys are set', async () => {
    openai();
    process.env.GEMINI_API_KEY = 'g-key';
    generateContent.mockResolvedValue({ text: JSON.stringify({ found: true, box_2d: [550, 450, 600, 550], skin: '#445566' }) });
    const r = await request(app).post('/api/characters').field('description', 'a robot').field('style', 'anime').field('provider', 'openai');
    created.push(r.body.character.id);
    expect(r.body.character.images.neutral.mouth.skin).toBe('#445566');
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/images/'))).toBe(true);
  }, 30000);

  it('falls back to OpenAI for the mouth when Gemini fails', async () => {
    openai();
    process.env.GEMINI_API_KEY = 'g-key';
    generateContent.mockRejectedValue(Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 }));
    const r = await request(app).post('/api/characters').field('description', 'a robot').field('style', 'anime').field('provider', 'openai');
    created.push(r.body.character.id);
    expect(r.body.character.images.neutral.mouth.skin).toBe('#112233');
  }, 30000);

  it('rejects a provider without a key and explains a missing key', async () => {
    expect((await request(app).post('/api/characters').field('description', 'a robot').field('style', 'anime').field('provider', 'gemini')).status).toBe(400);
    delete process.env.OPENAI_API_KEY;
    const r = await request(app).post('/api/characters').field('description', 'a robot').field('style', 'anime');
    expect(r.body).toEqual({ error: 'Add GEMINI_API_KEY or OPENAI_API_KEY to .env to create characters.' });
  });

  it('shows OpenAI wording for its errors', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'quota' } }, 429));
    const r = await request(app).post('/api/characters').field('description', 'a robot').field('style', 'anime');
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: 'OpenAI limit or quota reached, try again later' });
  });
});
