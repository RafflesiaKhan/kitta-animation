import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import { CHARACTERS_DIR } from '../../server/characters';
import { setSettingsFileForTests, resetSettingsCache } from '../../server/settings';
import { publishRig, readRig, readRigWith, listRigs, RigStorageError } from '../../server/svg-rig-storage';
import { cancelRigJob, getRigJob, listRigJobs, resumeRigJob, rigModels, setRigChatForTests, startRigJob, viewProblems } from '../../server/svg-rig-create';
import { hydrateScene, snapshotScene } from '../../server/scene';
import { AnthropicError } from '../../server/anthropic';
import { recordUsage } from '../../server/usage';
import { createApp } from '../../server/index';
import { fixtureArt, fixturePack } from '../../shared/svg-rig-fixture';
import type { RigJob } from '../../shared/svg-rig-job';
import type { ChatBlock, ToolChat } from '../../server/tool-chat';
import type { Scene } from '../../shared/scene';

const made: string[] = [];
const art = fixtureArt();
const png = Buffer.from(new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#c98d68"/></svg>').render().asPng());

beforeAll(() => {
  setSettingsFileForTests(join(tmpdir(), `kitta-settings-${randomUUID()}.json`));
  resetSettingsCache();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});
afterAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  for (const id of made) rmSync(join(CHARACTERS_DIR, id), { recursive: true, force: true });
});

async function published(name = 'Haru test') {
  const id = randomUUID();
  made.push(id);
  await mkdir(join(CHARACTERS_DIR, id), { recursive: true });
  await publishRig(id, name, fixturePack());
  return id;
}

describe('svg rig library storage', () => {
  it('publishes, lists and reads a validated pack, and rejects an invalid or damaged one', async () => {
    const id = await published();
    expect((await listRigs()).map((c) => c.id)).toContain(id);
    const c = await readRig(id);
    expect(c).toMatchObject({ kind: 'svg-rig', id, name: 'Haru test', packVersion: 1 });
    expect(c.pack?.views.front.parts.length).toBeGreaterThan(19);
    await expect(publishRig(id, 'x', { ...fixturePack(), views: {} as never })).rejects.toBeInstanceOf(RigStorageError);
    writeFileSync(join(CHARACTERS_DIR, id, 'rig-v1.json'), JSON.stringify({ version: 1 }));
    await expect(readRig(id)).rejects.toMatchObject({ code: 'invalid' });
    await publishRig(id, 'Haru test', fixturePack());
  });

  it('keeps per-use options through scene save and load, with the artwork from disk', async () => {
    const id = await published();
    const character = await readRigWith(id, { view: 'profile-left', framing: 'full', proportions: { headScale: 1.1 } });
    const scene: Scene = { title: 't', audioId: 'a', durationMs: 100, background: '', shots: [], actors: [{ id: 'h', character, x: 0.5, scale: 1, idleOffsetMs: 0, timeline: { durationMs: 100, cues: [], lines: [] } }] };
    const saved = snapshotScene(scene);
    expect(saved.actors[0].character).toEqual({ artId: id, view: 'profile-left', framing: 'full', proportions: { headScale: 1.1 } });
    const back = await hydrateScene(saved);
    expect(back.actors[0].character).toMatchObject({ kind: 'svg-rig', id, view: 'profile-left', framing: 'full', proportions: { headScale: 1.1 } });
    expect((back.actors[0].character as { pack?: unknown }).pack).toBeDefined();
  });

  it('serves the pack to the browser, adds the sample once and never takes artwork from an export request', async () => {
    const app = createApp();
    const id = await published();
    const pack = await request(app).get(`/api/characters/${id}/rig.json`);
    expect(pack.status).toBe(200);
    expect(pack.body.version).toBe(1);
    expect((await request(app).get(`/api/characters/${randomUUID()}/rig.json`)).status).toBe(404);
    const existed = (await listRigs()).some((c) => c.name === 'Haru (sample)');
    const first = await request(app).post('/api/rig-characters/sample');
    if (!existed) made.push(first.body.character.id); // never delete a sample that was already in the library
    expect((await request(app).post('/api/rig-characters/sample')).body.character.id).toBe(first.body.character.id);
    const missing = await request(app).post('/api/export').send({ audioId: 'nope' });
    expect(missing.status).toBe(404); // the audio check comes first; validation of the character is covered below
    const { validateExport } = await import('../../server/validate');
    const input = validateExport({ character: { kind: 'svg-rig', id, pack: { evil: true }, view: 'back' }, timeline: { durationMs: 1000, cues: [], lines: [] }, format: { aspect: '16:9', transparent: false } });
    expect(input?.character).toEqual({ kind: 'svg-rig', id, name: '', packVersion: 1, view: 'back' });
  });
});

