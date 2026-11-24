import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { imageProviders } from '../../server/images';
import { createApp } from '../../server/index';
import { drawProvider } from '../../server/vector-draw';
import { ttsProviders } from '../../server/speech';
import { maskSecret, publicSettings, readSettings, removeSetting, resetSettingsCache, setSettings, setSettingsFileForTests, setting, writeSettings } from '../../server/settings';

const envNames = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'VOICESTUDIO_API_KEY', 'OPENAI_IMAGE_MODEL', 'VECTOR_DRAW_PROVIDER', 'VOICESTUDIO_URL'];
const saved: Record<string, string | undefined> = {};
let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kitta-settings-'));
  setSettingsFileForTests(join(dir, 'settings.json'));
  for (const name of envNames) { saved[name] = process.env[name]; delete process.env[name]; }
});

afterEach(() => {
  for (const name of envNames) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  resetSettingsCache();
});

describe('settings store', () => {
  it('keeps existing env-only configuration working and supplies built-in defaults', () => {
    process.env.OPENAI_API_KEY = 'env-only-key';
    process.env.OPENAI_IMAGE_MODEL = 'env-image-model';
    expect(setting('OPENAI_API_KEY')).toBe('env-only-key');
    expect(setting('OPENAI_IMAGE_MODEL')).toBe('env-image-model');
    expect(setting('ANTHROPIC_MODEL')).toBe('claude-opus-5-5');
  });

  it('uses stored values over env immediately, and falls back to env after removal', async () => {
    process.env.OPENAI_API_KEY = 'env-key';
    await setSettings({ OPENAI_API_KEY: 'stored-key', OPENAI_IMAGE_MODEL: 'stored-model' });
    expect(setting('OPENAI_API_KEY')).toBe('stored-key');
    expect(setting('OPENAI_IMAGE_MODEL')).toBe('stored-model');
    await removeSetting('OPENAI_API_KEY');
    expect(setting('OPENAI_API_KEY')).toBe('env-key');
  });

  it('writes atomically with mode 600 and never exposes raw secrets in public metadata', async () => {
    const secret = 'sk-test-secret-value';
    await writeSettings({ values: { OPENAI_API_KEY: secret, OPENAI_TEXT_MODEL: 'safe-model' } });
    expect(statSync(join(dir, 'settings.json')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).toContain(secret); // server storage is allowed to contain the key
    const publicData = await publicSettings();
    expect(JSON.stringify(publicData)).not.toContain(secret);
    expect(publicData.settings.OPENAI_API_KEY).toMatchObject({ configured: true, masked: 'sk-…alue' });
    expect(maskSecret(secret)).toBe('sk-…alue');
  });

  it('loads stored settings before the first synchronous provider lookup', async () => {
    await setSettings({ OPENAI_API_KEY: 'stored-openai', GEMINI_API_KEY: 'stored-gemini', ELEVENLABS_API_KEY: 'stored-eleven', VECTOR_DRAW_PROVIDER: 'anthropic', VOICESTUDIO_URL: 'http://127.0.0.1:3900' });
    expect(imageProviders()).toEqual(['gemini', 'openai']);
    expect(ttsProviders()).toEqual(['gemini', 'openai', 'elevenlabs', 'voicestudio']);
    expect(drawProvider()).toBe('anthropic');
  });

  it('uses stored credentials in health without returning them', async () => {
    await setSettings({ GEMINI_API_KEY: 'stored-gemini', OPENAI_API_KEY: 'stored-openai' });
    const body = (await request(createApp()).get('/api/health')).body;
    expect(body).toMatchObject({ gemini: true, imageProviders: ['gemini', 'openai'] });
    expect(JSON.stringify(body)).not.toContain('stored-gemini');
    expect(JSON.stringify(body)).not.toContain('stored-openai');
  });
});

