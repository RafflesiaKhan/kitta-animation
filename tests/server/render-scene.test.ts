import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderScene } from '../../server/render';
import { frameCount } from '../../shared/timeline';
import { STARTERS } from '../../shared/character/starters';
import type { Scene } from '../../shared/scene';
import type { Timeline } from '../../shared/types';

const fixture = join(__dirname, '../fixtures/hello.wav');
const tmp = mkdtempSync(join(tmpdir(), 'kitta-render-scene-'));
const wav = join(tmp, 'a.wav');
const { name: _n, ...character } = STARTERS.kit;
const durationMs = 1840;
const timeline: Timeline = {
  durationMs,
  cues: [{ startMs: 0, endMs: 900, shape: 'D' }, { startMs: 900, endMs: durationMs, shape: 'B' }],
  lines: [{ text: '', startMs: 0, endMs: durationMs, expression: 'happy', gesture: 'wave' }],
};
const red = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#ff0000"/></svg>').toString('base64')}`;
const scene: Scene = {
  title: 'T', audioId: 'a', durationMs, background: red,
  actors: [{ id: 'kit', character, x: 0.5, scale: 1, idleOffsetMs: 0, timeline }],
  shots: [
    { startMs: 0, name: 'wide', zoom: 1, focusX: 0.5, focusY: 0.5 },
    { startMs: 900, name: 'close', zoom: 2, focusX: 0.5, focusY: 0.5 },
  ],
};

beforeAll(() => {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', fixture, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', wav]);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const probe = (file: string) => {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', file]).toString());
  return {
    v: j.streams.find((s: { codec_type: string }) => s.codec_type === 'video'),
    a: j.streams.find((s: { codec_type: string }) => s.codec_type === 'audio'),
  };
};
const frameAtSec = (file: string, sec: number) =>
  execFileSync('ffmpeg', ['-v', 'error', '-ss', String(sec), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 100 * 1024 * 1024 });
const px = (buf: Buffer, x: number, y: number) => Array.from(buf.subarray((y * 1920 + x) * 4, (y * 1920 + x) * 4 + 3));

let shared: Promise<string> | undefined;
const render = () => (shared ??= (async () => {
  const file = join(tmp, 'scene.mp4');
  await renderScene({ scene, audioPath: wav, outPath: file });
  return file;
})());

describe('renderScene', () => {
  it('renders 1920x1080 MP4 with the exact frame count and matching audio', async () => {
    const calls: [number, number][] = [];
    const file = join(tmp, 'p.mp4');
    await renderScene({ scene, audioPath: wav, outPath: file, onProgress: (f, t) => calls.push([f, t]) });
    const { v, a } = probe(file);
    expect([v.width, v.height]).toEqual([1920, 1080]);
    expect(parseInt(v.nb_read_frames)).toBe(frameCount(durationMs));
    expect(Math.abs(parseFloat(a.duration) - parseFloat(v.duration))).toBeLessThan(0.05);
    expect(calls.at(-1)).toEqual([frameCount(durationMs), frameCount(durationMs)]);
  }, 60_000);

  it('shows the set where no actor stands', async () => {
    const [r, g, b] = px(frameAtSec(await render(), 0.1), 5, 5);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
  }, 60_000);

  it('cuts between shots', async () => {
    const file = await render();
    const before = frameAtSec(file, 0.5);
    const after = frameAtSec(file, 1.2);
    // The wide shot shows the character's head at the stage centre; the 2x close-up magnifies it, so the same pixel differs.
    const probes = [[960, 300], [960, 540], [700, 600], [1200, 500]];
    expect(probes.some(([x, y]) => px(before, x, y).join() !== px(after, x, y).join())).toBe(true);
  }, 60_000);

  it('draws a pointing hand past the character box', async () => {
    const pointing: Scene = {
      ...scene,
      actors: [{ ...scene.actors[0], timeline: { ...timeline, lines: [{ ...timeline.lines[0], gesture: 'point' }] } }],
      shots: [{ startMs: 0, name: 'wide', zoom: 1, focusX: 0.5, focusY: 0.5 }],
    };
    const file = join(tmp, 'point.mp4');
    await renderScene({ scene: pointing, audioPath: wav, outPath: file });
    const buf = frameAtSec(file, 0.9);
    const boxRight = 960 + (1080 * 0.8) / 2; // 1392: the character box is centred at x = 0.5
    let beyond = 0;
    for (let y = 0; y < 1080; y++) for (let x = boxRight + 4; x < boxRight + 150; x++) {
      const [r, g, b] = px(buf, x, y);
      if (r < 200 || g > 60 || b > 60) beyond++;
    }
    expect(beyond).toBeGreaterThan(200);
  }, 60_000);

  it('rejects when ffmpeg exits non-zero', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderScene({ scene, audioPath: wav, outPath: join(tmp, 'no-such-dir', 'x.mp4') })).rejects.toThrow('ffmpeg failed');
    err.mockRestore();
  }, 60_000);
});
