import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Path2D, createCanvas } from '@napi-rs/canvas';
import { setCanvasFactory } from '../shared/vector-avator/canvasFactory';
import { VectorStage } from '../shared/vector-avator/stage';
import { prepareVector, type LoadedVector, type VectorDoc } from '../shared/vector-avator/renderers/vector/vdata';
import { CHARACTERS_DIR, CharacterError } from './characters';
import { isVector, type AnyCharacter, type VectorCharacter } from '../shared/types';
import sampleDoc from '../shared/vector-avator/sample/usagi.vector.json';

// The vector characters in the library: data/characters/<id>/meta.json ({kind:'vector'}) + vector.json.
// They share the folder with the AI characters, which skip them (see listCharacters).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SAMPLE_NAME = 'Kariusagi (sample)';
/** Pixels of one vector actor's picture in the export. */
export const EXPORT_SIZE = 768;

const dirOf = (id: string) => {
  if (!UUID_RE.test(id)) throw new CharacterError('not_found');
  return join(CHARACTERS_DIR, id);
};

/** The server draws with @napi-rs/canvas; vector-avator makes its canvases through this factory and needs Path2D. */
export function useServerCanvas(): void {
  (globalThis as { Path2D?: unknown }).Path2D ??= Path2D;
  setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);
}

/** Checks the shape the renderer relies on; prepareVector throws on a broken path. */
function parseDoc(raw: unknown): { doc: VectorDoc; lv: LoadedVector } {
  const d = raw as Partial<VectorDoc> | null;
  const sk = d?.skeleton as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object' || !Array.isArray(d.parts) || !d.parts.length || !sk || !Array.isArray(sk.head_center) || !d.expressions) throw new CharacterError('bad_image');
  try {
    const lv = prepareVector(d as VectorDoc);
    return { doc: d as VectorDoc, lv };
  } catch {
    throw new CharacterError('bad_image');
  }
}

export async function readVectorMeta(id: string): Promise<VectorCharacter> {
  try {
    const meta = JSON.parse(await readFile(join(dirOf(id), 'meta.json'), 'utf8')) as VectorCharacter;
    if (meta.kind !== 'vector') throw new CharacterError('not_found');
    const raw = JSON.parse(await readFile(join(dirOf(id), 'vector.json'), 'utf8')) as { skeleton?: Record<string, unknown> };
    const skeleton = raw.skeleton ?? {};
    const capabilities = [
      ...(Object.hasOwn(skeleton, 'hip_R') && Object.hasOwn(skeleton, 'ankle_R') ? ['legs'] : []),
      ...(existsSync(join(dirOf(id), 'body30.json')) ? ['body30'] : []),
    ];
    return { ...meta, capabilities };
  } catch (e) {
    if (e instanceof CharacterError) throw e;
    throw new CharacterError('not_found');
  }
}

export async function listVectorCharacters(): Promise<VectorCharacter[]> {
  if (!existsSync(CHARACTERS_DIR)) return [];
  const ids = (await readdir(CHARACTERS_DIR)).filter((d) => UUID_RE.test(d));
  const all = await Promise.all(ids.map((id) => readVectorMeta(id).catch(() => null)));
  return all.filter((c): c is VectorCharacter => c !== null).sort((a, b) => a.name.localeCompare(b.name));
}

export async function importVectorCharacter(name: string, raw: unknown): Promise<VectorCharacter> {
  parseDoc(raw);
  const c: VectorCharacter = { kind: 'vector', id: randomUUID(), name };
  const dir = dirOf(c.id);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, 'meta-' + randomUUID() + '.tmp');
  try {
    await writeFile(join(dir, 'vector.json'), JSON.stringify(raw));
    await writeFile(temp, JSON.stringify(c, null, 2), { flag: 'wx' });
    await rename(temp, join(dir, 'meta.json'));
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  } finally {
    await rm(temp, { force: true });
  }
  return c;
}

/** The bundled sample (testing only: its licence asks companies to contact the author), imported once. */
export async function ensureSample(): Promise<VectorCharacter> {
  const found = (await listVectorCharacters()).find((c) => c.name === SAMPLE_NAME);
  return found ?? importVectorCharacter(SAMPLE_NAME, sampleDoc);
}

export async function deleteVectorCharacter(id: string): Promise<void> {
  await readVectorMeta(id);
  await rm(dirOf(id), { recursive: true, force: true });
  docs.delete(id);
}

/** Path of a vector character's drawing data, or null. */
export function vectorPath(id: string): string | null {
  if (!UUID_RE.test(id)) return null;
  const p = join(CHARACTERS_DIR, id, 'vector.json');
  return existsSync(p) ? p : null;
}

const docs = new Map<string, Promise<LoadedVector>>();
function loadDoc(id: string): Promise<LoadedVector> {
  let doc = docs.get(id);
  if (!doc) {
    const p = vectorPath(id);
    if (!p) throw new CharacterError('not_found');
    doc = readFile(p, 'utf8').then((t) => parseDoc(JSON.parse(t)).lv);
    docs.set(id, doc);
    doc.catch(() => docs.delete(id));
  }
  return doc;
}

/** A fresh stage (own spring state) for one actor. */
export async function openStage(id: string, size = EXPORT_SIZE, warmup?: number): Promise<VectorStage> {
  useServerCanvas();
  return new VectorStage(await loadDoc(id), size, warmup);
}

/** The stage's current picture as a PNG data URI, for the SVG to embed. */
export function stageDataUri(stage: VectorStage): string {
  return `data:image/png;base64,${(stage.canvas as unknown as { toBuffer(t: 'image/png'): Buffer }).toBuffer('image/png').toString('base64')}`;
}

/** One stage per vector actor of a scene (several actors may share a character, each has its own springs). */
export async function openSceneStages(actors: { id: string; character: AnyCharacter }[]): Promise<Record<string, VectorStage>> {
  const out: Record<string, VectorStage> = {};
  for (const a of actors) if (isVector(a.character)) out[a.id] = await openStage(a.character.id);
  return out;
}