// ---------- generation jobs, with a scripted model ----------

type Turn = (blocks: ChatBlock[]) => unknown | Promise<unknown>;
let script: { design: Turn; view: Turn };
const calls: { tool: string; blocks: ChatBlock[] }[] = [];
const viewOf = (blocks: ChatBlock[]) => {
  const text = blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' ');
  return (['three-quarter-left', 'profile-left', 'back', 'front'] as const).find((v) => text.includes(`Draw the ${v} view`));
};
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  calls.length = 0;
  script = {
    design: () => ({ name: 'Haru', bodyFamily: 'human', symmetric: true, design: 'Round head, teal kurta.', inferred: 'legs' }),
    view: (blocks) => art[viewOf(blocks) ?? 'front'],
  };
  setRigChatForTests((_provider, _system, tool): ToolChat => {
    let current: keyof typeof art = 'front';
    return {
      provider: 'anthropic', model: 'test',
      async send(blocks) {
        calls.push({ tool: tool.name, blocks });
        recordUsage({ provider: 'anthropic', model: 'claude-opus-5-5', kind: 'draw', input: 1000, output: 2000 });
        if (tool.name === 'describe_character') return { input: await script.design(blocks), usage: {} as never };
        current = viewOf(blocks) ?? current;
        // a repair or review turn continues the view the conversation is about
        return { input: await script.view(viewOf(blocks) ? blocks : [{ type: 'text', text: `Draw the ${current} view` }, ...blocks]), usage: {} as never };
      },
    };
  });
});

