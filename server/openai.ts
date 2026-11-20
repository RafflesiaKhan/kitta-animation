import type { MouthBox, ScriptLineInput } from '../shared/types';
import { CUES, DEFAULT_SPEAKER, isEngineDefaultVoice, LANGUAGES, SOUND_TAGS, SPEAKERS, type VoiceStudioEngine, type VoiceStudioInfo, type VoiceStudioVoice } from '../shared/voices';
import { readFile } from 'node:fs/promises';
import { TONES } from '../shared/character/expressions';
import { MOUTH_PROMPT, parseMouthBox, type ImageInput, type ImageShape } from './gemini';
import { DIRECTION_CHOICES, directionPrompt, toMatch, type Direction, type Match } from '../shared/direction';
import { recordOpenAI, recordUsage } from './usage';
import type { ChatBlock, ToolChat, ToolSpec } from './tool-chat';
import type { UsageEntry } from '../shared/usage';

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
const DIRECT_TIMEOUT_MS = 30_000;
const imageModel = () => process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const visionModel = () => process.env.OPENAI_VISION_MODEL || 'gpt-5-mini';
const textModel = () => process.env.OPENAI_TEXT_MODEL || 'gpt-5-mini';

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

const SIZES: Record<ImageShape, string> = { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' };

/** Paints one image (1024² by default); with reference images it is an edit of them (images/edits). */
export async function generateImage(prompt: string, refs: ImageInput[] = [], shape: ImageShape = 'square'): Promise<Buffer> {
  let out: any;
  if (refs.length === 0) {
    out = await call('/images/generations', JSON.stringify({ model: imageModel(), prompt, size: SIZES[shape], n: 1 }), IMAGE_TIMEOUT_MS, true);
  } else {
    const form = new FormData();
    form.append('model', imageModel());
    form.append('prompt', prompt);
    form.append('size', SIZES[shape]);
    refs.forEach((r, i) => form.append('image[]', new Blob([new Uint8Array(r.data)], { type: r.mimeType }), `ref-${i}.${r.mimeType.split('/')[1]}`));
    out = await call('/images/edits', form, IMAGE_TIMEOUT_MS, false);
  }
  recordOpenAI('image', imageModel(), out?.usage);
  const b64 = out?.data?.[0]?.b64_json;
  if (typeof b64 !== 'string' || !b64) throw new OpenAIError('no_image');
  return Buffer.from(b64, 'base64');
}

/** Same contract as the Gemini director: one name per stage direction; undefined where the answer was unusable. */
export async function direct(ds: Direction[]): Promise<(Match | undefined)[]> {
  const names = [...new Set(Object.values(DIRECTION_CHOICES).flat())];
  const out = await call('/chat/completions', JSON.stringify({
    model: textModel(),
    messages: [{ role: 'user', content: directionPrompt(ds) }],
    response_format: { type: 'json_schema', json_schema: { name: 'directions', strict: true, schema: {
      type: 'object',
      properties: { picks: { type: 'array', items: { type: 'string', enum: names } } },
      required: ['picks'],
      additionalProperties: false,
    } } },
  }), DIRECT_TIMEOUT_MS, true);
  recordOpenAI('direct', textModel(), out?.usage);
  let picks: unknown[] = [];
  try {
    const p = JSON.parse(out?.choices?.[0]?.message?.content ?? '')?.picks;
    if (Array.isArray(p)) picks = p;
  } catch { /* unusable answer: every direction falls back */ }
  return ds.map((d, i) => toMatch(d, picks[i]));
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
      properties: {
        found: { type: 'boolean' }, box_2d: { type: 'array', items: { type: 'number' } }, skin: { type: 'string' },
        landmarks: { type: 'object', properties: {
          leftEye: { type: 'array', items: { type: 'number' } }, rightEye: { type: 'array', items: { type: 'number' } },
          nose: { type: 'array', items: { type: 'number' } }, mouthLeft: { type: 'array', items: { type: 'number' } },
          mouthRight: { type: 'array', items: { type: 'number' } },
        }, required: ['leftEye', 'rightEye', 'nose', 'mouthLeft', 'mouthRight'], additionalProperties: false },
      },
      required: ['found', 'box_2d', 'skin', 'landmarks'],
      additionalProperties: false,
    } } },
  }), MOUTH_TIMEOUT_MS, true);
  recordOpenAI('mouth', visionModel(), out?.usage);
  try {
    return parseMouthBox(JSON.parse(out?.choices?.[0]?.message?.content ?? ''));
  } catch {
    return null;
  }
}

