import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { MouthCue, MouthShape } from '../shared/types';

const run = promisify(execFile);

interface RawCue { start: number; end: number; value: string }

function mapCues(raw: RawCue[]): MouthCue[] {
  return raw.map((c) => ({
    startMs: Math.round(c.start * 1000),
    endMs: Math.round(c.end * 1000),
    shape: c.value as MouthShape,
  }));
}

export function parseRhubarbJson(json: string): MouthCue[] {
  return mapCues(JSON.parse(json).mouthCues ?? []);
}

type RhubarbModule = typeof import('rhubarb-lip-sync-wasm');
let mod: Promise<RhubarbModule> | undefined;
function loadRhubarb(): Promise<RhubarbModule> {
  return (mod ??= import('rhubarb-lip-sync-wasm'));
}

/** True when the WASM lip sync engine can be imported. */
export async function rhubarbAvailable(): Promise<boolean> {
  try {
    await loadRhubarb();
    return true;
  } catch {
    mod = undefined;
    return false;
  }
}

/** The WASM package prints [DEBUG] lines; mute output while it runs. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const { log, error, info, debug } = console;
  const write = process.stdout.write;
  const noop = () => {};
  console.log = console.error = console.info = console.debug = noop;
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, error, info, debug });
    process.stdout.write = write;
  }
}

export async function runRhubarb(wavPath: string, dialogText?: string): Promise<MouthCue[]> {
  const { stdout } = await run(
    'ffmpeg',
    ['-v', 'error', '-i', wavPath, '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 200 * 1024 * 1024 },
  );
  const { Rhubarb } = await loadRhubarb();
  const result = await quietly(() =>
    Rhubarb.getLipSync(stdout, dialogText ? { dialogText } : {}) as Promise<{ mouthCues: RawCue[] }>,
  );
  return mapCues(result.mouthCues);
}