const settle = async (id: string): Promise<RigJob> => {
  for (let i = 0; i < 500; i++) {
    const j = await getRigJob(id);
    if (!['design', 'front', 'views', 'assemble'].includes(j.stage)) return j;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('job did not settle');
};
const start = async (patch: Partial<Parameters<typeof startRigJob>[0]> = {}) => {
  const j = await startRigJob({ name: '', description: 'a shopkeeper', provider: 'anthropic', model: 'claude-opus-5-5', reference: png, ...patch });
  made.push(j.id);
  return j;
};

describe('svg rig generation job', () => {
  it('offers only models whose provider has a key', () => {
    const models = rigModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === 'anthropic')).toBe(true);
  });

  it('designs, draws, reviews and publishes a complete character, tallying usage', async () => {
    const job = await settle((await start()).id);
    expect(job).toMatchObject({ stage: 'done', name: 'Haru', viewsDone: ['front', 'three-quarter-left', 'profile-left', 'back'], hasCheck: true, hasSheet: true, inferred: 'legs' });
    // design + front + review + 3 views
    expect(job.calls).toBe(6);
    expect(job.input).toBe(6000);
    expect(job.cost).toBeGreaterThan(0);
    const c = await readRig(job.id);
    expect(c.pack?.views['profile-right'].parts.find((p) => p.id === 'arm-left')).toBeDefined(); // mirrored
    expect(calls[0].blocks[0]).toMatchObject({ type: 'image' }); // the reference goes to the design step
    expect(calls.find((c) => c.blocks.some((b) => b.type === 'text' && b.text.includes('as Kitta renders it')))).toBeDefined();
    expect((await listRigJobs()).map((j) => j.id)).not.toContain(job.id);
  });

  it('sends structural problems back for a targeted repair', async () => {
    let bad = true;
    script.view = (blocks) => {
      const v = viewOf(blocks) ?? 'front';
      if (v === 'front' && bad) { bad = false; const { variants: _v, ...mouth } = art.front.parts.find((p) => p.id === 'mouth')!; return { ...art.front, parts: art.front.parts.map((p) => (p.id === 'mouth' ? mouth : p)) }; }
      return art[v];
    };
    const job = await settle((await start()).id);
    expect(job.stage).toBe('done');
    expect(job.repairs).toBeGreaterThanOrEqual(2); // the mouth repair and the visual review
    expect(calls.some((c) => c.blocks.some((b) => b.type === 'text' && /mouth: missing A/.test(b.text)))).toBe(true);
  });

  it('fails visibly on output that stays malformed, and Resume skips what is already accepted', async () => {
    let broken = true;
    script.view = (blocks) => (viewOf(blocks) === 'profile-left' && broken ? { parts: 'nonsense' } : art[viewOf(blocks)!]);
    const failed = await settle((await start()).id);
    expect(failed.stage).toBe('failed');
    expect(failed.message).toMatch(/profile-left view still had problems/);
    expect(failed.viewsDone).toEqual(['front', 'three-quarter-left']);
    expect(existsSync(join(CHARACTERS_DIR, failed.id, 'meta.json'))).toBe(false);
    broken = false;
    const before = calls.length;
    await resumeRigJob(failed.id);
    const done = await settle(failed.id);
    expect(done.stage).toBe('done');
    expect(calls.slice(before).every((c) => c.tool === 'draw_view')).toBe(true); // no new design
    expect(calls.slice(before).some((c) => c.blocks.some((b) => b.type === 'text' && b.text.includes('Draw the front view')))).toBe(false);
  });

  it('refuses body families it cannot animate yet, in words for the person', async () => {
    script.design = () => ({ bodyFamily: 'quadruped', symmetric: true, design: 'a horse' });
    const job = await settle((await start()).id);
    expect(job).toMatchObject({ stage: 'failed' });
    expect(job.message).toMatch(/Only people and two-legged animals/);
  });

  it('reports provider errors and cancels a request in flight', async () => {
    script.design = () => { throw new AnthropicError('no_credit'); };
    const failed = await settle((await start()).id);
    expect(failed.message).toMatch(/out of credit/);
    script.design = () => new Promise(() => {});
    setRigChatForTests((_p, _s, _t): ToolChat => ({ provider: 'anthropic', model: 't', send: (_b, signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')))) }));
    const job = await start();
    const cancelled = await cancelRigJob(job.id);
    expect(cancelled.stage).toBe('cancelled');
  });

  it('rejects a model that is not offered', async () => {
    await expect(startRigJob({ name: '', description: '', provider: 'openai', model: 'gpt-6.2-astra', reference: png })).rejects.toMatchObject({ code: 'bad_model' });
  });

  it('explains view problems in words the model can act on', () => {
    expect(viewProblems({ parts: [] }, 'front').join()).toMatch(/expected 1–100 parts/);
    expect(viewProblems({ ...art.front, mouthPart: null }, 'front').join()).toMatch(/needs "mouth"/);
    expect(viewProblems(art.back, 'back')).toEqual([]);
  });
});

describe('svg rig job routes', () => {
  it('requires a reference picture and a known provider', async () => {
    const app = createApp();
    expect((await request(app).post('/api/rig-jobs').field('provider', 'anthropic').field('model', 'claude-opus-5-5')).status).toBe(400);
    expect((await request(app).get('/api/rig-models')).body.models.length).toBeGreaterThan(0);
    expect((await request(app).get(`/api/rig-jobs/${randomUUID()}`)).status).toBe(404);
  });
});