/**
 * Script text for an OpenAI-style voice (pauses and cues were already split off by speech.ts). Leftover <tags> never get
 * read out. VoiceStudio keeps the reaction sounds its default engine performs (tags: false for engines that would read
 * them); every other [bracket] tag is dropped.
 */
export function speakableText(text: string, service: Service = 'OpenAI', tags = true): string {
  const keep = service === 'VoiceStudio' && tags;
  return text.replace(/\[([^\]]*)\]/g, (m, tag: string) => (keep && SOUND_TAGS.includes(tag.trim().toLowerCase()) ? m : ' '))
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** VoiceStudio's designed voices (GET /personalities, outside /v1); [] when it can't be read. */
async function personalities(): Promise<any[]> {
  try {
    const res = await fetch(`${voiceStudioUrl()}/personalities`, { signal: AbortSignal.timeout(5_000) });
    const out = res.ok ? await res.json() : [];
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

/** A VoiceStudio persona (voice id "persona:<id>") is a designed voice: its speaker attributes from /personalities. */
async function personaInstruct(voice: string): Promise<string[]> {
  if (!voice.startsWith('persona:')) return [];
  const p = (await personalities()).find((x) => x?.id === voice.slice(8));
  return typeof p?.instruct === 'string' ? p.instruct.split(',').map((x: string) => x.trim()).filter(Boolean) : [];
}

/** Per-segment extras from speech.ts: the inline cue in force and VoiceStudio's sampling seed. */
export interface SpeakOptions { cue?: string; seed?: number }

/** Speaks one line with OpenAI or VoiceStudio and returns the audio (WAV). engine picks a VoiceStudio engine. */
export async function speak(service: Service, line: ScriptLineInput, engine?: string, opts: SpeakOptions = {}): Promise<Buffer> {
  const studio = service === 'VoiceStudio';
  const body: Record<string, unknown> = {
    model: service === 'OpenAI' ? process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts' : engine || process.env.VOICESTUDIO_TTS_MODEL || 'tts-1',
    voice: studio && line.voice.startsWith('persona:') ? 'default' : line.voice,
    input: speakableText(line.text, service, !engine || engine.startsWith('omnivoice')),
    response_format: 'wav',
  };
  if (studio) {
    // OmniVoice's style field is a strict list of speaker attributes (anything else fails), so only those go in:
    // the persona's attributes, the picked English accent instead of the persona's accent or Chinese dialect
    // (such as 四川话; it refuses both together), and whisper.
    const lang = LANGUAGES.find((l) => l.id === line.language);
    const items = (await personaInstruct(line.voice)).filter((x) => !(lang?.accent && (x.endsWith(' accent') || x.endsWith('话'))));
    // The engine default voice has no speaker of its own, so OmniVoice gets the same described one on every line.
    if (isEngineDefaultVoice(line.voice) && (!engine || engine.startsWith('omnivoice'))) {
      items.push((SPEAKERS.find((s) => s.id === line.speaker) ?? SPEAKERS.find((s) => s.id === DEFAULT_SPEAKER)!).instruct);
    }
    if (lang?.accent) items.push(lang.accent);
    if (line.style === 'whisper' || opts.cue === 'whisper' || /whisper/i.test(line.note ?? '')) items.push('whisper');
    if (items.length) body.instruct = items.join(', ');
    if (lang?.code) body.language = lang.code;
    // Speed is native; an emotion cue it can't perform nudges the speed (and, in speech.ts, the pitch).
    const speed = (1 + (line.speed ?? 0) / 100) * (1 + (CUES[opts.cue ?? '']?.speed ?? 0) / 100);
    if (Math.abs(speed - 1) > 0.001) body.speed = Math.round(Math.min(4, Math.max(0.25, speed)) * 100) / 100;
    if (opts.seed !== undefined) body.seed = opts.seed;
  } else {
    // OpenAI's TTS takes delivery instructions (speech.ts has already folded style, language and cues into the note).
    const style = [line.expression !== 'neutral' && `a ${TONES[line.expression]} tone`, line.note?.trim()].filter(Boolean).join(', ');
    body.instructions = style ? `Speak naturally, in ${style}.` : 'Speak naturally and conversationally.';
  }
  const audio: Buffer = await call('/audio/speech', JSON.stringify(body), SPEECH_TIMEOUT_MS, true, service, true);
  // The speech endpoint returns only audio, so there are no token counts to record, just the call.
  recordUsage({ provider: service === 'OpenAI' ? 'openai' : 'voicestudio', model: String(body.model), kind: 'voice', input: null, output: null });
  return audio;
}

/** Status, installed engines and pickable voices of the VoiceStudio at VOICESTUDIO_URL; running: false if unreachable. */
export async function voiceStudioInfo(): Promise<VoiceStudioInfo> {
  const url = voiceStudioUrl();
  const info: VoiceStudioInfo = { running: false, url, voices: [], engines: [] };
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3_000) });
    const h = await res.json().catch(() => ({}));
    if (!res.ok) return info;
    info.running = true;
    if (typeof h?.version === 'string') info.version = h.version;
    if (typeof h?.device === 'string') info.device = h.device;
  } catch {
    return info;
  }
  try {
    const out = await call('/audio/voices', null, 5_000, false, 'VoiceStudio');
    const raw: any[] = Array.isArray(out?.voices) ? out.voices : Array.isArray(out) ? out : [];
    // Saved/cloned profiles by name. The OpenAI-style aliases (alloy, coral…) all map to the engine's default voice,
    // so they collapse into a single "engine default" entry.
    const profiles: VoiceStudioVoice[] = raw.flatMap((v) => {
      const id = typeof v === 'string' ? v : v?.voice_id ?? v?.id;
      if (typeof id !== 'string' || !id || id.length > 100 || v?.type === 'openai_alias') return [];
      const name = typeof v?.name === 'string' && v.name ? v.name : id;
      return [{ id, label: v?.language ? `${name} (${v.language})` : name, kind: 'profile' as const }];
    });
    // Personas are VoiceStudio's designed voices (speaker attributes, no recording), each with an icon.
    const personas: VoiceStudioVoice[] = (await personalities()).flatMap((p) =>
      typeof p?.id === 'string' && typeof p?.name === 'string' && typeof p?.instruct === 'string' && p.id.length <= 64
        ? [{ id: `persona:${p.id}`, label: p.name, kind: 'persona' as const, ...(typeof p.icon === 'string' ? { icon: p.icon } : {}) }] : []);
    info.voices = [...profiles, ...personas, { id: 'alloy', label: "Engine's default voice", kind: 'default' }];
    const engines: any[] = Array.isArray(out?.engines) ? out.engines : [];
    info.engines = engines.filter((e) => e?.available === true && typeof e?.id === 'string').map((e): VoiceStudioEngine => ({
      id: e.id,
      label: typeof e.display_name === 'string' ? e.display_name : e.id,
      cloning: e.supports_cloning === true,
      emotion: e.supports_emotion === true,
    }));
  } catch {
    info.voices = [{ id: 'alloy', label: "Engine's default voice", kind: 'default' }];
  }
  return info;
}

