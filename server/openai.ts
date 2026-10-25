import type { MouthBox, ScriptLineInput } from '../shared/types';
import { TONES } from '../shared/character/expressions';
import { MOUTH_PROMPT, parseMouthBox, type ImageInput } from './gemini';

// OpenAI-style REST APIs over plain fetch (no extra SDK), models from env:
// - OpenAI: image generation/editing, the mouth lookup and speech.
// - VoiceStudio (github.com/debpalash/VoiceStudio): a free, local voice app whose backend serves the same
//   POST /v1/audio/speech, so the speech code is shared.

export type Service = 'OpenAI' | 'VoiceStudio';

export class OpenAIError extends Error {
  constructor(public code: 'no_key' | 'bad_key' | 'rate_limited' | 'busy' | 'timed_out' | 'no_image' | 'unreachable' | 'failed', public service: Service = 'OpenAI') {
    super(code);
    this.name = 'OpenAIError';
  }
}

const API = 'https://api.openai.com/v1';
export const voiceStudioUrl = () => (process.env.VOICESTUDIO_URL || 'http://localhost:3900').replace(/\/+$/, '');
const SPEECH_TIMEOUT_MS = 120_000; // a local CPU-only VoiceStudio can be slow
const IMAGE_TIMEOUT_MS = 180_000; // gpt-image models can take a minute or more per picture
const MOUTH_TIMEOUT_MS = 30_000;
const imageModel = () => process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const visionModel = () => process.env.OPENAI_VISION_MODEL || 'gpt-5-mini';

/** Base URL and auth for a service. OpenAI needs its key; a local VoiceStudio needs none (its key is for remote backends). */
function endpoint(service: Service): { base: string; headers: Record<string, string> } {
  if (service === 'VoiceStudio') {
    const k = process.env.VOICESTUDIO_API_KEY;
    return { base: `${voiceStudioUrl()}/v1`, headers: k ? { Authorization: `Bearer ${k}` } : {} };
  }
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new OpenAIError('no_key');
  return { base: API, headers: { Authorization: `Bearer ${k}` } };
}

/**
 * Sends one request and maps failures like toGeminiError does (401 -> bad_key, 429 -> rate_limited, 5xx -> busy,
 * abort -> timed_out, connection refused -> unreachable). Returns parsed JSON, or the raw bytes when binary.
 */
async function call(path: string, body: BodyInit | null, timeoutMs: number, json: boolean, service: Service = 'OpenAI', binary = false): Promise<any> {
  const { base, headers } = endpoint(service);
  if (json) headers['Content-Type'] = 'application/json';
  const tag = `${service.toLowerCase()} ${path}`;
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { method: body === null ? 'GET' : 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') { console.warn(`${tag}: timed_out`); throw new OpenAIError('timed_out', service); }
    console.warn(`${tag}: unreachable`, (e as Error)?.message);
    throw new OpenAIError(service === 'VoiceStudio' ? 'unreachable' : 'failed', service);
  }
  if (res.ok) return binary ? Buffer.from(await res.arrayBuffer()) : res.json().catch(() => ({}));
  const out = await res.json().catch(() => ({}));
  const code: string = out?.error?.code ?? '';
  const message = String(out?.error?.message ?? (typeof out?.detail === 'string' ? out.detail : JSON.stringify(out?.detail ?? ''))).slice(0, 300);
  const fail = (c: OpenAIError['code']) => { console.warn(`${tag}: ${c}`, res.status, message); return new OpenAIError(c, service); };
  if (res.status === 401) throw fail(service === 'OpenAI' ? 'bad_key' : 'no_key');
  if (res.status === 429) throw fail('rate_limited');
  if (res.status >= 500) throw fail('busy');
  if (/moderation|safety|content_policy/i.test(code)) throw fail('no_image');
  console.error(`${tag} failed`, res.status, message);
  throw new OpenAIError('failed', service);
}

/** Paints one 1024² image; with reference images it is an edit of them (images/edits). */
export async function generateImage(prompt: string, refs: ImageInput[] = []): Promise<Buffer> {
  let out: any;
  if (refs.length === 0) {
    out = await call('/images/generations', JSON.stringify({ model: imageModel(), prompt, size: '1024x1024', n: 1 }), IMAGE_TIMEOUT_MS, true);
  } else {
    const form = new FormData();
    form.append('model', imageModel());
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    refs.forEach((r, i) => form.append('image[]', new Blob([new Uint8Array(r.data)], { type: r.mimeType }), `ref-${i}.${r.mimeType.split('/')[1]}`));
    out = await call('/images/edits', form, IMAGE_TIMEOUT_MS, false);
  }
  const b64 = out?.data?.[0]?.b64_json;
  if (typeof b64 !== 'string' || !b64) throw new OpenAIError('no_image');
  return Buffer.from(b64, 'base64');
}

/** Same contract as the Gemini findMouth: null when there is no clear mouth. */
export async function findMouth(png: Buffer): Promise<MouthBox | null> {
  const out = await call('/chat/completions', JSON.stringify({
    model: visionModel(),
    messages: [{ role: 'user', content: [
      { type: 'text', text: MOUTH_PROMPT },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
    ] }],
    response_format: { type: 'json_schema', json_schema: { name: 'mouth', strict: true, schema: {
      type: 'object',
      properties: { found: { type: 'boolean' }, box_2d: { type: 'array', items: { type: 'number' } }, skin: { type: 'string' } },
      required: ['found', 'box_2d', 'skin'],
      additionalProperties: false,
    } } },
  }), MOUTH_TIMEOUT_MS, true);
  try {
    return parseMouthBox(JSON.parse(out?.choices?.[0]?.message?.content ?? ''));
  } catch {
    return null;
  }
}

/** Script text for an OpenAI-style voice: Gemini-style tags like <short pause> become pauses instead of being read out. */
export function speakableText(text: string): string {
  return text.replace(/<[^>]*pause[^>]*>/gi, ' ... ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Speaks one line with OpenAI or VoiceStudio and returns the audio (WAV). */
export async function speak(service: Service, line: ScriptLineInput): Promise<Buffer> {
  const body: Record<string, unknown> = {
    model: service === 'OpenAI' ? process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts' : process.env.VOICESTUDIO_TTS_MODEL || 'tts-1',
    voice: line.voice,
    input: speakableText(line.text),
    response_format: 'wav',
  };
  // OpenAI's TTS takes delivery instructions; VoiceStudio's compatibility layer is only promised the standard fields.
  if (service === 'OpenAI') body.instructions = `Speak in a ${TONES[line.expression]} tone${line.note ? `, ${line.note}` : ''}.`;
  return call('/audio/speech', JSON.stringify(body), SPEECH_TIMEOUT_MS, true, service, true);
}

/** Voice names a running VoiceStudio offers (saved and built-in voices); empty when it can't be reached. */
export async function voiceStudioVoices(): Promise<string[]> {
  try {
    const out = await call('/audio/voices', null, 5_000, false, 'VoiceStudio');
    const list: unknown[] = Array.isArray(out) ? out : Array.isArray(out?.voices) ? out.voices : Array.isArray(out?.data) ? out.data : [];
    const names = list.map((v) => (typeof v === 'string' ? v : (v as { id?: unknown; voice_id?: unknown; name?: unknown })?.id ?? (v as any)?.voice_id ?? (v as any)?.name))
      .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100);
    return [...new Set(names)].slice(0, 200);
  } catch {
    return [];
  }
}
