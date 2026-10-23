import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderVideo } from '../../server/render';
import { frameCount } from '../../shared/timeline';
import { STARTERS } from '../../shared/character/starters';
import type { Timeline } from '../../shared/types';

const fixture = join(__dirname, '../fixtures/hello.wav');
const tmp = mkdtempSync(join(tmpdir(), 'kitta-render-'));
const wav = join(tmp, 'a.wav');
const { name: _n, ...character } = STARTERS.kit;
const durationMs = 1840;
const timeline: Timeline = {
  durationMs,
  cues: [
    { startMs: 0, endMs: 400, shape: 'X' },
    { startMs: 400, endMs: 900, shape: 'D' },
    { startMs: 900, endMs: 1400, shape: 'B' },
    { startMs: 1400, endMs: durationMs, shape: 'C' },
  ],
  lines: [{ text: '', startMs: 0, endMs: durationMs, expression: 'happy', gesture: 'wave' }],
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
const render = (format: { aspect: '16:9' | '9:16'; transparent: boolean }, name: string, onProgress?: (f: number, t: number) => void) => {
  const outPath = join(tmp, name);
  return renderVideo({ character, timeline, audioPath: wav, format, outPath, onProgress }).then(() => outPath);
};

const rawFrame = (file: string) =>
  execFileSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 100 * 1024 * 1024 });
const px = (buf: Buffer, w: number, x: number, y: number) => Array.from(buf.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));

describe('renderVideo', () => {
  it('renders 16:9 MP4 with exact frame count and matching audio', async () => {
    const calls: [number, number][] = [];
    const out = await render({ aspect: '16:9', transparent: false }, 'a.mp4', (f, t) => calls.push([f, t]));
    const { v, a } = probe(out);
    expect([v.width, v.height]).toEqual([1920, 1080]);
    expect(parseInt(v.nb_read_frames)).toBe(frameCount(durationMs));
    expect(Math.abs(parseFloat(a.duration) - parseFloat(v.duration))).toBeLessThan(0.05);
    expect(calls.at(-1)).toEqual([frameCount(durationMs), frameCount(durationMs)]);
  }, 60_000);

  it('renders 9:16 as 1080x1920', async () => {
    const { v } = probe(await render({ aspect: '9:16', transparent: false }, 'b.mp4'));
    expect([v.width, v.height]).toEqual([1080, 1920]);
  }, 60_000);

  it('renders transparent WebM with alpha', async () => {
    const out = await render({ aspect: '16:9', transparent: true }, 'c.webm');
    const { v } = probe(out);
    const alpha = v.pix_fmt === 'yuva420p' || v.tags?.alpha_mode === '1';
    expect(alpha).toBe(true);
  }, 60_000);

  it('keeps transparent pixels transparent and anchors the body to the bottom edge', async () => {
    const buf = rawFrame(await render({ aspect: '16:9', transparent: true }, 'd.webm'));
    expect(px(buf, 1920, 5, 5)[3]).toBe(0);
    expect(px(buf, 1920, 960, 1079)[3]).toBe(255);
  }, 60_000);

  it('rejects when ffmpeg exits non-zero', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderVideo({ character, timeline, audioPath: join(tmp, 'missing.wav'), format: { aspect: '16:9', transparent: false }, outPath: join(tmp, 'x.mp4') })).rejects.toThrow('ffmpeg failed');
    await expect(renderVideo({ character, timeline, audioPath: wav, format: { aspect: '16:9', transparent: false }, outPath: join(tmp, 'no-such-dir', 'x.mp4') })).rejects.toThrow('ffmpeg failed');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  }, 60_000);
});