/** Sentence-level transcript of a WAV from VoiceStudio's local Whisper (free, offline), timings in ms. */
export async function voiceStudioTranscribe(wavPath: string): Promise<{ text: string; startMs: number; endMs: number }[]> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(await readFile(wavPath))], { type: 'audio/wav' }), 'speech.wav');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  const out = await call('/audio/transcriptions', form, 180_000, false, 'VoiceStudio');
  recordUsage({ provider: 'voicestudio', model: 'whisper-1', kind: 'transcribe', input: null, output: null });
  const segments: any[] = Array.isArray(out?.segments) ? out.segments : [];
  const lines = segments.flatMap((s) => {
    const text = typeof s?.text === 'string' ? s.text.trim() : '';
    const start = Number(s?.start), end = Number(s?.end);
    return text && Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) }] : [];
  }).sort((a, b) => a.startMs - b.startMs);
  return lines.map((l, i) => ({ ...l, endMs: Math.min(l.endMs, lines[i + 1]?.startMs ?? Infinity) })).filter((l) => l.endMs > l.startMs);
}

// ---- Drawing vector characters (version 2 planning/vector-create-plan.md): the OpenAI side of server/tool-chat.ts.

export const drawModel = () => process.env.OPENAI_DRAW_MODEL || 'gpt-6.2-astra';
const DRAW_TIMEOUT_MS = 40 * 60_000; // one drawing round can take many minutes
const DRAW_POLL_MS = 5_000;
const DRAW_ATTEMPTS = 3;
const DRAW_RETRY_MS = 15_000;

