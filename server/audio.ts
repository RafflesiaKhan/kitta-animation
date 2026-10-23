import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
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

/** Runs fn with a 16 kHz mono 16-bit copy of the WAV (about 1.9 MB/min) in a temp dir that is removed afterwards. */
export async function withSpeechWav<T>(wavPath: string, fn: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'kitta-asr-'));
  try {
    const out = join(dir, 'speech.wav');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out]);
    return await fn(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Joins WAV clips with silence between them (not after the last), saved like an upload.
 * spans[i] is where clip i sits in the joined audio.
 */
export async function concatWithGaps(
  wavs: Buffer[],
  gapMs = 250,
): Promise<{ path: string; durationMs: number; spans: { startMs: number; endMs: number }[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'kitta-concat-'));
  const clips: { path: string; durationMs: number }[] = [];
  try {
    for (let i = 0; i < wavs.length; i++) {
      const raw = join(dir, `raw${i}.wav`);
      await writeFile(raw, wavs[i]);
      // normalizeAudio gives us the format conversion and the duration probe; its output is only scratch here
      const id = `scratch-${randomUUID()}`;
      const n = await normalizeAudio(raw, id);
      clips.push(n);
    }
    const spans: { startMs: number; endMs: number }[] = [];
    let at = 0;
    clips.forEach((c, i) => {
      if (i > 0) at += gapMs;
      spans.push({ startMs: at, endMs: at + c.durationMs });
      at += c.durationMs;
    });

    const args = ['-y', '-loglevel', 'error'];
    clips.forEach((c) => args.push('-i', c.path));
    const parts: string[] = [];
    const labels: string[] = [];
    clips.forEach((_c, i) => {
      if (i > 0) { parts.push(`anullsrc=r=44100:cl=mono,atrim=duration=${gapMs / 1000}[g${i}]`); labels.push(`[g${i}]`); }
      labels.push(`[${i}:a]`);
    });
    parts.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[out]`);
    const joined = join(dir, 'joined.wav');
    args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', joined);
    try {
      await run('ffmpeg', args);
    } catch {
      throw new AudioError('unreadable');
    }
    const out = await normalizeAudio(joined, randomUUID()); // saves it + enforces the 3-minute limit
    return { path: out.path, durationMs: out.durationMs, spans };
  } finally {
    await Promise.all(clips.map((c) => rm(c.path, { force: true })));
    await rm(dir, { recursive: true, force: true });
  }
}
