import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ART_POSES } from '../shared/types';
import type { ArtCharacter, ArtPose, ImageProvider } from '../shared/types';
import { basePrompt, posePrompt } from '../shared/character/art';
import type { ImageInput } from './gemini';
import { imageProviders, locateMouth, paint } from './images';

// The library of AI-created characters: data/characters/<id>/meta.json plus one transparent PNG per pose,
// and source.png, the base image with its magenta backdrop, which every later pose is edited from.

export const CHARACTERS_DIR = join('data', 'characters');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_RE = /^[a-zA-Z]+-[0-9a-z]+\.png$/;
const SIZE = 1024;

export class CharacterError extends Error {
  constructor(public code: 'not_found' | 'bad_image' | 'bad_pose') {
    super(code);
    this.name = 'CharacterError';
  }
}

const dirOf = (id: string) => {
  if (!UUID_RE.test(id)) throw new CharacterError('not_found');
  return join(CHARACTERS_DIR, id);
};

/** Any image → 1024² PNG, letterboxed on magenta; with key, the magenta becomes transparent. */
export function toPng(input: Buffer, key: boolean): Promise<Buffer> {
  const vf = `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=0xFF00FF` +
    (key ? ',colorkey=0xFF00FF:0.3:0.12,format=rgba' : ',format=rgb24');
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-vf', vf, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1']);
    const out: Buffer[] = [];
    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.resume();
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 && out.length ? resolve(Buffer.concat(out)) : reject(new CharacterError('bad_image'))));
    ff.stdin.on('error', () => {}); // EPIPE when ffmpeg rejects the input; reported by close
    ff.stdin.end(input);
  });
}

// One write at a time per character, so concurrent pose requests can't lose each other's meta.json updates.
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(id: string, job: () => Promise<T>): Promise<T> {
  const next = (locks.get(id) ?? Promise.resolve()).catch(() => {}).then(job);
  locks.set(id, next);
  return next.finally(() => { if (locks.get(id) === next) locks.delete(id); });
}

async function readMeta(id: string): Promise<ArtCharacter> {
  try {
    return JSON.parse(await readFile(join(dirOf(id), 'meta.json'), 'utf8')) as ArtCharacter;
  } catch (e) {
    if (e instanceof CharacterError) throw e;
    throw new CharacterError('not_found');
  }
}

/** Mouth lookup is best effort: without it the character still works, it just doesn't move its lips. */
async function mouthOf(png: Buffer) {
  try {
    return await locateMouth(png);
  } catch {
    return null;
  }
}

async function savePose(c: ArtCharacter, pose: ArtPose, png: Buffer): Promise<ArtCharacter> {
  const dir = dirOf(c.id);
  const file = `${pose}-${Date.now().toString(36)}.png`; // new name per version, so browsers never show a stale cached pose
  await writeFile(join(dir, file), png);
  const old = c.images[pose]?.file;
  const next: ArtCharacter = { ...c, images: { ...c.images, [pose]: { file, mouth: await mouthOf(png) } } };
  await writeFile(join(dir, 'meta.json'), JSON.stringify(next, null, 2));
  if (old && old !== file) await rm(join(dir, old), { force: true });
  return next;
}

export async function listCharacters(): Promise<ArtCharacter[]> {
  if (!existsSync(CHARACTERS_DIR)) return [];
  const ids = (await readdir(CHARACTERS_DIR)).filter((d) => UUID_RE.test(d));
  const all = await Promise.all(ids.map((id) => readMeta(id).catch(() => null)));
  return all.filter((c): c is ArtCharacter => c !== null && Boolean(c.images.neutral)).sort((a, b) => a.name.localeCompare(b.name));
}

export const getCharacter = readMeta;

export interface CreateInput { description: string; name: string; style: string; provider: ImageProvider; reference?: ImageInput }

/** Paints the base character (its neutral pose) and saves it as a new library entry. */
export async function createCharacter({ description, name, style, provider, reference }: CreateInput): Promise<ArtCharacter> {
  const raw = await paint(provider, basePrompt(description, style, Boolean(reference)), reference ? [reference] : []);
  const [source, png] = await Promise.all([toPng(raw, false), toPng(raw, true)]);
  const id = randomUUID();
  const dir = dirOf(id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'source.png'), source);
  const c: ArtCharacter = { kind: 'art', id, name, prompt: description, style, provider, images: {} };
  return withLock(id, () => savePose(c, 'neutral', png));
}

/** Paints (or repaints) one expression, the blink frame or an action, as an edit of the base image. */
export async function generatePose(id: string, pose: ArtPose): Promise<ArtCharacter> {
  if (!ART_POSES.includes(pose) || pose === 'neutral') throw new CharacterError('bad_pose');
  const meta = await readMeta(id); // 404 before spending an image call
  const source = await readFile(join(dirOf(id), 'source.png')).catch(() => { throw new CharacterError('not_found'); });
  // Same provider as the base picture; if its key is gone, any configured one (paint reports a missing key).
  const own = meta.provider ?? 'gemini';
  const provider = imageProviders().includes(own) ? own : imageProviders()[0] ?? own;
  const png = await toPng(await paint(provider, posePrompt(pose), [{ data: source, mimeType: 'image/png' }]), true);
  return withLock(id, async () => savePose(await readMeta(id), pose, png));
}

export async function deleteCharacter(id: string): Promise<void> {
  const dir = dirOf(id);
  if (!existsSync(dir)) throw new CharacterError('not_found');
  await withLock(id, () => rm(dir, { recursive: true, force: true }));
}

/** Path of one of a character's images, or null for anything that isn't one. */
export function imagePath(id: string, file: string): string | null {
  if (!UUID_RE.test(id) || !FILE_RE.test(file)) return null;
  const p = join(CHARACTERS_DIR, id, file);
  return existsSync(p) ? p : null;
}

/** Every image of a character as a data URI, for rendering it server-side. */
export async function imageDataUris(c: ArtCharacter): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const im of Object.values(c.images)) {
    if (!im) continue;
    const p = imagePath(c.id, im.file);
    if (p) out[im.file] = `data:image/png;base64,${(await readFile(p)).toString('base64')}`;
  }
  return out;
}