const toInput = (b: ChatBlock) => (b.type === 'text' ? { type: 'input_text', text: b.text } : { type: 'input_image', image_url: `data:image/png;base64,${b.png.toString('base64')}`, detail: 'high' });

/**
 * A drawing conversation on the Responses API. Each request runs in background mode and is polled, so a long round
 * is not cut by an HTTP timeout; later rounds continue the stored conversation with previous_response_id. A tool
 * result's text goes back as the function call output and its pictures as a user message right after it.
 */
export function openaiToolChat(system: string, tool: ToolSpec, model = drawModel()): ToolChat {
  let previous: string | null = null;
  let lastCall: string | null = null;
  return {
    provider: 'openai',
    model,
    async send(blocks, signal) {
      const images = blocks.filter((b) => b.type === 'image');
      const input = lastCall
        ? [
          { type: 'function_call_output', call_id: lastCall, output: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n') },
          ...(images.length ? [{ role: 'user', content: [{ type: 'input_text', text: 'The check picture for the call above:' }, ...images.map(toInput)] }] : []),
        ]
        : [{ role: 'user', content: blocks.map(toInput) }];
      const body = JSON.stringify({
        model, instructions: system, input, background: true, store: true,
        ...(previous ? { previous_response_id: previous } : {}),
        tools: [{ type: 'function', name: tool.name, description: tool.description, parameters: { type: 'object', ...tool.parameters }, strict: false }],
        tool_choice: { type: 'function', name: tool.name }, parallel_tool_calls: false,
        reasoning: { effort: 'high' }, max_output_tokens: 128_000,
      });
      let res: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Responses API JSON
      let usage!: UsageEntry;
      // A busy server (429/5xx, or a background job that fails as overloaded) is retried; the conversation is
      // unchanged until a round completes, so the same request can simply be sent again.
      for (let attempt = 1; ; attempt++) {
        const wait = async (ms: number) => {
          await new Promise((r) => setTimeout(r, ms));
          if (signal?.aborted) {
            // stop the background job too, so it is not billed to the end
            if (res?.id) await call(`/responses/${res.id}/cancel`, '{}', 30_000, true).catch(() => {});
            throw new DOMException('Cancelled', 'AbortError');
          }
        };
        try {
          res = await call('/responses', body, 120_000, true);
          const until = Date.now() + DRAW_TIMEOUT_MS;
          while (res?.status === 'queued' || res?.status === 'in_progress') {
            if (Date.now() > until) throw new OpenAIError('timed_out');
            await wait(DRAW_POLL_MS);
            res = await call(`/responses/${res.id}`, null, 60_000, false);
          }
        } catch (e) {
          if (attempt < DRAW_ATTEMPTS && e instanceof OpenAIError && (e.code === 'busy' || e.code === 'rate_limited')) { await wait(DRAW_RETRY_MS * attempt); continue; }
          throw e;
        }
        usage = recordOpenAI('draw', model, res?.usage);
        const err = res?.error ?? {};
        const busy = res?.status === 'failed' && /overloaded|unavailable|rate_limit/i.test(`${err.type ?? ''} ${err.code ?? ''}`);
        if (!busy || attempt >= DRAW_ATTEMPTS) break;
        console.warn(`openai /responses: ${err.code ?? err.type}, retrying (attempt ${attempt + 1} of ${DRAW_ATTEMPTS})`);
        await wait(Math.max(Number(err.headers?.['retry-after-ms']) || 0, DRAW_RETRY_MS * attempt));
      }
      if (res?.status !== 'completed') {
        console.warn('openai /responses', res?.status, JSON.stringify(res?.incomplete_details ?? res?.error ?? '').slice(0, 300));
        throw new OpenAIError(res?.status === 'incomplete' ? 'timed_out' : 'failed');
      }
      const fc = (res.output ?? []).find((o: { type?: string; name?: string }) => o.type === 'function_call' && o.name === tool.name);
      if (!fc) throw new OpenAIError('failed');
      previous = res.id;
      lastCall = fc.call_id;
      let parsed: unknown;
      try { parsed = JSON.parse(fc.arguments); } catch { parsed = {}; }
      return { input: parsed, usage };
    },
  };
}
