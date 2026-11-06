// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { renderScene } from '../../server/render';
import { randomUUID } from 'node:crypto';
import { STARTERS } from '../../shared/character/starters';
import type { Scene } from '../../shared/scene';
import express from 'express';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { projectRoutes } from '../../server/projects';

vi.mock(import('../../server/characters'), async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, getCharacter: async (id: string) => id === '11d2def4-2c05-4eec-bd4e-724484b7e982'
    ? { kind: 'art', id, name: 'Saved Mina', prompt: '', style: '', images: { neutral: { file: 'neutral-test.png', mouth: null } } } : actual.getCharacter(id) };
});

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
    const { body: episode } = await first.post(path + '/episodes').send({ title: 'The Last Mango' }).expect(201);

    const reopened = request(app());
    const { body: saved } = await reopened.get(path).expect(200);
    await reopened.post(path + '/assets').send({ characterId: randomUUID() }).expect(400);
    expect(saved.assets.map((asset: { kind: string }) => asset.kind)).toEqual(['image', 'svg', 'audio']);
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
  const legacyCharacter = { id: randomUUID(), name: 'Draft cast', kind: 'character', characterId: randomUUID(), provenance: 'saved-character' };
  const draft = JSON.stringify({ id, name: 'Draft', premise: '', assets: [legacyCharacter], episodes: [episode] });
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
    await client.get(path).expect(200).expect(({ body }) => {
      expect(body.style).toBe('svg');
      expect(body.assets).toEqual([legacyCharacter]);
    });
    expect(await readFile(record, 'utf8')).toBe(draft);
    await client.post('/projects').send({ name: 'Invalid', style: 'mixed' }).expect(400);
    await client.get('/projects/%2e%2e%2foutside').expect(404);
    await client.post('/projects/%2e%2e%2foutside/assets').attach('media', 'tests/fixtures/magenta-robot.png').expect(404);
    await client.get(path + '/assets/%2e%2e%2f%2e%2e%2foutside%2fproject.json').expect(404);
    const form = '--fixture\r\nContent-Disposition: form-data; name="media"; filename="../../outside/escaped.svg"\r\nContent-Type: image/svg+xml\r\n\r\n<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>\r\n--fixture--\r\n';
    const { body } = await client.post(path + '/assets').set('Content-Type', 'multipart/form-data; boundary=fixture').send(form).expect(201);
    const asset = body.assets.at(-1);
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
    const recordPath = join(base, 'projects', project.id, 'project.json');
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    record.episodes[0].projectScene.actors[0].character = { artId: randomUUID() };
    await writeFile(recordPath, JSON.stringify(record));
    const error = { error: 'This scene uses an AI character that no longer exists.' };
    await reopened.get(url + '/scene').expect(409, error);
    await reopened.post(url + '/render').expect(409, error);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}, 30_000);

