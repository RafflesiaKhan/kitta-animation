import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sample from '../../shared/vector-avator/sample/usagi.vector.json';

const paintFront = vi.fn();
const paintFaceSheet = vi.fn();
const drawVector = vi.fn();
vi.mock('../../server/vector-art', () => ({ paintFront: (...a: unknown[]) => paintFront(...a), paintFaceSheet: (...a: unknown[]) => paintFaceSheet(...a) }));
vi.mock('../../server/vector-draw', () => ({ drawProvider: () => 'openai', drawVector: (...a: unknown[]) => drawVector(...a) }));
import { CHARACTERS_DIR } from '../../server/characters';
import { cancelVectorJob, getVectorJob, listVectorJobs, resumeVectorJob, startVectorJob } from '../../server/vector-create';
import { OpenAIError } from '../../server/openai';
import { recordUsage } from '../../server/usage';
import { createApp } from '../../server/index';
import type { VectorJob } from '../../shared/vector-job';

const made: string[] = [];
const png = Buffer.from('png');
const settle = async (id: string): Promise<VectorJob> => {
  for (let i = 0; i < 500; i++) { // up to 10 s: the full test run can be slow
    const j = await getVectorJob(id);
    if (!['front', 'face', 'drawing'].includes(j.stage)) return j;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('job did not settle');
};
const start = async () => { const j = await startVectorJob({ name: 'Test fox', description: 'a red fox', imageProvider: 'openai' }); made.push(j.id); return j; };
/** A paid call inside the job, so its cost is tallied. */
const paid = (out: Buffer) => async () => { recordUsage({ provider: 'openai', model: 'gpt-5-mini', kind: 'image', input: 1_000_000, output: 0 }); return out; };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  paintFront.mockReset().mockImplementation(paid(png));
  paintFaceSheet.mockReset().mockImplementation(paid(png));
  drawVector.mockReset().mockImplementation(async (inp: { onRound: (r: object) => Promise<void> }) => {
    await inp.onRound({ round: 1, doc: sample, errors: [], warnings: [], sheet: png, done: false });
    return { doc: sample, errors: [], rounds: [] };
  });
});
afterAll(() => { for (const id of made) rmSync(join(CHARACTERS_DIR, id), { recursive: true, force: true }); });

describe('vector character job', () => {
  it('paints, draws and saves the character, tallying its cost', async () => {
    const job = await settle((await start()).id);
    expect(job).toMatchObject({ stage: 'done', hasFront: true, hasFace: true, hasCheck: true, round: 1, errors: 0 });
    expect(job.cost).toBeCloseTo(0.5, 9); // two calls of 1M input tokens at $0.25
    const dir = join(CHARACTERS_DIR, job.id);
    expect(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))).toEqual({ kind: 'vector', id: job.id, name: 'Test fox' });
    expect(JSON.parse(readFileSync(join(dir, 'vector.json'), 'utf8'))).toEqual(sample);
    expect(existsSync(join(dir, 'work', 'round-1.vector.json'))).toBe(true);
    expect((await listVectorJobs()).map((j) => j.id)).not.toContain(job.id); // finished jobs leave the list
    expect(drawVector.mock.calls[0][0]).toMatchObject({ name: 'Test fox', notes: 'a red fox', provider: 'openai' });
  });

  it('fails with words for the person, and Resume skips the pictures already made', async () => {
    paintFaceSheet.mockRejectedValueOnce(new OpenAIError('busy'));
    const failed = await settle((await start()).id);
    expect(failed).toMatchObject({ stage: 'failed', hasFront: true, hasFace: false });
    expect(failed.message).toMatch(/busy or over its limit/);
    await resumeVectorJob(failed.id);
    expect((await settle(failed.id)).stage).toBe('done');
    expect(paintFront).toHaveBeenCalledTimes(1);
    expect(paintFaceSheet).toHaveBeenCalledTimes(2);
  });

  it('cancels the drawing in flight', async () => {
    drawVector.mockImplementation((inp: { signal: AbortSignal }) => new Promise((_, reject) => {
      inp.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
    }));
    const job = await start();
    for (let i = 0; i < 100 && (await getVectorJob(job.id)).stage !== 'drawing'; i++) await new Promise((r) => setTimeout(r, 10));
    const cancelled = await cancelVectorJob(job.id);
    expect(cancelled.stage).toBe('cancelled');
    expect(existsSync(join(CHARACTERS_DIR, job.id, 'meta.json'))).toBe(false);
  });

  it('shows a job left running by a closed server as interrupted', async () => {
    const id = randomUUID();
    made.push(id);
    await mkdir(join(CHARACTERS_DIR, id, 'work'), { recursive: true });
    const now = new Date().toISOString();
    await writeFile(join(CHARACTERS_DIR, id, 'work', 'job.json'), JSON.stringify({ id, name: 'x', description: 'x', imageProvider: 'openai', drawProvider: 'openai', stage: 'drawing', round: 2, maxRounds: 4, errors: 1, cost: 1, hasFront: true, hasFace: true, hasCheck: true, startedAt: now, updatedAt: now }));
    expect(await getVectorJob(id)).toMatchObject({ stage: 'interrupted', round: 2 });
  });
});

describe('vector job routes', () => {
  const app = createApp();
  it('needs the drawing key, and 404s an unknown job', async () => {
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.GEMINI_API_KEY = 'k';
    try {
      const r = await request(app).post('/api/vector-jobs').field('description', 'a fox');
      expect(r.status).toBe(400);
      expect(r.body.error).toContain('OPENAI_API_KEY');
    } finally {
      if (key) process.env.OPENAI_API_KEY = key;
      delete process.env.GEMINI_API_KEY;
    }
    expect((await request(app).get(`/api/vector-jobs/${randomUUID()}`)).status).toBe(404);
    expect((await request(app).get('/api/vector-jobs/x/../../etc/passwd')).status).toBe(404);
  });
  it('starts a job and serves its pictures', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    try {
      const r = await request(app).post('/api/vector-jobs').field('description', 'a red fox').field('provider', 'openai');
      expect(r.status).toBe(200);
      made.push(r.body.job.id);
      await settle(r.body.job.id);
      expect((await request(app).get(`/api/vector-jobs/${r.body.job.id}/front.png`)).status).toBe(200);
      expect((await request(app).get(`/api/vector-jobs/${r.body.job.id}/reference.json`)).status).toBe(404);
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});
