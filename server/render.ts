import { spawn } from 'node:child_process';
import { createElement } from 'react';
import { Resvg } from '@resvg/resvg-js';
import { renderToStaticMarkup } from 'react-dom/server';
import { CharacterView } from '../shared/character/CharacterView';
import { FPS, frameAt, frameCount } from '../shared/timeline';
import type { AnyCharacter, ExportFormat, Timeline } from '../shared/types';

export interface RenderOptions {
  character: AnyCharacter;
  /** Data URIs by file name for an AI character's images (resvg can't fetch URLs). */
  images?: Record<string, string>;
  timeline: Timeline;
  audioPath: string;
  format: ExportFormat;
  outPath: string;
  onProgress?: (frame: number, total: number) => void;
}

/** The character's square box is 80% of the frame height, centred horizontally and anchored to the bottom edge (portrait-style crop). */
function frameSvg(character: AnyCharacter, frame: ReturnType<typeof frameAt>, w: number, h: number, images: Record<string, string>) {
  const size = Math.round(h * 0.8);
  const x = Math.round((w - size) / 2);
  const y = h - size;
  const inner = renderToStaticMarkup(createElement(CharacterView, { config: character, frame, width: size, height: size, resolve: (f: string) => images[f] ?? '' }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g transform="translate(${x} ${y})">${inner}</g></svg>`;
}

/** resvg returns premultiplied RGBA; ffmpeg's rgba input expects straight alpha. */
function unpremultiply(px: Buffer) {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 0 || a === 255) continue;
    px[i] = Math.min(255, Math.round((px[i] * 255) / a));
    px[i + 1] = Math.min(255, Math.round((px[i + 1] * 255) / a));
    px[i + 2] = Math.min(255, Math.round((px[i + 2] * 255) / a));
  }
}

export async function renderVideo({ character, images = {}, timeline, audioPath, format, outPath, onProgress }: RenderOptions): Promise<void> {
  const [w, h] = format.aspect === '16:9' ? [1920, 1080] : [1080, 1920];
  const total = frameCount(timeline.durationMs);
  const codec = format.transparent
    ? ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-c:a', 'libopus']
    : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'];
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(FPS), '-i', '-',
    '-i', audioPath, ...codec, outPath,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });

  let stderr = '';
  ff.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
  const closed = new Promise<void>((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) return resolve();
      console.error('ffmpeg failed:', stderr.split('\n').slice(-10).join('\n'));
      reject(new Error('ffmpeg failed'));
    });
  });
  closed.catch(() => {}); // surfaced below; avoid unhandled rejection while writing
  ff.stdin.on('error', () => {}); // EPIPE if ffmpeg dies early; `closed` reports it

  try {
    // Consecutive frames often share state, so a frame equal to the previous one is rasterized once.
    let lastKey = '';
    let rgba: Buffer | undefined;
    for (let i = 0; i < total; i++) {
      const frame = frameAt(timeline, (i * 1000) / FPS);
      const key = JSON.stringify(frame);
      if (!rgba || key !== lastKey) {
        rgba = Buffer.from(new Resvg(frameSvg(character, frame, w, h, images), { background: format.transparent ? undefined : '#ffffff', font: { loadSystemFonts: false } }).render().pixels);
        if (format.transparent) unpremultiply(rgba);
        lastKey = key;
      }
      if (!ff.stdin.write(rgba)) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), closed]);
      onProgress?.(i + 1, total);
    }
    ff.stdin.end();
  } catch (e) {
    ff.kill();
    throw e;
  }
  await closed;
}
