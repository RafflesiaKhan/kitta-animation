// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { renderScene } from '../../server/render';
import { randomUUID } from 'node:crypto';
import { STARTERS } from '../../shared/character/starters';
import type { Scene } from '../../shared/scene';
import express from 'express';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { projectRoutes } from '../../server/projects';

vi.mock('../../server/characters', () => ({ getCharacter: async () => ({ name: 'Saved Mina' }) }));

it('keeps imported media and episodes isolated and reloadable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kitta-projects-'));
  const app = () => express().use(express.json()).use('/projects', projectRoutes(root));
  try {
    const first = request(app());
    const { body: a } = await first.post('/projects').send({ name: 'Mango Lane', style: 'ai' }).expect(201);
    const { body: b } = await first.post('/projects').send({ name: 'Courtyard Tales', style: 'svg' }).expect(201);
    const path = '/projects/' + a.id;
    for (const [filename, contentType] of [["tests/fixtures/magenta-robot.png", "image/png"], ["samples/first-scene/set.svg", "image/svg+xml"], ["tests/fixtures/hello.wav", "audio/wav"]]) {
      await first.post(path + "/assets").attach("media", filename, { contentType }).expect(201);
    }
    const characterId = '11d2def4-2c05-4eec-bd4e-724484b7e982';
    await first.post(path + '/assets').send({ characterId }).expect(201);
    await first.post(path + '/assets').send({ characterId }).expect(200);
    const { body: episode } = await first.post(path + '/episodes').send({ title: 'The Last Mango' }).expect(201);

    const reopened = request(app());
    const { body: saved } = await reopened.get(path).expect(200);
    expect(saved.assets.map((asset: { kind: string }) => asset.kind)).toEqual(['image', 'svg', 'audio', 'character']);
    const files = ['tests/fixtures/magenta-robot.png', 'samples/first-scene/set.svg', 'tests/fixtures/hello.wav'];
    for (const [index, file] of files.entries()) {
      const asset = saved.assets[index];
      expect(asset).toMatchObject({ location: 'media/' + asset.id, provenance: 'imported' });
      expect(await readFile(join(root, a.id, asset.location))).toEqual(await readFile(file));
    }
    expect(saved.episodes).toEqual([episode]);
    await first.post(path + '/assets').attach('media', Buffer.from('fake'), { filename: 'fake.png', contentType: 'image/png' }).expect(400);
    const svg = '/assets/' + saved.assets[1].id;
    await reopened.get(path + svg).expect('Content-Type', /image\/svg/).expect(200);
    await reopened.get('/projects/' + b.id + svg).expect(404);
    const { body: second } = await reopened.get('/projects/' + b.id).expect(200);
    expect(second.assets).toEqual([]);
    expect(second.episodes).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('contains traversal requests and preserves legacy project records', async () => {
  const base = await mkdtemp(join(tmpdir(), 'kitta-project-boundary-'));
  const root = join(base, 'projects');
  const outside = join(base, 'outside');
  const id = '11d2def4-2c05-4eec-bd4e-724484b7e982';
  const episode = { id: 'old', title: 'Draft episode', scene: { sample: { videoUrl: '/api/exports/old.mp4' } } };
  const draft = JSON.stringify({ id, name: 'Draft', premise: '', assets: [], episodes: [episode] });
  const record = join(root, id, 'project.json');
  const client = request(express().use(express.json()).use('/projects', projectRoutes(root)));
  const path = '/projects/' + id;
  try {
    await mkdir(join(root, id), { recursive: true });
    await mkdir(outside);
    await writeFile(record, draft);
    const corrupt = join(root, '11d2def4-2c05-4eec-bd4e-724484b7e983');
    await mkdir(corrupt);
    await writeFile(join(corrupt, 'project.json'), '{');
    await client.get('/projects').expect(200).expect(({ body }) => {
      expect(body.map((project: { id: string }) => project.id)).toEqual([id]);
    });
    await writeFile(join(outside, 'project.json'), '{}');
    await client.get(path).expect(200).expect(({ body }) => expect(body.style).toBe('svg'));
    expect(await readFile(record, 'utf8')).toBe(draft);
    await client.post('/projects').send({ name: 'Invalid', style: 'mixed' }).expect(400);
    await client.get('/projects/%2e%2e%2foutside').expect(404);
    await client.post('/projects/%2e%2e%2foutside/assets').attach('media', 'tests/fixtures/magenta-robot.png').expect(404);
    await client.get(path + '/assets/%2e%2e%2f%2e%2e%2foutside%2fproject.json').expect(404);
    const form = '--fixture\r\nContent-Disposition: form-data; name="media"; filename="../../outside/escaped.svg"\r\nContent-Type: image/svg+xml\r\n\r\n<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>\r\n--fixture--\r\n';
    const { body } = await client.post(path + '/assets').set('Content-Type', 'multipart/form-data; boundary=fixture').send(form).expect(201);
    const asset = body.assets[0];
    expect(asset).toMatchObject({ name: 'escaped.svg', location: 'media/' + asset.id });
    await client.get(path + '/assets/' + asset.id).expect('Content-Security-Policy', "sandbox; default-src 'none'")
      .expect('X-Content-Type-Options', 'nosniff').expect('Content-Disposition', /attachment/).expect(200);
    expect(await readdir(outside)).toEqual(['project.json']);
    expect(await readFile(join(outside, 'project.json'), 'utf8')).toBe('{}');
    expect(JSON.parse(await readFile(record, 'utf8')).episodes).toEqual([episode]);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

it('saves the sample once and reopens it with project-owned audio and timing', async () => {
  const base = await mkdtemp(join(tmpdir(), 'kitta-project-scene-'));
  const audioDir = join(base, 'source-audio');
  const audioId = randomUUID();
  const source = join(audioDir, audioId + '.wav');
  const wav = await readFile('tests/fixtures/hello.wav');
  const svg = await readFile('samples/first-scene/set.svg');
  const scene: Scene = {
    title: 'The Missing Mango', audioId, durationMs: 100,
    background: 'data:image/svg+xml;base64,' + svg.toString('base64'),
    shots: [{ startMs: 0, name: 'wide', zoom: 1, focusX: 0.5, focusY: 0.5 }],
    actors: [{ id: 'mina', character: STARTERS.pip, x: 0.5, scale: 0.8, idleOffsetMs: 0,
      timeline: { durationMs: 100, cues: [{ startMs: 0, endMs: 100, shape: 'A' }], lines: [] } }],
  };
  const loadSample = vi.fn(async () => scene);
  const app = () => express().use(express.json()).use('/projects', projectRoutes(join(base, 'projects'), { loadSample, audioDir }));
  try {
    await mkdir(audioDir);
    await writeFile(source, wav);
    const first = request(app());
    const { body: project } = await first.post('/projects').send({ name: 'Mango Lane', style: 'svg' }).expect(201);
    const path = '/projects/' + project.id;
    const { body: episode } = await first.post(path + '/episodes').send({ title: 'Episode 1' }).expect(201);
    const url = path + '/episodes/' + episode.id;
    const { body: saved } = await first.post(url + '/sample').expect(201);
    expect(saved.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(saved.actors[0].timeline.cues[0].id).toMatch(/^[a-f0-9-]{36}$/);
    const baseline = join(base, 'baseline.mp4');
    await renderScene({ scene, audioPath: source, outPath: baseline });
    await rm(source);
    const reopened = request(app());
    await reopened.post(url + '/sample').expect(200, saved);
    expect(loadSample).toHaveBeenCalledTimes(1);
    const { body: preview } = await reopened.get(url + '/scene').expect(200);
    expect(preview.scene).toMatchObject({ ...scene, audioId: saved.audioAssetId });
    expect(preview.audioUrl).toBe('/api' + path + '/assets/' + saved.audioAssetId);
    await reopened.get(path + '/assets/' + saved.audioAssetId).expect('Content-Type', /audio\/wav/).expect(200);
    expect(await readFile(join(base, 'projects', project.id, 'media', saved.audioAssetId))).toEqual(wav);
    const output = join(base, 'reopened.mp4');
    const rendered = await reopened.post(url + '/render').buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      }).expect('Content-Type', /video\/mp4/).expect(200);
    await writeFile(output, rendered.body);
    const hashes = (file: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'framemd5', '-']).toString();
    expect(hashes(output)).toBe(hashes(baseline));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}, 30_000);
