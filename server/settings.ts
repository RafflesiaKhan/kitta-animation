import { readFileSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface AdminPasswordRecord {
  salt: string;
  hash: string;
}

export interface SettingsFile {
  values?: Record<string, string>;
  adminPassword?: AdminPasswordRecord;
}

export type SettingsPatch = Partial<Record<string, string | null>>;

export interface PublicSetting {
  configured: boolean;
  source: 'settings' | 'env' | 'default' | 'unset';
  masked?: string;
}

export interface PublicSettings {
  settings: Record<string, PublicSetting>;
}

const DEFAULTS: Record<string, string> = {
  GEMINI_TEXT_MODEL: 'gemini-3.8-flash',
  GEMINI_IMAGE_MODEL: 'gemini-nano-banana-2.1',
  GEMINI_TTS_MODEL: 'gemini-3.8-flash-tts',
  OPENAI_IMAGE_MODEL: 'gpt-image-2',
  OPENAI_VISION_MODEL: 'gpt-5-mini',
  OPENAI_TEXT_MODEL: 'gpt-5-mini',
  OPENAI_TTS_MODEL: 'gpt-4o-mini-tts',
  OPENAI_DRAW_MODEL: 'gpt-6.2-astra',
  ANTHROPIC_MODEL: 'claude-opus-5-5',
  ELEVENLABS_MODEL: 'eleven_multilingual_v2',
  VOICESTUDIO_TTS_MODEL: 'tts-1',
  VOICESTUDIO_URL: 'http://localhost:3900',
  VOICESTUDIO_APP: '/Applications/VoiceStudio.app',
  VECTOR_DRAW_PROVIDER: 'openai',
};

const SECRET_NAMES = new Set([
  'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'VOICESTUDIO_API_KEY',
]);

let settingsFile = join('data', 'settings.json');
let cache: SettingsFile | null = null;

export function setSettingsFileForTests(file: string): void {
  settingsFile = file;
  cache = null;
}

export function resetSettingsCache(): void {
  cache = null;
}

async function load(): Promise<SettingsFile> {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(await readFile(settingsFile, 'utf8')) as SettingsFile;
    cache = { values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {}, adminPassword: parsed.adminPassword };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    cache = { values: {} };
  }
  return cache;
}

function loadSync(): SettingsFile {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(readFileSync(settingsFile, 'utf8')) as SettingsFile;
    cache = { values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {}, adminPassword: parsed.adminPassword };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    cache = { values: {} };
  }
  return cache;
}

export async function readSettings(): Promise<SettingsFile> {
  return structuredClone(await load());
}

export async function writeSettings(next: SettingsFile): Promise<void> {
  const dir = dirname(settingsFile);
  await mkdir(dir, { recursive: true });
  const temp = `${settingsFile}.${process.pid}.${Date.now()}.tmp`;
  const safe: SettingsFile = { ...next, values: { ...(next.values ?? {}) } };
  await writeFile(temp, `${JSON.stringify(safe, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, settingsFile);
  await chmod(settingsFile, 0o600);
  cache = safe;
}

export function settingSource(name: string): PublicSetting['source'] {
  const stored = loadSync().values?.[name];
  if (stored !== undefined) return 'settings';
  if (process.env[name] !== undefined && process.env[name] !== '') return 'env';
  if (DEFAULTS[name] !== undefined) return 'default';
  return 'unset';
}

/** Settings → environment → built-in defaults. Stored values are loaded before the first lookup. */
export function setting(name: string): string | undefined {
  const stored = loadSync().values?.[name];
  return stored ?? process.env[name] ?? DEFAULTS[name];
}

export async function setSettings(patch: SettingsPatch): Promise<void> {
  const current = await load();
  const values = { ...(current.values ?? {}) };
  for (const [name, value] of Object.entries(patch)) {
    if (value === null || value === '') delete values[name];
    else if (typeof value === 'string') values[name] = value;
  }
  await writeSettings({ ...current, values });
}

export async function removeSetting(name: string): Promise<void> {
  await setSettings({ [name]: null });
}

export function maskSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.length <= 6) return '••••';
  return `${value.slice(0, Math.min(3, value.length - 4))}…${value.slice(-4)}`;
}

export async function publicSettings(): Promise<PublicSettings> {
  const names = new Set([...Object.keys(DEFAULTS), ...SECRET_NAMES, ...Object.keys((await load()).values ?? {})]);
  const settings: Record<string, PublicSetting> = {};
  for (const name of names) {
    const value = setting(name);
    const source = settingSource(name);
    settings[name] = { configured: Boolean(value), source, ...(SECRET_NAMES.has(name) ? { masked: maskSecret(value) } : {}) };
  }
  return { settings };
}

