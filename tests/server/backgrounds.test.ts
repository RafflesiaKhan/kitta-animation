// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/index';
import { BackgroundError, deleteBackground, listBackgrounds, saveBackground } from '../../server/backgrounds';

const png = await readFile('tests/fixtures/magenta-robot.png');
const jpeg = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-frames:v', '1', '-f', 'mjpeg', 'pipe:1'], { input: png });
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"><rect width="32" height="24" fill="#123456"/></svg>');

describe('studio backgrounds', () => {
  it('stores PNG, JPEG and SVG uploads as safe PNGs and persists them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kitta-backgrounds-'));
    try {
      const first = request(createApp({ backgroundsDir: root }));
      const created: Array<{ id: string; name: string }> = [];
      for (const [name, mime, bytes] of [['room.png', 'image/png', png], ['room.jpg', 'image/jpeg', jpeg], ['set.svg', 'image/svg+xml', svg]] as const) {
        const response = await first.post('/api/backgrounds').attach('file', bytes, { filename: name, contentType: mime }).expect(201);
        expect(response.body.background).toMatchObject({ name, mime });
        expect(response.body.background.id).toMatch(/^[0-9a-f-]{36}$/);
        created.push(response.body.background);
        const image = await first.get('/api/backgrounds/' + response.body.background.id).expect(200);
        expect(image.headers['content-type']).toMatch(/^image\/png/);
        expect(image.body.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      }
      expect((await first.get('/api/backgrounds')).body.backgrounds.map((item: { name: string }) => item.name).sort()).toEqual(['room.jpg', 'room.png', 'set.svg']);
      const reopened = request(createApp({ backgroundsDir: root }));
      expect((await reopened.get('/api/backgrounds')).body.backgrounds).toHaveLength(3);
      for (const item of created) await stat(join(root, item.id + '.png'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);

  it('rejects hostile SVGs before rendering and does not leave files behind', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kitta-backgrounds-hostile-'));
    try {
      const before = await readdir(root);
      const hostile = Buffer.from('<!DOCTYPE svg [<!ENTITY steal SYSTEM "file:///tmp/private.svg">]><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://example.invalid/x"/><text>&steal;</text></svg>');
      await request(createApp({ backgroundsDir: root })).post('/api/backgrounds').attach('file', hostile, { filename: 'unsafe.svg', contentType: 'image/svg+xml' }).expect(400);
      expect(await readdir(root)).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid IDs, names, MIME types and oversized files without creating files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kitta-backgrounds-invalid-'));
    try {
      const app = request(createApp({ backgroundsDir: root }));
      await app.get('/api/backgrounds/not-a-uuid').expect(404);
      await app.get('/api/backgrounds/%2e%2e%2fmeta.json').expect(404);
      await app.delete('/api/backgrounds/not-a-uuid').expect(404);
      await expect(saveBackground('image/png', png, '../escape.png', root)).rejects.toBeInstanceOf(BackgroundError);
      const escaped = (await app.post('/api/backgrounds').attach('file', png, { filename: '../escape.png', contentType: 'image/png' })).body.background;
      await app.delete('/api/backgrounds/' + escaped.id).expect(204);
      await app.post('/api/backgrounds').attach('file', png, { filename: 'image.gif', contentType: 'image/gif' }).expect(400);
      await app.post('/api/backgrounds').attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }).expect(400);
      expect(await readdir(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('deletes only the selected background and its metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kitta-backgrounds-delete-'));
    try {
      const app = request(createApp({ backgroundsDir: root }));
      const one = (await app.post('/api/backgrounds').attach('file', png, { filename: 'one.png', contentType: 'image/png' })).body.background;
      const two = (await app.post('/api/backgrounds').attach('file', png, { filename: 'two.png', contentType: 'image/png' })).body.background;
      await app.delete('/api/backgrounds/' + one.id).expect(204);
      await app.get('/api/backgrounds/' + one.id).expect(404);
      await app.get('/api/backgrounds/' + two.id).expect(200);
      expect((await app.get('/api/backgrounds')).body.backgrounds.map((item: { id: string }) => item.id)).toEqual([two.id]);
      expect(await readdir(root)).toEqual(['meta.json', two.id + '.png'].sort());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('serializes concurrent metadata mutations without losing records', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kitta-backgrounds-concurrent-'));
    try {
      const saved = await Promise.all(Array.from({ length: 12 }, (_, index) => saveBackground('image/png', png, `background-${index}.png`, root)));
      expect(await listBackgrounds(root)).toHaveLength(saved.length);
      expect(await readdir(root)).toHaveLength(saved.length + 1);
      await Promise.all(saved.map((record) => deleteBackground(record.id, root)));
      expect(await listBackgrounds(root)).toEqual([]);
      expect(await readdir(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);

  it('reports malformed metadata and never overwrites it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kitta-backgrounds-corrupt-'));
    const corrupt = '{"not":"a background list"}';
    try {
      await writeFile(join(root, 'meta.json'), corrupt);
      await expect(listBackgrounds(root)).rejects.toMatchObject({ code: 'corrupt' });
      await expect(saveBackground('image/png', png, 'new.png', root)).rejects.toMatchObject({ code: 'corrupt' });
      expect(await readFile(join(root, 'meta.json'), 'utf8')).toBe(corrupt);
      const response = await request(createApp({ backgroundsDir: root })).get('/api/backgrounds');
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Background metadata is unreadable.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
