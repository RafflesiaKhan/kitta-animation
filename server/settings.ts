import { readFileSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { KNOWN_MODELS, type ModelJob, type ModelProvider } from '../shared/prices';

export interface AdminPasswordRecord {
  salt: string;
  hash: string;
}

export interface SettingsFile {
  values?: Record<string, string>;
  adminPassword?: AdminPasswordRecord;
  adminResetConsumed?: boolean;
}

export type SettingsPatch = Partial<Record<string, string | null>>;

export class SettingsFileError extends Error {
  constructor() { super('Settings file is damaged; fix or remove data/settings.json before saving settings.'); }
}

export interface PublicSetting {
  configured: boolean;
  source: 'settings' | 'env' | 'default' | 'unset';
  value?: string;
}

export interface PublicSettings {
  settings: Record<string, PublicSetting>;
  models: Record<ModelJob, { provider: ModelProvider; model: string }>;
  defaults: { voice: string; image: string; vector: string };
  catalog: typeof KNOWN_MODELS;
  auth: { configured: boolean; authenticated: boolean };
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
  DEFAULT_TTS_PROVIDER: 'gemini',
  DEFAULT_IMAGE_PROVIDER: 'gemini',
};

const SECRET_NAMES = new Set([
  'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'VOICESTUDIO_API_KEY',
]);

let settingsFile = join('data', 'settings.json');
let cache: SettingsFile | null = null;
let broken = false;
let warnedBroken = false;

export function setSettingsFileForTests(file: string): void {
  settingsFile = file;
  cache = null;
  broken = false;
  warnedBroken = false;
}

export function resetSettingsCache(): void {
  cache = null;
}

export function isSettingsFileDamaged(): boolean {
  return broken;
}

function damaged(): SettingsFile {
  broken = true;
  if (!warnedBroken) {
    warnedBroken = true;
    console.error('[settings] data/settings.json is damaged; fix or remove it before saving settings');
  }
  return { values: {} };
}

async function load(): Promise<SettingsFile> {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(await readFile(settingsFile, 'utf8')) as SettingsFile;
    cache = { values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {}, adminPassword: parsed.adminPassword, adminResetConsumed: parsed.adminResetConsumed === true };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return cache = damaged();
    cache = { values: {} };
  }
  return cache;
}

function loadSync(): SettingsFile {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(readFileSync(settingsFile, 'utf8')) as SettingsFile;
    cache = { values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {}, adminPassword: parsed.adminPassword, adminResetConsumed: parsed.adminResetConsumed === true };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return cache = damaged();
    cache = { values: {} };
  }
  return cache;
}

export async function readSettings(): Promise<SettingsFile> {
  return structuredClone(await load());
}

export async function writeSettings(next: SettingsFile): Promise<void> {
  if (broken) throw new SettingsFileError();
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
  if (stored !== undefined && stored !== '') return 'settings';
  if (process.env[name] !== undefined && process.env[name] !== '') return 'env';
  if (DEFAULTS[name] !== undefined) return 'default';
  return 'unset';
}

/** Settings → environment → built-in defaults. Stored values are loaded before the first lookup. */
export function setting(name: string): string | undefined {
  const stored = loadSync().values?.[name];
  if (stored !== undefined && stored !== '') return stored;
  const env = process.env[name];
  return env !== undefined && env !== '' ? env : DEFAULTS[name];
}

export async function setSettings(patch: SettingsPatch): Promise<void> {
  if (broken) throw new SettingsFileError();
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

export async function publicSettings(authenticated = false): Promise<PublicSettings> {
  if (broken) throw new SettingsFileError();
  // Only expose the known configuration surface. Unknown persisted values may be
  // secrets for a future provider and must never be reflected unmasked.
  const names = new Set([...Object.keys(DEFAULTS), ...SECRET_NAMES]);
  const settings: Record<string, PublicSetting> = {};
  for (const name of names) {
    const value = setting(name);
    const source = settingSource(name);
    settings[name] = { configured: Boolean(value), source, ...(!SECRET_NAMES.has(name) && value ? { value } : {}) };
  }
  const model = (name: string, fallbackProvider: ModelProvider): { provider: ModelProvider; model: string } => {
    const value = setting(name) ?? '';
    const entry = KNOWN_MODELS.find((item) => item.id === value);
    return { provider: entry?.provider ?? fallbackProvider, model: value };
  };
  return {
    settings,
    models: {
      text: model('OPENAI_TEXT_MODEL', 'openai'),
      voice: model('OPENAI_TTS_MODEL', 'openai'),
      image: model('OPENAI_IMAGE_MODEL', 'openai'),
      mouth: model('OPENAI_VISION_MODEL', 'openai'),
      vector: model('OPENAI_DRAW_MODEL', 'openai'),
    },
    defaults: {
      voice: setting('DEFAULT_TTS_PROVIDER') ?? 'gemini',
      image: setting('DEFAULT_IMAGE_PROVIDER') ?? 'gemini',
      vector: setting('VECTOR_DRAW_PROVIDER') ?? 'openai',
    },
    catalog: KNOWN_MODELS,
    auth: { configured: Boolean((await readSettings()).adminPassword), authenticated },
  };
}

