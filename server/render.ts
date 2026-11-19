import { spawn } from 'node:child_process';
import { createElement } from 'react';
import { Resvg } from '@resvg/resvg-js';
import { renderToStaticMarkup } from 'react-dom/server';
import { CharacterView } from '../shared/character/CharacterView';
import { SceneView } from '../shared/SceneView';
import { STAGE_W, STAGE_H, cameraAt, type Scene } from '../shared/scene';
import { FPS, frameAt, frameCount } from '../shared/timeline';
import { isVector, type AnyCharacter, type ExportFormat, type Timeline } from '../shared/types';
import { openStage, openSceneStages, stageDataUri } from './vector';

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
function frameSvg(character: AnyCharacter, frame: ReturnType<typeof frameAt>, w: number, h: number, images: Record<string, string>, picture?: string) {
  const size = Math.round(h * 0.8);
  const x = Math.round((w - size) / 2);
  const y = h - size;
  const inner = renderToStaticMarkup(createElement(CharacterView, { config: character, frame, width: size, height: size, resolve: (f: string) => images[f] ?? '', picture }));
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

/** Pipes rasterized frames into ffmpeg. `keyAt(i)` names a frame's state so identical consecutive frames are rasterized once. */
async function encodeFrames(
  [w, h]: [number, number], format: ExportFormat, audioPath: string | undefined, outPath: string, total: number,
  keyAt: (i: number) => string, svgAt: (i: number) => string, onProgress?: (frame: number, total: number) => void,
): Promise<void> {
  const codec = format.transparent
    ? ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-c:a', 'libopus']
    : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'];
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(FPS), '-i', '-',
    ...(audioPath ? ['-i', audioPath] : []), ...codec, outPath,
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
      const key = keyAt(i);
      if (!rgba || key !== lastKey) {
        rgba = Buffer.from(new Resvg(svgAt(i), { background: format.transparent ? undefined : '#ffffff', font: { loadSystemFonts: false } }).render().pixels);
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

export async function renderVideo({ character, images = {}, timeline, audioPath, format, outPath, onProgress }: RenderOptions): Promise<void> {
  const size: [number, number] = format.aspect === '16:9' ? [1920, 1080] : [1080, 1920];
  const frameAtI = (i: number) => frameAt(timeline, (i * 1000) / FPS);
  // A vector character is drawn by a stateful stage (springs), stepped once per frame in order; no frame can be skipped.
  const stage = isVector(character) ? await openStage(character.id) : undefined;
  const picture = (i: number) => {
    if (!stage) return undefined;
    stage.draw((ms) => frameAt(timeline, ms), (i * 1000) / FPS);
    return stageDataUri(stage);
  };
  return encodeFrames(size, format, audioPath, outPath, frameCount(timeline.durationMs),
    (i) => (stage ? String(i) : JSON.stringify(frameAtI(i))),
    (i) => frameSvg(character, frameAtI(i), size[0], size[1], images, picture(i)),
    onProgress);
}

export interface RenderSceneOptions {
  scene: Scene;
  /** Data URIs keyed by character id, then file name, for art characters' images. */
  images?: Record<string, Record<string, string>>;
  audioPath?: string;
  outPath: string;
  onProgress?: (frame: number, total: number) => void;
}

export async function renderScene({ scene, images = {}, audioPath, outPath, onProgress }: RenderSceneOptions): Promise<void> {
  const msAt = (i: number) => (i * 1000) / FPS;
  // One stateful stage per vector actor, each with its own springs; they are stepped in frame order, so no frame is deduplicated.
  const stages = await openSceneStages(scene.actors);
  const vector = Object.keys(stages).length > 0;
  const pictures = (i: number) => {
    const out: Record<string, string> = {};
    for (const a of scene.actors) {
      const stage = stages[a.id];
      if (!stage) continue;
      stage.draw((clock) => frameAt(a.timeline, clock - a.idleOffsetMs, a.idleOffsetMs), msAt(i) + a.idleOffsetMs);
      out[a.id] = stageDataUri(stage);
    }
    return out;
  };
  return encodeFrames([STAGE_W, STAGE_H], { aspect: '16:9', transparent: false }, audioPath, outPath, frameCount(scene.durationMs),
    (i) => (vector ? String(i) : JSON.stringify([scene.actors.map((a) => frameAt(a.timeline, msAt(i), a.idleOffsetMs)), cameraAt(scene, msAt(i))])),
    (i) => renderToStaticMarkup(createElement(SceneView, { scene, ms: msAt(i), resolve: (id: string, file: string) => images[id]?.[file] ?? '', vectorPictures: vector ? pictures(i) : undefined })),
    onProgress);
}
