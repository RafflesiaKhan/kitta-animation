import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));
import { createApp } from '../../server/index';
import { CHARACTERS_DIR } from '../../server/characters';
import { validateExport } from '../../server/validate';

const fixture = readFileSync(join(__dirname, '../fixtures/magenta-robot.png'));
const app = createApp();
const created: string[] = [];

const imageReply = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: fixture.toString('base64') } }] } }] };
const mouthReply = { text: JSON.stringify({ found: true, box_2d: [550, 450, 600, 550], skin: '#3A86FF' }) };
// Image calls ask for IMAGE output; everything else is the mouth lookup.
const gemini = (image: unknown = imageReply) => generateContent.mockImplementation(async (req: any) =>
  req.config?.responseModalities?.includes('IMAGE') ? image : mouthReply);

/** RGBA of one pixel of a PNG, decoded by ffmpeg. */
function pixel(png: Buffer, x: number, y: number): number[] {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { input: png });
  return [...raw.subarray(0, 4)];
}

const create = (fields: Record<string, string> = { description: 'a blue robot', style: 'flat cartoon' }) => {
  let r = request(app).post('/api/characters');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r;
};

beforeEach(() => { generateContent.mockReset(); process.env.GEMINI_API_KEY = 'test-key'; });
afterEach(() => { delete process.env.GEMINI_API_KEY; });
afterAll(() => { for (const id of created) rmSync(join(CHARACTERS_DIR, id), { recursive: true, force: true }); });

