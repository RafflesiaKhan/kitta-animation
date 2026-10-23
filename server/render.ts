import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createElement } from 'react';
import { Resvg } from '@resvg/resvg-js';
import { renderToStaticMarkup } from 'react-dom/server';
import { Character } from '../shared/character/Character';
import { FPS, frameAt, frameCount } from '../shared/timeline';
import type { CharacterConfig, ExportFormat, Timeline } from '../shared/types';

export interface RenderOptions {
  character: CharacterConfig;
  timeline: Timeline;
  audioPath: string;
  format: ExportFormat;
  outPath: string;
  onProgress?: (frame: number, total: number) => void;
}

/** The character's square box fills 80% of the frame height, centred. */
function frameSvg(character: CharacterConfig, frame: ReturnType<typeof frameAt>, w: number, h: number) {
  const size = Math.round(h * 0.8);
  const x = Math.round((w - size) / 2);
  const y = Math.round((h - size) / 2);
  const inner = renderToStaticMarkup(createElement(Character, { config: character, frame, width: size, height: size }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g transform="translate(${x} ${y})">${inner}</g></svg>`;
}

export async function renderVideo({ character, timeline, audioPath, format, outPath, onProgress }: RenderOptions): Promise<void> {
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
        rgba = Buffer.from(new Resvg(frameSvg(character, frame, w, h), { background: format.transparent ? undefined : '#ffffff', font: { loadSystemFonts: false } }).render().pixels);
        lastKey = key;
      }
      if (!ff.stdin.write(rgba)) await Promise.race([once(ff.stdin, 'drain'), closed]);
      onProgress?.(i + 1, total);
    }
    ff.stdin.end();
  } catch (e) {
    ff.kill();
    throw e;
  }
  await closed;
}
