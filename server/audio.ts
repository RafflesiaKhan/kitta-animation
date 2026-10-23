import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const run = promisify(execFile);

export const MAX_AUDIO_MS = 180_000;
export const AUDIO_DIR = join('data', 'audio');

export class AudioError extends Error {
  constructor(public code: 'unreadable' | 'too_long') {
    super(code);
    this.name = 'AudioError';
  }
}

/** Convert any audio to 16-bit mono 44.1 kHz WAV in data/audio/<id>.wav. */
export async function normalizeAudio(inputPath: string, id: string): Promise<{ path: string; durationMs: number }> {
  let seconds: number;
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', inputPath]);
    seconds = parseFloat(stdout.trim());
  } catch {
    throw new AudioError('unreadable');
  }
  if (!Number.isFinite(seconds) || seconds <= 0) throw new AudioError('unreadable');
  if (seconds * 1000 > MAX_AUDIO_MS) throw new AudioError('too_long');

  await mkdir(AUDIO_DIR, { recursive: true });
  const path = join(AUDIO_DIR, `${id}.wav`);
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', inputPath, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', path]);
  } catch {
    throw new AudioError('unreadable');
  }
  return { path, durationMs: Math.round(seconds * 1000) };
}
