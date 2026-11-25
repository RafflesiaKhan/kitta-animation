import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackgroundRecord } from '../shared/types';
import { prepareSet } from './sets';

export const BACKGROUNDS_DIR = join('data', 'backgrounds');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);
export const MAX_BACKGROUND_BYTES = 16 * 1024 * 1024;

export class BackgroundError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'unsafe' | 'corrupt') { super(code); }
}

const metadataPath = (root: string) => join(root, 'meta.json');
const imagePath = (root: string, id: string) => join(root, id + '.png');

function checkId(id: string): void {
  if (!UUID_RE.test(id)) throw new BackgroundError('not_found');
}

export function validBackgroundName(name: string): boolean {
  return name.length > 0 && name.length <= 200 && !/[\u0000-\u001f\u007f\\/]/.test(name);
}

const metadataLocks = new Map<string, Promise<unknown>>();

function withMetadataLock<T>(root: string, job: () => Promise<T>): Promise<T> {
  const previous = metadataLocks.get(root) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(job);
  metadataLocks.set(root, next);
  return next.finally(() => {
    if (metadataLocks.get(root) === next) metadataLocks.delete(root);
  });
}

function validRecord(value: unknown): value is BackgroundRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<BackgroundRecord>;
  return typeof item.id === 'string' && UUID_RE.test(item.id)
    && typeof item.name === 'string' && validBackgroundName(item.name)
    && typeof item.mime === 'string' && ALLOWED_MIME.has(item.mime)
    && typeof item.size === 'number' && Number.isInteger(item.size) && item.size >= 0 && item.size <= MAX_BACKGROUND_BYTES
    && typeof item.added === 'string' && !Number.isNaN(Date.parse(item.added));
}

async function readMetadata(root: string): Promise<BackgroundRecord[]> {
  let text: string;
  try {
    text = await readFile(metadataPath(root), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new BackgroundError('corrupt');
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new BackgroundError('corrupt'); }
  if (!Array.isArray(value) || !value.every(validRecord)) throw new BackgroundError('corrupt');
  const ids = new Set(value.map((item) => item.id));
  if (ids.size !== value.length) throw new BackgroundError('corrupt');
  return value;
}

async function writeMetadata(root: string, records: BackgroundRecord[]): Promise<void> {
  const temp = metadataPath(root) + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, JSON.stringify(records, null, 2), { flag: 'wx' });
    await rename(temp, metadataPath(root));
  } finally { await rm(temp, { force: true }); }
}

export async function saveBackground(mime: string, bytes: Buffer, name: string, root = BACKGROUNDS_DIR): Promise<BackgroundRecord> {
  if (!ALLOWED_MIME.has(mime) || bytes.length > MAX_BACKGROUND_BYTES || !validBackgroundName(name)) throw new BackgroundError('invalid');
  const png = await prepareSet(mime, bytes).catch(() => { throw new BackgroundError('unsafe'); });
  const id = randomUUID();
  await mkdir(root, { recursive: true });
  const path = imagePath(root, id);
  try {
    await writeFile(path, png, { flag: 'wx' });
    return await withMetadataLock(root, async () => {
      const record: BackgroundRecord = { id, name, mime, size: png.length, added: new Date().toISOString() };
      await writeMetadata(root, [...await readMetadata(root), record]);
      return record;
    });
  } catch (error) {
    await rm(path, { force: true });
    throw error;
  }
}

export async function listBackgrounds(root = BACKGROUNDS_DIR): Promise<BackgroundRecord[]> {
  return (await readMetadata(root)).filter((record) => existsSync(imagePath(root, record.id))).sort((a, b) => b.added.localeCompare(a.added));
}

export async function readBackground(id: string, root = BACKGROUNDS_DIR): Promise<{ record: BackgroundRecord; png: Buffer }> {
  checkId(id);
  const record = (await readMetadata(root)).find((item) => item.id === id);
  if (!record) throw new BackgroundError('not_found');
  try { return { record, png: await readFile(imagePath(root, id)) }; }
  catch { throw new BackgroundError('not_found'); }
}

export async function deleteBackground(id: string, root = BACKGROUNDS_DIR): Promise<void> {
  checkId(id);
  await withMetadataLock(root, async () => {
    const records = await readMetadata(root);
    if (!records.some((item) => item.id === id)) throw new BackgroundError('not_found');
    await rm(imagePath(root, id), { force: true });
    const remaining = records.filter((item) => item.id !== id);
    if (remaining.length) await writeMetadata(root, remaining);
    else await rm(metadataPath(root), { force: true });
  });
}
