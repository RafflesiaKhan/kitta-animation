import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../../server/index';

const fixture = join(__dirname, '../fixtures/hello.wav');
const SHAPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];
const app = createApp();

describe('audio + lipsync API', () => {
  it('uploads, streams, and lip-syncs the fixture', async () => {
    const up = await request(app).post('/api/audio').attach('file', fixture);
    expect(up.status).toBe(200);
    expect(up.body.audioId).toMatch(/^[0-9a-f-]{36}$/);
    expect(up.body.durationMs).toBeGreaterThan(500);

    const get = await request(app).get(`/api/audio/${up.body.audioId}`);
    expect(get.status).toBe(200);

    const ls = await request(app).post('/api/lipsync').send({ audioId: up.body.audioId });
    expect(ls.status).toBe(200);
    const cues = ls.body.cues;
    expect(cues.length).toBeGreaterThanOrEqual(3);
    for (const c of cues) expect(SHAPES).toContain(c.shape);
    for (let i = 1; i < cues.length; i++) expect(cues[i].startMs).toBeGreaterThanOrEqual(cues[i - 1].startMs);
    rmSync(join('data/audio', `${up.body.audioId}.wav`), { force: true });
  }, 30000);

  it('rejects an unreadable upload with a friendly message', async () => {
    const r = await request(app).post('/api/audio').attach('file', Buffer.from('not audio'), 'x.mp3');
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("couldn't read");
  });

  it('404s unknown and malformed audio ids', async () => {
    const r = await request(app).post('/api/lipsync').send({ audioId: randomUUID() });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Audio not found' });
    expect((await request(app).get('/api/audio/..%2Fx')).status).toBe(404);
  });

  it('returns clean JSON 400 for a malformed body', async () => {
    const r = await request(app).post('/api/lipsync').set('Content-Type', 'application/json').send('{bad json');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Invalid request' });
    expect(r.text).not.toMatch(/ at |\/Users/);
  });

  it('reports health', async () => {
    const r = await request(app).get('/api/health');
    expect(r.body.rhubarb).toBe(true);
    expect(typeof r.body.gemini).toBe('boolean');
  });
});
