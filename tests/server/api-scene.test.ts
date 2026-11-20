import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../../server/index';
import { saveScene, SCENES_DIR } from '../../server/scene';
import type { Scene } from '../../shared/scene';

const name = 'test-api-scene';
const scene: Scene = { title: 'T', audioId: '11111111-1111-4111-8111-111111111111', durationMs: 1000, background: 'data:image/svg+xml;base64,', actors: [], shots: [{ startMs: 0, name: 'wide', zoom: 1, focusX: 0.5, focusY: 0.5 }] };
afterAll(() => rmSync(join(SCENES_DIR, name), { recursive: true, force: true }));

describe('scene API', () => {
  it('returns 404 for a missing scene and for a bad name', async () => {
    const app = createApp();
    const error = 'Scene not found. Run npm run scene first.';
    await request(app).get('/api/scenes/no-such-scene').expect(404, { error });
    await request(app).get('/api/scenes/BAD..NAME').expect(404, { error });
  });

  it('returns a saved scene', async () => {
    await saveScene(name, scene);
    const res = await request(createApp()).get(`/api/scenes/${name}`).expect(200);
    expect(res.body).toEqual(scene);
  });
  it('reports a deleted AI character in a saved scene', async () => {
    const missing = randomUUID();
    await saveScene(name, { ...scene, actors: [{
      id: 'actor', character: { kind: 'art', id: missing, name: 'Deleted', prompt: '', style: '', images: {} },
      x: 0.5, scale: 1, idleOffsetMs: 0, timeline: { durationMs: 1000, cues: [], lines: [] },
    }] });
    await request(createApp()).get('/api/scenes/' + name).expect(409, {
      error: 'This scene uses an AI character that no longer exists.',
    });
  });

});
