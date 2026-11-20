import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildScene, captureScene, saveScene, loadScene, SceneError, SCENES_DIR, validSceneName } from '../../server/scene';
import { AUDIO_DIR } from '../../server/audio';
import { CHARACTERS_DIR } from '../../server/characters';
import { STARTERS } from '../../shared/character/starters';
import type { SceneSource } from '../../shared/scene';
import type { ArtCharacter } from '../../shared/types';

const hello = join(__dirname, '../fixtures/hello.wav');
const robot = join(__dirname, '../fixtures/magenta-robot.png');
const { name: _a, ...kit } = STARTERS.kit;
const { name: _b, ...milo } = STARTERS.milo;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#fff"/></svg>';

const source: SceneSource = {
  title: 'Test', background: 'set.svg',
  actors: [
    { id: 'a', character: kit, voice: 'default', speaker: 'woman', x: 0.3, scale: 1, idleOffsetMs: 0 },
    { id: 'b', character: milo, voice: 'default', speaker: 'man', x: 0.7, scale: 1, idleOffsetMs: 300 },
  ],
  lines: [{ actor: 'a', text: 'Hello', expression: 'happy', gesture: 'wave' }, { actor: 'b', text: 'Hi', expression: 'neutral', gesture: 'nod' }],
  shots: [{ line: 0, at: 0, name: 'wide', zoom: 1, focusX: 0.5, focusY: 0.5 }],
  reactions: [],
};

let dir: string;
let speak: ReturnType<typeof vi.fn>;
const names: string[] = [];
const artIds: string[] = [];
const audioIds: string[] = [];
const tracked = async (s: SceneSource, d = dir) => { const scene = await buildScene(s, d, speak as any); audioIds.push(scene.audioId); return scene; };
const sceneName = () => { const n = `test-build-${randomUUID().slice(0, 8)}`; names.push(n); return n; };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kitta-scene-src-'));
  writeFileSync(join(dir, 'set.svg'), svg);
  speak = vi.fn(async () => readFileSync(hello));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
afterAll(() => {
  for (const n of names) rmSync(join(SCENES_DIR, n), { recursive: true, force: true });
  for (const id of audioIds) rmSync(join(AUDIO_DIR, `${id}.wav`), { force: true });
  for (const id of artIds) rmSync(join(CHARACTERS_DIR, id), { recursive: true, force: true });
});

describe('buildScene', () => {
  it('voices each line with its actor\'s voice, in order', async () => {
    const scene = await tracked(source);
    expect(speak.mock.calls.map(([l]) => [l.text, l.voice, l.speaker])).toEqual([['Hello', 'default', 'woman'], ['Hi', 'default', 'man']]);
    expect(speak.mock.calls[0][0].variability).toBe('steady');
    expect(scene.durationMs).toBeGreaterThan(0);
    expect(scene.background.startsWith('data:image/svg+xml;base64,')).toBe(true);
  }, 30_000);

  it('reports source problems before generating any voice', async () => {
    const bad = { ...source, shots: [] };
    await expect(buildScene(bad, dir, speak as any)).rejects.toBeInstanceOf(SceneError);
    expect(speak).not.toHaveBeenCalled();
  });

  it('reports a missing background before generating any voice', async () => {
    await expect(buildScene({ ...source, background: 'nope.svg' }, dir, speak as any)).rejects.toBeInstanceOf(SceneError);
    expect(speak).not.toHaveBeenCalled();
  });

  it('saves nothing when a voice fails', async () => {
    const name = sceneName();
    speak.mockRejectedValueOnce(new Error('down'));
    await expect(buildScene(source, dir, speak as any).then((s) => saveScene(name, s))).rejects.toThrow('down');
    expect(await loadScene(name)).toBeNull();
  });
});

describe('saveScene and loadScene', () => {
  it('round-trips a saved scene', async () => {
    const name = sceneName();
    const scene = await tracked(source);
    await saveScene(name, scene);
    expect(await loadScene(name)).toEqual(scene);
  }, 30_000);

  it('stores AI references and refreshes replaced poses in new and legacy scenes', async () => {
    const id = randomUUID();
    artIds.push(id);
    const dir = join(CHARACTERS_DIR, id);
    mkdirSync(dir, { recursive: true });
    const old = 'neutral-a1.png';
    const current = 'neutral-a2.png';
    copyFileSync(robot, join(dir, old));
    const actor: ArtCharacter = { kind: 'art', id, name: 'Robo', prompt: 'p', style: 's', images: { neutral: { file: old, mouth: null } } };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(actor));
    const scene = await tracked({ ...source, actors: [{ ...source.actors[0], character: { artId: id } }, source.actors[1]] });
    const modern = sceneName();
    const legacy = sceneName();
    await saveScene(modern, scene);
    const built = (name: string) => join(SCENES_DIR, name, 'built.json');
    expect(JSON.parse(readFileSync(built(modern), 'utf8')).actors[0].character).toEqual({ artId: id });
    mkdirSync(join(SCENES_DIR, legacy), { recursive: true });
    writeFileSync(built(legacy), JSON.stringify(scene));
    copyFileSync(robot, join(dir, current));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...actor, images: { neutral: { file: current, mouth: null } } }));
    rmSync(join(dir, old));
    const captured = await captureScene(scene);
    expect(captured.scene.actors[0].character).toMatchObject({ images: { neutral: { file: current } } });
    expect(Object.keys(captured.images[id])).toEqual([current]);
    for (const name of [modern, legacy]) {
      const loaded = (await loadScene(name))!;
      expect((await captureScene(loaded)).images).toEqual({ [id]: { [current]: 'data:image/png;base64,' + readFileSync(robot).toString('base64') } });
    }
  }, 30_000);

  it('refuses names that are not plain slugs', async () => {
    const scene = await tracked(source);
    await expect(saveScene('../x', scene)).rejects.toBeInstanceOf(SceneError);
    expect(await loadScene('../x')).toBeNull();
  }, 30_000);
});

describe('captureScene', () => {
  it('loads the images of art actors, keyed by character id', async () => {
    const id = randomUUID();
    artIds.push(id);
    mkdirSync(join(CHARACTERS_DIR, id), { recursive: true });
    copyFileSync(robot, join(CHARACTERS_DIR, id, 'neutral-a1.png'));
    const meta: ArtCharacter = { kind: 'art', id, name: 'Robo', prompt: 'p', style: 's', images: { neutral: { file: 'neutral-a1.png', mouth: null } } };
    writeFileSync(join(CHARACTERS_DIR, id, 'meta.json'), JSON.stringify(meta));

    const art: SceneSource = { ...source, actors: [{ ...source.actors[0], character: { artId: id } }, source.actors[1]] };
    const scene = await tracked(art);
    const { images } = await captureScene(scene);
    expect(Object.keys(images)).toEqual([id]);
    expect(images[id]['neutral-a1.png'].startsWith('data:image/png;base64,')).toBe(true);
  }, 30_000);
});

describe('validSceneName', () => {
  it('accepts lowercase letters, digits and dashes only', () => {
    expect(validSceneName('first-scene-2')).toBe(true);
    for (const bad of ['My_Scene', 'Scene', 'a b', '', 'a'.repeat(65)]) expect(validSceneName(bad)).toBe(false);
  });
});
