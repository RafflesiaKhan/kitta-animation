import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { generateImage } from '../../server/openai';
import { imageProviders } from '../../server/images';
import { createApp } from '../../server/index';
import { drawProvider } from '../../server/vector-draw';
import { ttsProviders } from '../../server/speech';
import { publicSettings, readSettings, removeSetting, resetSettingsCache, setSettings, setSettingsFileForTests, setting, settingSource, writeSettings } from '../../server/settings';

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

  it('loads an existing settings file before the first provider lookup and uses its key/model without reload', async () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ values: { OPENAI_API_KEY: 'disk-key', OPENAI_IMAGE_MODEL: 'disk-model' } }));
    resetSettingsCache();
    process.env.OPENAI_API_KEY = 'env-key';
    process.env.OPENAI_IMAGE_MODEL = 'env-model';
    expect(setting('OPENAI_API_KEY')).toBe('disk-key');
    expect(setting('OPENAI_IMAGE_MODEL')).toBe('disk-model');
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('image').toString('base64') }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await generateImage('stored prompt');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(init!).toMatchObject({ headers: expect.objectContaining({ Authorization: 'Bearer disk-key' }) });
    expect(JSON.parse(init!.body as string)).toMatchObject({ model: 'disk-model', prompt: 'stored prompt' });
    vi.unstubAllGlobals();
  });

  it('falls through empty stored and environment values', async () => {
    process.env.OPENAI_IMAGE_MODEL = 'env-model';
    await writeSettings({ values: { OPENAI_IMAGE_MODEL: '' } });
    expect(setting('OPENAI_IMAGE_MODEL')).toBe('env-model');
    expect(settingSource('OPENAI_IMAGE_MODEL')).toBe('env');
    await writeSettings({ values: { OPENAI_IMAGE_MODEL: '' } });
    delete process.env.OPENAI_IMAGE_MODEL;
    expect(setting('OPENAI_IMAGE_MODEL')).toBe('gpt-image-2');
    expect(settingSource('OPENAI_IMAGE_MODEL')).toBe('default');
    process.env.OPENAI_API_KEY = '';
    expect(setting('OPENAI_API_KEY')).toBeUndefined();
    expect(settingSource('OPENAI_API_KEY')).toBe('unset');
  });

  it('writes atomically with mode 600 and never exposes raw secrets in public metadata', async () => {
    const secret = 'sk-test-secret-value';
    await writeSettings({ values: { OPENAI_API_KEY: secret, CUSTOM_API_KEY: 'custom-secret', OPENAI_TEXT_MODEL: 'safe-model' } });
    expect(statSync(join(dir, 'settings.json')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).toContain(secret); // server storage is allowed to contain the key
    const publicData = await publicSettings();
    expect(JSON.stringify(publicData)).not.toContain(secret);
    expect(JSON.stringify(publicData)).not.toContain('custom-secret');
    expect(publicData.settings.OPENAI_API_KEY).toMatchObject({ configured: true, source: 'settings' });
    expect(JSON.stringify(publicData.settings.OPENAI_API_KEY)).not.toContain('sk-');
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

  it('uses the stored key and model in one provider call without module reload', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('image').toString('base64') }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await setSettings({ OPENAI_API_KEY: 'stored-openai', OPENAI_IMAGE_MODEL: 'stored-image-model' });
    await generateImage('a test image');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer stored-openai' });
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'stored-image-model' });
  });

  it('falls back safely when the settings file is damaged and refuses to overwrite it', async () => {
    const file = join(dir, 'settings.json');
    writeFileSync(file, '{ this is not json');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetSettingsCache();
    process.env.OPENAI_IMAGE_MODEL = 'env-model';
    expect(setting('OPENAI_IMAGE_MODEL')).toBe('env-model');
    expect(await readSettings()).toEqual({ values: {} });
    expect(await publicSettings()).toMatchObject({ settings: { OPENAI_IMAGE_MODEL: { source: 'env', value: 'env-model' } } });
    expect(error).toHaveBeenCalledTimes(1);
    expect(() => setting('OPENAI_IMAGE_MODEL')).not.toThrow();
    await expect(setSettings({ OPENAI_IMAGE_MODEL: 'new-model' })).rejects.toThrow(/damaged/);
    expect(readFileSync(file, 'utf8')).toBe('{ this is not json');
    error.mockRestore();
  });
});

