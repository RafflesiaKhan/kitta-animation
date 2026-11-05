// @vitest-environment node
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
