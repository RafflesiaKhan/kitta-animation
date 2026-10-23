import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeAudio, AudioError } from '../../server/audio';

const fixture = join(__dirname, '../fixtures/hello.wav');
const tmp = mkdtempSync(join(tmpdir(), 'kitta-audio-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('normalizeAudio', () => {
  it('converts the fixture and reports its duration', async () => {
    const real = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fixture]).toString()) * 1000;
    const r = await normalizeAudio(fixture, 'a-test-id');
    expect(Math.abs(r.durationMs - real)).toBeLessThan(100);
    rmSync(r.path, { force: true });
  });

  it('rejects a text file renamed to .mp3', async () => {
    const p = join(tmp, 'fake.mp3');
    writeFileSync(p, 'this is not audio');
    await expect(normalizeAudio(p, 'bad-id')).rejects.toMatchObject({ name: 'AudioError', code: 'unreadable' });
  });

  it('rejects audio over 3 minutes', async () => {
    const p = join(tmp, 'long.wav');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', '181', p]);
    const err = await normalizeAudio(p, 'long-id').catch((e) => e);
    expect(err).toBeInstanceOf(AudioError);
    expect(err.code).toBe('too_long');
  }, 30000);
});