describe('AI characters', () => {
  it('creates a character with a transparent base image and a mouth box, then lists it', async () => {
    gemini();
    const r = await create({ description: 'a blue robot with an antenna', name: 'Robo', style: 'pixel art' });
    expect(r.status).toBe(200);
    const c = r.body.character;
    created.push(c.id);
    expect(c).toMatchObject({ kind: 'art', name: 'Robo', style: 'pixel art', prompt: 'a blue robot with an antenna' });
    expect(c.images.neutral.mouth).toEqual({ x: 0.5, y: 0.575, w: 0.1, skin: '#3A86FF' });
    const prompt = generateContent.mock.calls[0][0].contents[0].parts.at(-1).text;
    expect(prompt).toContain('a blue robot with an antenna');
    expect(prompt).toContain('pixel art');

    const img = await request(app).get(`/api/characters/${c.id}/${c.images.neutral.file}`).buffer(true);
    expect(img.status).toBe(200);
    expect(pixel(img.body, 5, 5)[3]).toBe(0); // magenta keyed out
    const body = pixel(img.body, 512, 512); // character kept (colour within rounding of the original)
    expect(body[3]).toBe(255);
    [0x3a, 0x86, 0xff].forEach((v, i) => expect(Math.abs(body[i] - v)).toBeLessThanOrEqual(4));

    const list = await request(app).get('/api/characters');
    expect(list.body.characters.map((x: any) => x.id)).toContain(c.id);
  }, 30000);

  it('draws a pose as an edit of the base image and replaces the old file on redraw', async () => {
    gemini();
    const c = (await create()).body.character;
    created.push(c.id);
    const r1 = await request(app).post(`/api/characters/${c.id}/poses/happy`);
    expect(r1.status).toBe(200);
    const first = r1.body.character.images.happy.file;
    const edit = generateContent.mock.calls.find(([req]) => req.config?.responseModalities && req.contents[0].parts.length === 2)![0];
    expect(edit.contents[0].parts[0].inlineData.mimeType).toBe('image/png'); // the base image goes along
    expect(edit.contents[0].parts[1].text).toContain('happy');

    await new Promise((r) => setTimeout(r, 5)); // distinct timestamped file name
    const r2 = await request(app).post(`/api/characters/${c.id}/poses/happy`);
    const second = r2.body.character.images.happy.file;
    expect(second).not.toBe(first);
    expect(existsSync(join(CHARACTERS_DIR, c.id, first))).toBe(false);
    expect(r2.body.character.images.neutral).toEqual(c.images.neutral);
  }, 30000);

  it('rejects bad input', async () => {
    expect((await create({ description: '', style: 'flat cartoon' })).status).toBe(400);
    expect((await create({ description: 'x', style: 'oil painting' })).status).toBe(400);
    expect((await create({ description: 'x'.repeat(401), style: 'anime' })).status).toBe(400);
    expect((await request(app).post('/api/characters/not-a-uuid/poses/happy')).status).toBe(404);
    expect((await request(app).post('/api/characters/11111111-2222-3333-4444-555555555555/poses/happy')).status).toBe(404);
    expect((await request(app).get('/api/characters/11111111-2222-3333-4444-555555555555/..%2Fmeta.json')).status).toBe(404);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects redrawing neutral and unknown poses', async () => {
    gemini();
    const c = (await create()).body.character;
    created.push(c.id);
    generateContent.mockClear();
    expect((await request(app).post(`/api/characters/${c.id}/poses/neutral`)).status).toBe(400);
    expect((await request(app).post(`/api/characters/${c.id}/poses/dance`)).status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  }, 30000);

  it('reports a refused drawing and a missing key', async () => {
    gemini({ candidates: [{ content: { parts: [{ text: 'I cannot draw that.' }] } }] });
    const r = await create();
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/didn't draw a picture/);
    delete process.env.GEMINI_API_KEY;
    expect((await create()).status).toBe(400);
  });

  it('keeps the character when the mouth lookup fails', async () => {
    generateContent.mockImplementation(async (req: any) => {
      if (req.config?.responseModalities) return imageReply;
      throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    });
    const r = await create();
    expect(r.status).toBe(200);
    created.push(r.body.character.id);
    expect(r.body.character.images.neutral.mouth).toBeNull();
  }, 30000);

  it('measures the painted mouth in the pixels and seeds every pose with it, without more vision calls', async () => {
    // a skin square on magenta with a dark mouth line at x 226-286, y 300-306 (of 512); the vision box is 20 px too high
    const face = execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=0xFF00FF:s=512x512', '-vf',
      'drawbox=x=156:y=156:w=200:h=200:color=0xF0C8A0:t=fill,drawbox=x=226:y=300:w=60:h=6:color=0x401010:t=fill',
      '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1']);
    const faceReply = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: face.toString('base64') } }] } }] };
    generateContent.mockImplementation(async (req: any) => req.config?.responseModalities?.includes('IMAGE')
      ? faceReply : { text: JSON.stringify({ found: true, box_2d: [560, 450, 600, 550], skin: '#000000' }) });
    const c = (await create()).body.character;
    created.push(c.id);
    expect(c.mouthsMeasured).toBe(true);
    const m = c.images.neutral.mouth;
    expect(m.x).toBeCloseTo(0.5, 2);
    expect(m.y).toBeCloseTo(0.592, 2);
    expect(m.w).toBeCloseTo(0.117, 1);
    expect(m.h).toBeGreaterThan(0);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(m.skin.slice(i, i + 2), 16)); // sampled skin, not the vision reply's
    [r - 0xf0, g - 0xc8, b - 0xa0].forEach((d) => expect(Math.abs(d)).toBeLessThanOrEqual(6));
    generateContent.mockClear();
    const happy = (await request(app).post(`/api/characters/${c.id}/poses/happy`)).body.character.images.happy;
    expect(happy.mouth).toEqual(m); // same picture here, measured from the neutral mouth
    expect(generateContent.mock.calls.every(([req]) => req.config?.responseModalities)).toBe(true); // only the image call
  }, 30000);

  it('measures mouths again without repainting', async () => {
    generateContent.mockImplementation(async (req: any) => {
      if (req.config?.responseModalities) return imageReply;
      throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    });
    const c = (await create()).body.character;
    created.push(c.id);
    expect(c.images.neutral.mouth).toBeNull();
    gemini();
    generateContent.mockClear();
    const r = await request(app).post(`/api/characters/${c.id}/mouths`);
    expect(r.status).toBe(200);
    expect(r.body.character.images.neutral).toEqual({ file: c.images.neutral.file, mouth: { x: 0.5, y: 0.575, w: 0.1, skin: '#3A86FF' } });
    expect(generateContent.mock.calls.some(([req]) => req.config?.responseModalities)).toBe(false); // no image calls
    expect((await request(app).get('/api/characters')).body.characters.find((x: any) => x.id === c.id).images.neutral.mouth).not.toBeNull();
    generateContent.mockClear();
    await request(app).post(`/api/characters/${c.id}/mouths`); // nothing missing any more
    expect(generateContent).not.toHaveBeenCalled();
    expect((await request(app).post('/api/characters/11111111-2222-3333-4444-555555555555/mouths')).status).toBe(404);
  }, 30000);

  it('deletes a character', async () => {
    gemini();
    const c = (await create()).body.character;
    expect((await request(app).delete(`/api/characters/${c.id}`)).status).toBe(204);
    expect(existsSync(join(CHARACTERS_DIR, c.id))).toBe(false);
    expect((await request(app).delete(`/api/characters/${c.id}`)).status).toBe(404);
  }, 30000);
});

describe('export with an AI character', () => {
  const timeline = { durationMs: 1000, cues: [], lines: [] };
  const format = { aspect: '16:9', transparent: false };
  it('accepts an id and ignores client-supplied images', () => {
    const v = validateExport({ character: { kind: 'art', id: '11111111-2222-3333-4444-555555555555', images: { neutral: { file: '../../etc/passwd' } } }, timeline, format });
    expect(v?.character).toMatchObject({ kind: 'art', id: '11111111-2222-3333-4444-555555555555', images: {} });
    expect(validateExport({ character: { kind: 'art', id: '../x' }, timeline, format })).toBeNull();
  });
});
