import { recordUsage } from './usage';
import { setting } from './settings';

// ElevenLabs voices (https://elevenlabs.io/docs/api-reference): text to speech with a voice from the person's own
// ElevenLabs account. Key: ELEVENLABS_API_KEY; model: ELEVENLABS_MODEL (default eleven_multilingual_v2, the API's own
// default). ElevenLabs bills by characters of text, so a call is recorded with its character count as input.

export class ElevenLabsError extends Error {
  constructor(public code: 'no_key' | 'bad_key' | 'no_credit' | 'no_voice' | 'rate_limited' | 'busy' | 'timed_out' | 'unreachable' | 'failed') {
    super(`ElevenLabs: ${code}`);
    this.name = 'ElevenLabsError';
  }
}

const API = 'https://api.elevenlabs.io';
const SPEECH_TIMEOUT_MS = 120_000;
export const elevenModel = () => setting('ELEVENLABS_MODEL')!;

export interface ElevenVoice { id: string; label: string; kind: 'default' }

async function call(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const key = setting('ELEVENLABS_API_KEY');
  if (!key) throw new ElevenLabsError('no_key');
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: { 'xi-api-key': key, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    throw new ElevenLabsError(name === 'TimeoutError' || name === 'AbortError' ? 'timed_out' : 'unreachable');
  }
  if (res.ok) return res;
  // The docs list no quota error, so running out of credit is recognised from the message.
  const text = (await res.text().catch(() => '')).slice(0, 500);
  console.warn(`elevenlabs ${path}: ${res.status}`, text.slice(0, 300));
  if (/quota|credit|insufficient|payment/i.test(text)) throw new ElevenLabsError('no_credit');
  if (res.status === 401 || res.status === 403) throw new ElevenLabsError('bad_key');
  if (res.status === 404) throw new ElevenLabsError('no_voice');
  if (res.status === 429) throw new ElevenLabsError('rate_limited');
  if (res.status >= 500) throw new ElevenLabsError('busy');
  throw new ElevenLabsError('failed');
}

/** Speaks text with one of the account's voices and returns WAV audio (24 kHz). */
export async function speakEleven(text: string, voiceId: string): Promise<Buffer> {
  const model = elevenModel();
  const res = await call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=wav_24000`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
    body: JSON.stringify({ text, model_id: model }),
  }, SPEECH_TIMEOUT_MS);
  const audio = Buffer.from(await res.arrayBuffer());
  recordUsage({ provider: 'elevenlabs', model, kind: 'voice', input: [...text].length, output: 0 });
  return audio;
}

let cache: { at: number; voices: ElevenVoice[] } | null = null;

/** The voices on the person's ElevenLabs account (premade, cloned and designed), cached for a few minutes. */
export async function listElevenVoices(): Promise<ElevenVoice[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.voices;
  const voices: ElevenVoice[] = [];
  let token: string | null = null;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ page_size: '100', sort: 'name', sort_direction: 'asc', ...(token ? { next_page_token: token } : {}) });
    const body = await (await call(`/v2/voices?${q}`, { method: 'GET' }, 30_000)).json() as {
      voices?: { voice_id: string; name?: string; category?: string; labels?: Record<string, string> }[]; has_more?: boolean; next_page_token?: string | null;
    };
    for (const v of body.voices ?? []) {
      const about = [v.labels?.gender, v.labels?.accent, v.category && v.category !== 'premade' ? v.category : ''].filter(Boolean).join(', ');
      voices.push({ id: v.voice_id, label: `${v.name ?? v.voice_id}${about ? ` (${about})` : ''}`, kind: 'default' });
    }
    if (!body.has_more || !body.next_page_token) break;
    token = body.next_page_token;
  }
  cache = { at: Date.now(), voices };
  return voices;
}

/** For tests: forget the cached voice list. */
export function resetElevenVoices(): void { cache = null; }
