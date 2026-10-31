import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })) }));
vi.mock('node:child_process', async (orig) => ({ ...(await orig<typeof import('node:child_process')>()), spawn }));
import { canLaunchVoiceStudio, ensureVoiceStudio } from '../../server/launch';

const app = mkdtempSync(join(tmpdir(), 'VoiceStudio.app-'));
let up = false;
let healthChecks = 0;
beforeEach(() => {
  spawn.mockClear();
  up = false;
  healthChecks = 0;
  process.env.VOICESTUDIO_URL = 'http://localhost:3900';
  process.env.VOICESTUDIO_APP = app;
  vi.stubGlobal('fetch', vi.fn(async () => {
    healthChecks++;
    if (!up) throw new Error('ECONNREFUSED');
    return new Response('{"status":"ok"}');
  }));
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.VOICESTUDIO_URL; delete process.env.VOICESTUDIO_APP; });
afterAll(() => rmSync(app, { recursive: true, force: true }));

describe('ensureVoiceStudio', () => {
  it('does nothing when VoiceStudio already answers', async () => {
    up = true;
    expect(await ensureVoiceStudio({ waitMs: 50, pollMs: 5 })).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
  });
  it('opens the app in the background once, and waits until it answers', async () => {
    const a = ensureVoiceStudio({ waitMs: 1000, pollMs: 5 });
    const b = ensureVoiceStudio({ waitMs: 1000, pollMs: 5 }); // a second request joins the first launch
    setTimeout(() => { up = true; }, 30);
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith('open', ['-g', '-a', app], expect.anything());
  });
  it('gives up after waiting, and never launches for a remote VoiceStudio or a missing app', async () => {
    expect(await ensureVoiceStudio({ waitMs: 30, pollMs: 5 })).toBe(false);
    process.env.VOICESTUDIO_URL = 'https://studio.example.com';
    expect(canLaunchVoiceStudio()).toBe(false);
    process.env.VOICESTUDIO_URL = 'http://localhost:3900';
    process.env.VOICESTUDIO_APP = join(app, 'missing.app');
    expect(canLaunchVoiceStudio()).toBe(false);
    spawn.mockClear();
    expect(await ensureVoiceStudio({ waitMs: 30, pollMs: 5 })).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
    expect(healthChecks).toBeGreaterThan(0);
  });
});
