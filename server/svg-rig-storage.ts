import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rigOptions, validateSvgRigPack, type SvgRigCharacter, type SvgRigPack } from '../shared/svg-rig';
import { fixturePack } from '../shared/svg-rig-fixture';
import { CHARACTERS_DIR } from './characters';

// Reference-made SVG characters in the library: data/characters/<id>/meta.json ({kind:'svg-rig', id, name, packVersion})
// next to rig-v<packVersion>.json. A pack is validated before it is published and never changed afterwards, so a saved
// scene's {artId} always draws the same artwork; a new version would get a new file next to the old one.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class RigStorageError extends Error { constructor(public code: 'not_found' | 'invalid', detail?: string) { super(detail ?? code); } }

const dirOf = (id: string) => { if (!UUID_RE.test(id)) throw new RigStorageError('not_found'); return join(CHARACTERS_DIR, id); };
export const rigPackPath = (id: string, version: number) => join(dirOf(id), `rig-v${version}.json`);

async function atomicWrite(path: string, data: string) {
  const tmp = `${path}-${randomUUID()}.tmp`;
  try { await writeFile(tmp, data, { flag: 'wx' }); await rename(tmp, path); } finally { await rm(tmp, { force: true }); }
}

/** Saves a complete pack, then the meta that makes it a library character (written last, so only finished ones list). */
export async function publishRig(id: string, name: string, pack: SvgRigPack): Promise<SvgRigCharacter> {
  const errors = validateSvgRigPack(pack);
  if (errors.length) throw new RigStorageError('invalid', errors.slice(0, 5).join('; '));
  const meta: SvgRigCharacter = { kind: 'svg-rig', id, name, packVersion: 1 };
  await atomicWrite(rigPackPath(id, 1), JSON.stringify(pack));
  await atomicWrite(join(dirOf(id), 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

async function readRigMeta(id: string): Promise<SvgRigCharacter> {
  let meta: SvgRigCharacter;
  try { meta = JSON.parse(await readFile(join(dirOf(id), 'meta.json'), 'utf8')) as SvgRigCharacter; } catch { throw new RigStorageError('not_found'); }
  if (meta.kind !== 'svg-rig' || !Number.isInteger(meta.packVersion) || meta.packVersion < 1) throw new RigStorageError('not_found');
  return { kind: 'svg-rig', id, name: String(meta.name ?? ''), packVersion: meta.packVersion };
}

/** The library character with its pack, re-validated (a damaged file must not reach a render). */
export async function readRig(id: string): Promise<SvgRigCharacter> {
  const meta = await readRigMeta(id);
  let pack: unknown;
  try { pack = JSON.parse(await readFile(rigPackPath(id, meta.packVersion), 'utf8')); } catch { throw new RigStorageError('not_found'); }
  const errors = validateSvgRigPack(pack);
  if (errors.length) throw new RigStorageError('invalid', errors.slice(0, 5).join('; '));
  return { ...meta, pack: pack as SvgRigPack };
}

/** The stored character with the per-use options of a reference or request (sanitised; artwork always from disk). */
export async function readRigWith(id: string, options: unknown): Promise<SvgRigCharacter> {
  return { ...(await readRig(id)), ...rigOptions(options) };
}

/** Pack file for the browser's renderer, or null. */
export async function rigPackFile(id: string): Promise<string | null> {
  try { const meta = await readRigMeta(id); const p = rigPackPath(id, meta.packVersion); return existsSync(p) ? p : null; } catch { return null; }
}

export async function listRigs(): Promise<SvgRigCharacter[]> {
  if (!existsSync(CHARACTERS_DIR)) return [];
  const ids = (await readdir(CHARACTERS_DIR)).filter((d) => UUID_RE.test(d));
  const all = await Promise.all(ids.map((id) => readRigMeta(id).catch(() => null)));
  return all.filter((c): c is SvgRigCharacter => c !== null && existsSync(rigPackPath(c.id, c.packVersion))).sort((a, b) => a.name.localeCompare(b.name));
}

const SAMPLE_NAME = 'Haru (sample)';
/** Adds the hand-made sample character once (no model call), so the SVG character path can be tried and tested. */
export async function ensureRigSample(): Promise<SvgRigCharacter> {
  const found = (await listRigs()).find((c) => c.name === SAMPLE_NAME);
  if (found) return found;
  const id = randomUUID();
  await mkdir(dirOf(id), { recursive: true });
  return publishRig(id, SAMPLE_NAME, fixturePack());
}
