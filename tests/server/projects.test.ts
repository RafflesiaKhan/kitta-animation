// @vitest-environment node
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { projectRoutes } from '../../server/projects';

const sample = { scene: { durationMs: 1000 }, audioUrl: '/api/audio/test', videoUrl: '/api/exports/test.mp4', renderMs: 50 };
vi.mock('../../server/scene-sample', () => ({ createSceneSample: vi.fn(async () => sample) }));
vi.mock('../../server/characters', () => ({ getCharacter: async () => ({ name: 'Saved Mina' }) }));

it('keeps imported media and a rendered episode isolated and reloadable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kitta-projects-'));
  const app = () => express().use(express.json()).use('/projects', projectRoutes(root, root));
  try {
    const first = request(app());
    const { body: a } = await first.post('/projects').send({ name: 'Mango Lane' }).expect(201);
    const { body: b } = await first.post('/projects').send({ name: 'Courtyard Tales' }).expect(201);
    const path = '/projects/' + a.id;
    for (const [filename, contentType] of [
      ['set.png', 'image/png'], ['prop.svg', 'image/svg+xml'], ['voice.wav', 'audio/wav'],
    ]) {
      await first.post(path + '/assets').attach('media', Buffer.from('fixture'), { filename, contentType }).expect(201);
    }
    const characterId = '11d2def4-2c05-4eec-bd4e-724484b7e982';
    await first.post(path + '/assets').send({ characterId }).expect(201);
    await first.post(path + '/assets').send({ characterId }).expect(200);
    const { body: episode } = await first.post(path + '/episodes').send({ title: 'The Last Mango' }).expect(201);
    const samplePath = path + '/episodes/' + episode.id + '/sample';
    await first.post(samplePath).expect(200, sample);

    const reopened = request(app());
    const { body: saved } = await reopened.get(path).expect(200);
    expect(saved.assets.map((asset: { kind: string }) => asset.kind)).toEqual(['image', 'svg', 'audio', 'character']);
    expect(saved.episodes[0].scene.sample).toEqual(sample);
    const svg = '/assets/' + saved.assets[1].id;
    await reopened.get(path + svg).expect('Content-Type', /image\/svg/).expect(200);
    await reopened.get('/projects/' + b.id + svg).expect(404);
    const { body: second } = await reopened.get('/projects/' + b.id).expect(200);
    expect(second.assets).toEqual([]);
    expect(second.episodes).toEqual([]);
    await reopened.post(samplePath).expect(200, sample);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
