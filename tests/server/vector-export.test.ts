import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { renderScene } from '../../server/render';
import { deleteVectorCharacter, ensureSample, listVectorCharacters, openStage, SAMPLE_NAME } from '../../server/vector';
import { FPS, frameAt, frameCount } from '../../shared/timeline';
import type { Scene } from '../../shared/scene';
import type { Timeline, VectorCharacter } from '../../shared/types';

const fixture = join(__dirname, '../fixtures/hello.wav');
const tmp = mkdtempSync(join(tmpdir(), 'kitta-vector-export-'));
const wav = join(tmp, 'a.wav');
const durationMs = 1840;
const timeline: Timeline = {
  durationMs: 8000,
  cues: [
    { startMs: 0, endMs: 450, shape: 'D' }, { startMs: 450, endMs: 900, shape: 'E' },
    { startMs: 900, endMs: 1400, shape: 'B' }, { startMs: 1400, endMs: 8000, shape: 'X' },
  ],
  lines: [{ text: '', startMs: 0, endMs: 8000, expression: 'happy', gesture: 'explain' }],
};
const blue = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#2a3a8c"/></svg>').toString('base64')}`;
let sample: VectorCharacter;
let created = false;
const sceneOf = (): Scene => ({
  title: 'V', audioId: 'a', durationMs, background: blue,
  actors: [
    { id: 'a', character: sample, x: 0.3, scale: 0.9, idleOffsetMs: 0, timeline },
    { id: 'b', character: sample, x: 0.7, scale: 0.9, idleOffsetMs: 1900, timeline },
  ],
  shots: [{ startMs: 0, name: 'wide', zoom: 1, focusX: 0.5, focusY: 0.5 }],
});

beforeAll(async () => {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', fixture, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', wav]);
  const existing = (await listVectorCharacters()).find((c) => c.name === SAMPLE_NAME);
  created = !existing; // never delete a sample the user added in the app
  sample = await ensureSample();
});
afterAll(async () => {
  if (created) await deleteVectorCharacter(sample.id).catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
});

const pixels = async (canvas: unknown) => {
  const c = canvas as { width: number; height: number; toBuffer(t: 'image/png'): Buffer };
  const img = await loadImage(c.toBuffer('image/png'));
  const out = createCanvas(c.width, c.height);
  const g = out.getContext('2d');
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height).data;
};
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let sum = 0, max = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d > max) max = d; }
  return { mean: sum / a.length, max };
};
const source = (ms: number) => frameAt(timeline, ms);

describe('vector export', () => {
  it('draws the same picture whether the playhead got there by playing or by scrubbing', async () => {
    const forward = await openStage(sample.id, 256);
    const target = 150; // frame 150 = 5 s: later than the warmup, so the replay does not start at tick 0
    for (let i = 0; i <= target; i++) forward.draw(source, (i * 1000) / FPS);
    const played = await pixels(forward.canvas);

    const scrubbed = await openStage(sample.id, 256);
    scrubbed.draw(source, 7000);       // somewhere else first,
    scrubbed.draw(source, 100);        // then back (a jump backwards),
    scrubbed.draw(source, (target * 1000) / FPS); // then to the frame
    const jumped = await pixels(scrubbed.canvas);

    const d = diff(played, jumped);
    console.log(`scrub vs forward: mean ${d.mean.toFixed(4)}, max ${d.max}`);
    expect(d.mean).toBeLessThan(0.05);

    // Drawing the same frame again changes nothing (a paused preview).
    forward.draw(source, (target * 1000) / FPS);
    expect(diff(played, await pixels(forward.canvas)).max).toBe(0);
  }, 60_000);

  it('moves two actors differently when their idleOffsetMs differs', async () => {
    const one = await openStage(sample.id, 256);
    const two = await openStage(sample.id, 256);
    const still: Timeline = { durationMs: 8000, cues: [], lines: [] };
    const at = (offset: number) => (ms: number) => frameAt(still, ms, offset);
    for (let i = 0; i <= 90; i++) { // 3 s of idle
      const ms = (i * 1000) / FPS;
      one.draw(at(0), ms);
      two.draw(at(1900), ms + 1900);
    }
    const d = diff(await pixels(one.canvas), await pixels(two.canvas));
    expect(d.max).toBeGreaterThan(0);
  }, 60_000);

  it('renders vector actors into the scene MP4 and records the render time', async () => {
    const file = join(tmp, 'scene.mp4');
    const started = Date.now();
    await renderScene({ scene: sceneOf(), audioPath: wav, outPath: file });
    const seconds = (Date.now() - started) / 1000;
    const frames = frameCount(durationMs);
    console.log(`vector scene: ${frames} frames, 2 actors, 1920x1080 in ${seconds.toFixed(2)} s (${(frames / seconds).toFixed(1)} fps, ${(durationMs / 1000 / seconds).toFixed(2)}x realtime)`);
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', file]).toString());
    const v = j.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
    expect(parseInt(v.nb_read_frames)).toBe(frames);

    const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 100 * 1024 * 1024 });
    const px = (x: number, y: number) => Array.from(buf.subarray((y * 1920 + x) * 4, (y * 1920 + x) * 4 + 3));
    expect(px(5, 5)[2]).toBeGreaterThan(100); // the blue set
    // The rabbit is white: its body shows as bright pixels around the left actor's centre.
    let white = 0;
    for (let y = 300; y < 1000; y += 4) for (let x = 400; x < 760; x += 4) { const [r, g, b] = px(x, y); if (r > 230 && g > 230 && b > 230) white++; }
    expect(white).toBeGreaterThan(500);
  }, 120_000);
});
