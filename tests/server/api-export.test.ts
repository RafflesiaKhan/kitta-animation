import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../../server/index';
import { STARTERS } from '../../shared/character/starters';

const id = '11111111-1111-4111-8111-111111111111';
const wav = join('data', 'audio', `${id}.wav`);
const { name: _n, ...character } = STARTERS.kit;
const timeline = { durationMs: 600, cues: [{ startMs: 0, endMs: 300, shape: 'D' }], lines: [{ text: '', startMs: 0, endMs: 600, expression: 'neutral', gesture: 'none' }] };
const body = { character, timeline, audioId: id, format: { aspect: '16:9', transparent: false } };
const made: string[] = [];
afterAll(() => { rmSync(wav, { force: true }); made.forEach((f) => rmSync(join('data', 'exports', f), { force: true })); });

describe('export API', () => {
  it('404s an unknown audioId and 400s bad bodies', async () => {
    const app = createApp();
    await request(app).post('/api/export').send({ ...body, audioId: '22222222-2222-4222-8222-222222222222' }).expect(404, { error: 'Audio not found' });
    mkdirSync(join('data', 'audio'), { recursive: true });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(__dirname, '../fixtures/hello.wav'), '-ac', '1', '-ar', '44100', wav]);
    await request(app).post('/api/export').send({ ...body, format: { aspect: '4:3', transparent: false } }).expect(400, { error: 'Invalid request' });
    await request(app).post('/api/export').send({ ...body, timeline: { durationMs: 'x', cues: [], lines: [] } }).expect(400, { error: 'Invalid request' });
  });

  it('streams NDJSON progress then done, and serves the file as a download', async () => {
    const app = createApp();
    const res = await request(app).post('/api/export').send(body).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/x-ndjson/);
    const lines = res.text.trim().split('\n').map((l) => JSON.parse(l));
    const last = lines.at(-1);
    expect(last).toMatchObject({ done: true, url: expect.stringMatching(/^\/api\/exports\/[0-9a-f-]{36}\.mp4$/) });
    expect(lines.length).toBeLessThanOrEqual(22);
    lines.slice(0, -1).forEach((l) => expect(l.progress).toBeGreaterThanOrEqual(0));
    made.push(last.url.split('/').pop());
    const dl = await request(app).get(last.url).expect(200);
    expect(dl.headers['content-disposition']).toMatch(/attachment/);
    expect(existsSync(join('data', 'exports', made[0]))).toBe(true);
  }, 60_000);

  it('serves only uuid.mp4/webm names', async () => {
    const app = createApp();
    await request(app).get('/api/exports/..%2Fpackage.json').expect(404);
    await request(app).get('/api/exports/notes.txt').expect(404);
    await request(app).get('/api/exports/11111111-1111-4111-8111-111111111111.mp4').expect(404);
  });
});