async function withAssetRoute(run: (client: ReturnType<typeof request>, path: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'kitta-project-assets-'));
  try {
    const client = request(express().use(express.json()).use('/projects', projectRoutes(root)));
    const { body } = await client.post('/projects').send({ name: 'Uploads', style: 'svg' }).expect(201);
    await run(client, '/projects/' + body.id + '/assets');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

it.each([
  '\ufeff<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg"/>',
  '<!DOCTYPE svg [<!ENTITY example "quoted > ]"> <!-- ] -->]><svg/>',
  '<?xml version="1.0"?><!-- vector --><svg:svg xmlns:svg="http://www.w3.org/2000/svg"/>',
])('accepts an SVG prolog and root in %s', async source => {
  await withAssetRoute(async (client, path) => {
    await client.post(path).attach('media', Buffer.from(source), { filename: 'vector.svg', contentType: 'image/svg+xml' }).expect(201);
    await client.post(path).attach('media', Buffer.from('not an svg'), { filename: 'fake.svg', contentType: 'image/svg+xml' }).expect(400);
  });
});

it('normalizes a browser M4A MIME type and rejects invalid bytes', async () => {
  await withAssetRoute(async (client, path) => {
    const options = { filename: 'voice.m4a', contentType: 'audio/x-m4a' };
    const { body } = await client.post(path).attach('media', Buffer.from('\x00\x00\x00\x0cftypM4A '), options).expect(201);
    expect(body.assets[0].mime).toBe('audio/mp4');
    await client.post(path).attach('media', Buffer.from('invalid'), options).expect(400);
  });
});

it('accepts a 30 MiB WAV upload', async () => {
  await withAssetRoute(async (client, path) => {
    const bytes = Buffer.alloc(30 * 1024 * 1024);
    bytes.write('RIFF');
    bytes.write('WAVE', 8);
    await client.post(path).attach('media', bytes, { filename: 'long.wav', contentType: 'audio/wav' }).expect(201);
  });
});

it('checks the project before parsing a multipart upload', async () => {
  await withAssetRoute(async (client, path) => {
    const malformed = (url: string) => client.post(url).set('Content-Type', 'multipart/form-data').send('missing boundary');
    // Multer cannot parse this body. Only the existing project's request reaches it.
    await malformed('/projects/' + randomUUID() + '/assets').expect(404, { error: 'Project not found.' });
    expect((await malformed(path)).status).not.toBe(404);
  });
});

it('accepts an SVG after 100,000 comments and responds to the next request', async () => {
  await withAssetRoute(async (client, path) => {
    const comments = '<!--a-->'.repeat(100_000);
    const options = { filename: 'comments.svg', contentType: 'image/svg+xml' };
    const start = performance.now();
    await client.post(path).attach('media', Buffer.from(comments + '<html/>'), options).expect(400);
    await client.get(path.slice(0, -'/assets'.length)).expect(200);
    await client.post(path).attach('media', Buffer.from(comments + '<svg/>'), options).expect(201);
    await client.get(path.slice(0, -'/assets'.length)).expect(200);
    expect(performance.now() - start).toBeLessThan(2_000);
  });
});

it('lists projects by creation date, with undated drafts last', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kitta-project-order-'));
  try {
    const client = request(express().use(express.json()).use('/projects', projectRoutes(root)));
    const { body: created } = await client.post('/projects').send({ name: 'Newest', style: 'svg' }).expect(201);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    const older = { id: '00000000-0000-4000-8000-000000000002', name: 'Older', createdAt: '2020-01-01T00:00:00.000Z' };
    const draft = { id: '00000000-0000-4000-8000-000000000001', name: 'Draft' };
    for (const project of [draft, older]) {
      await mkdir(join(root, project.id));
      await writeFile(join(root, project.id, 'project.json'), JSON.stringify({ premise: '', assets: [], episodes: [], ...project }));
    }
    const { body } = await client.get('/projects').expect(200);
    expect(body.map((project: { name: string }) => project.name)).toEqual(['Newest', 'Older', 'Draft']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('reuses a project character and safe set without sharing episode performance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kitta-project-cast-'));
  const app = () => request(express().use(express.json()).use('/projects', projectRoutes(root)));
  const voice = { provider: 'voicestudio', voice: 'default', engine: 'omni', speaker: 'man', variability: 'steady' };
  const character = { name: 'Pip', character: STARTERS.pip, voice, anchorY: 0.75 };
  try {
    const client = app();
    const { body: project } = await client.post('/projects').send({ name: 'Cast', style: 'svg' }).expect(201);
    const path = '/projects/' + project.id;
    const { body: updated } = await client.post(path + '/characters').send(character).expect(201);
    const saved = updated.characters[0];
    expect(saved).toMatchObject({ name: 'Pip', voice, anchorY: 0.75 });
    const { body: revised } = await client.patch(path + '/characters/' + saved.id).send({ ...character, name: 'Pip revised' }).expect(200);
    expect(revised.characters[0]).toMatchObject({ id: saved.id, name: 'Pip revised' });
    const { body: painted } = await client.post('/projects').send({ name: 'Painted', style: 'ai' }).expect(201);
    const paintedPath = '/projects/' + painted.id + '/characters';
    await client.post(paintedPath).send(character).expect(400);
    const { body: ai } = await client.post(paintedPath).send({ ...character, character: { artId: '11d2def4-2c05-4eec-bd4e-724484b7e982' } }).expect(201);
    await client.post(path + '/characters').send({ ...character, character: { artId: randomUUID() } }).expect(400);
    const { body: imported } = await client.post(path + '/assets').attach('media', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"><rect width="32" height="24" fill="red"/></svg>'), { filename: 'set.svg', contentType: 'image/svg+xml' }).expect(201);
    const backgroundAssetId = imported.assets[0].id;
    const { body: a } = await client.post(path + '/episodes').send({ title: 'First' }).expect(201);
    const { body: b } = await client.post(path + '/episodes').send({ title: 'Second' }).expect(201);
    const scenePath = (id: string) => path + '/episodes/' + id + '/scene';
    const shot = { characterId: saved.id, backgroundAssetId, expression: 'neutral', gesture: 'wave', x: 0.5, scale: 0.7, groundY: 0.8 };
    await client.put(scenePath(a.id)).send(shot).expect(200);
    const media = join(root, project.id, 'media');
    const cache = (await readdir(media)).find(name => name.startsWith(backgroundAssetId + '.') && name.endsWith('.png'));
    expect(cache).toBeDefined();
    const before = await stat(join(media, cache!));
    await client.put(scenePath(b.id)).send(shot).expect(200);
    await client.put(scenePath(b.id)).send({ ...shot, expression: 'happy' }).expect(200);
    await client.put(scenePath(b.id)).send({ ...shot, characterId: ai.characters[0].id }).expect(400);
    await client.put(scenePath(b.id)).send({ ...shot, backgroundAssetId: randomUUID() }).expect(400);
    const reopened = app();
    const { body: first } = await reopened.get(scenePath(a.id)).expect(200);
    const { body: second } = await reopened.get(scenePath(b.id)).expect(200);
    expect(first).toMatchObject({ audioUrl: null, scene: { actors: [{ anchorY: .75, groundY: .8, timeline: { marks: { expressions: [{ expression: 'neutral' }] } } }] } });
    expect(second.scene.actors[0].timeline.marks.expressions[0].expression).toBe('happy');
    expect(first.scene.background).toMatch(/^data:image\/png;base64,/);
    expect(second.scene.background).toBe(first.scene.background);
    await client.post(path + '/episodes/' + b.id + '/render').expect('Content-Type', /video\/mp4/).expect(200);
    expect((await stat(join(media, cache!))).mtimeMs).toBe(before.mtimeMs);
    const aiPath = '/projects/' + painted.id;
    const { body: aiSet } = await client.post(aiPath + '/assets').attach('media', Buffer.from('<svg width="32" height="24"/>'),
      { filename: 'set.svg', contentType: 'image/svg+xml' }).expect(201);
    const { body: aiEpisode } = await client.post(aiPath + '/episodes').send({ title: 'AI shot' }).expect(201);
    const aiScenePath = aiPath + '/episodes/' + aiEpisode.id + '/scene';
    const aiShot = { ...shot, characterId: ai.characters[0].id, backgroundAssetId: aiSet.assets[0].id };
    const { body: aiSaved } = await client.put(aiScenePath).send(aiShot).expect(200);
    const aiRecordPath = join(root, painted.id, 'project.json');
    const aiRecord = JSON.parse(await readFile(aiRecordPath, 'utf8'));
    const stale = { ...ai.characters[0], id: randomUUID(), character: { artId: randomUUID() } };
    aiRecord.characters.push(stale);
    await writeFile(aiRecordPath, JSON.stringify(aiRecord));
    await client.put(aiScenePath).send({ ...aiShot, characterId: stale.id }).expect(409,
      { error: 'This scene uses an AI character that no longer exists.' });
    const { body: aiReopened } = await client.get(aiPath).expect(200);
    expect(aiReopened.episodes[0].projectScene).toEqual(aiSaved.projectScene);
    await writeFile(join(root, project.id, 'media', backgroundAssetId), '<svg><script>alert(1)</script></svg>');
    await reopened.get(scenePath(a.id)).expect(409);
    await reopened.post(path + '/episodes/' + a.id + '/render').expect(409);
    await reopened.put(scenePath(b.id)).send(shot).expect(409);
    const circles = '<circle cx="1024" cy="1024" r="1000" stroke="black" fill="none" stroke-width="200" stroke-dasharray="0.1"/>'.repeat(200);
    await writeFile(join(media, backgroundAssetId), '<svg width="2048" height="2048">' + circles + '</svg>');
    let finished = false;
    const heavy = reopened.get(scenePath(a.id)).then(response => { finished = true; return response; });
    await new Promise(resolve => setTimeout(resolve, 200));
    const started = performance.now();
    await reopened.get('/projects').expect(200);
    expect(finished).toBe(false);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(await heavy).toMatchObject({ status: 409, body: { error: expect.stringMatching(/time limit/i) } });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 25_000);
