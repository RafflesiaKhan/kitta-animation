import { GoogleGenAI } from '@google/genai';
import type { GenerateContentParameters, Schema } from '@google/genai';
import { recordGemini, type UsageKind } from './usage';
import { readFile } from 'node:fs/promises';
import { withSpeechWav } from './audio';
import { EXPRESSIONS, GESTURES } from '../shared/types';
import type { Expression, Gesture, MouthBox, ScriptLineInput } from '../shared/types';
import { TONES } from '../shared/character/expressions';

export { VOICES } from '../shared/voices';

export class GeminiError extends Error {
  constructor(public code: 'no_key' | 'bad_key' | 'rate_limited' | 'busy' | 'timed_out' | 'no_image' | 'failed') {
    super(code);
    this.name = 'GeminiError';
  }
}

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('no_key');
  return new GoogleGenAI({ apiKey });
}

/** One generateContent call, with its token usage recorded for the telemetry panel. */
async function generate(ai: GoogleGenAI, kind: UsageKind, req: GenerateContentParameters) {
  const res = await ai.models.generateContent(req);
  recordGemini(kind, req.model, res.usageMetadata);
  return res;
}

// Upper bounds for one AI call, so an overloaded model (the SDK retries 503s) can't hang the UI for minutes
const AUTOTAG_TIMEOUT_MS = 30_000;
const TRANSCRIBE_TIMEOUT_MS = 90_000;
const IMAGE_TIMEOUT_MS = 120_000;
// One quick retry instead of the SDK default (5 attempts, backoff up to 60 s), so a busy model is reported in seconds
const QUICK_RETRY = { retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 2 } };

/** Maps any SDK failure to a GeminiError (429 -> rate_limited, 503 -> busy, abort -> timed_out, invalid key -> bad_key) and logs the rest. */
function toGeminiError(e: unknown, what: string): GeminiError {
  if (e instanceof GeminiError) return e;
  const err = e as { name?: string; status?: number; code?: number; message?: string };
  // Every mapped failure is logged with Google's own words, so the terminal shows why ("busy" alone says little).
  const log = (code: string) => console.warn(`gemini ${what}: ${code}`, err?.status ?? err?.code ?? '', (err?.message ?? 'unknown error').slice(0, 300));
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') { log('timed_out'); return new GeminiError('timed_out'); }
  if (err?.status === 429 || err?.code === 429 || /RESOURCE_EXHAUSTED/.test(err?.message ?? '')) { log('rate_limited'); return new GeminiError('rate_limited'); }
  const status = err?.status ?? err?.code;
  if (status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(err?.message ?? '')) { log('busy'); return new GeminiError('busy'); }
  if ((status === 400 || status === 403) && /API key|API_KEY_INVALID|PERMISSION_DENIED/i.test(err?.message ?? '')) { log('bad_key'); return new GeminiError('bad_key'); }
  console.error(`gemini ${what} failed`, err?.status ?? '', err?.message ?? 'unknown error');
  return new GeminiError('failed');
}

const textModel = () => process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash';
const imageModel = () => process.env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1';

const SAMPLE_RATE = 24000; // Gemini TTS: 24 kHz, 16-bit, mono

export function wrapPcm(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/**
 * What Gemini TTS is sent. A plain neutral line is just its text (the most natural read). Otherwise the direction
 * goes in director's notes, kept apart from a marked transcript: an inline "Say in a … tone:" prefix was
 * sometimes read out loud.
 */
export function ttsPrompt(line: Pick<ScriptLineInput, 'text' | 'expression' | 'note'>): string {
  const style = [line.expression !== 'neutral' && `${TONES[line.expression]} tone`, line.note?.trim()].filter(Boolean).join(', ');
  if (!style) return line.text;
  return `### DIRECTOR'S NOTES\nStyle: ${style}. Keep it natural and conversational. Only the transcript is spoken; never read these notes aloud.\n\n### TRANSCRIPT\n${line.text}`;
}

/** Speaks one line with Gemini TTS and returns a WAV buffer. */
export async function tts(line: ScriptLineInput): Promise<Buffer> {
  const ai = client();
  try {
    const res = await generate(ai, 'voice', {
      model: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
      contents: ttsPrompt(line),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: line.voice } } },
      },
    });
    const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!data) throw new Error('no audio in response');
    const bytes = Buffer.from(data, 'base64');
    return bytes.subarray(0, 4).toString() === 'RIFF' ? bytes : wrapPcm(bytes);
  } catch (e) {
    throw toGeminiError(e, 'tts');
  }
}

export interface Tag { expression: Expression; gesture: Gesture }
const NEUTRAL: Tag = { expression: 'neutral', gesture: 'none' };

function parseJson(text: string | undefined): unknown {
  try { return JSON.parse(text ?? ''); } catch { return null; }
}

/** Picks an expression and gesture per text. Always returns exactly texts.length items. */
export async function autoTag(texts: string[]): Promise<Tag[]> {
  if (texts.length === 0) return [];
  const ai = client();
  let parsed: unknown;
  try {
    const res = await generate(ai, 'auto-tag', {
      model: textModel(),
      contents: 'Tag each numbered line with the single best expression and an optional gesture for a cartoon character saying it. ' +
        "Use gesture 'none' unless a gesture clearly fits. Reply with a JSON array with one item per line, in order.\n\n" +
        texts.map((t, i) => `${i + 1}. ${t}`).join('\n'),
      config: {
        abortSignal: AbortSignal.timeout(AUTOTAG_TIMEOUT_MS),
        httpOptions: QUICK_RETRY,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              expression: { type: 'STRING', enum: EXPRESSIONS },
              gesture: { type: 'STRING', enum: GESTURES },
            },
            required: ['expression', 'gesture'],
          },
        } as unknown as Schema,
      },
    });
    parsed = parseJson(res.text);
  } catch (e) {
    throw toGeminiError(e, 'autotag');
  }
  const items = Array.isArray(parsed) ? parsed : [];
  return texts.map((_, i) => {
    const it = items[i] as { expression?: unknown; gesture?: unknown } | null | undefined;
    return {
      expression: EXPRESSIONS.includes(it?.expression as Expression) ? (it!.expression as Expression) : NEUTRAL.expression,
      gesture: GESTURES.includes(it?.gesture as Gesture) ? (it!.gesture as Gesture) : NEUTRAL.gesture,
    };
  });
}

/** Seconds from a number, "ss.mmm" or "mm:ss.mmm"; null if unusable. */
function toMs(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const parts = v.trim().split(':').map(Number);
  if (parts.length > 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return Math.round(parts.reduce((acc, n) => acc * 60 + n, 0) * 1000);
}

/** Sentence-level transcript of a WAV with timings in ms, sorted and non-overlapping. */
export async function transcribe(wavPath: string): Promise<{ text: string; startMs: number; endMs: number }[]> {
  const ai = client();
  let parsed: unknown;
  try {
    // 16 kHz mono keeps 3 minutes (~5.8 MB) well under Gemini's ~20 MB inline limit
    const data = await withSpeechWav(wavPath, async (p) => (await readFile(p)).toString('base64'));
    const res = await generate(ai, 'transcribe', {
      model: textModel(),
      contents: [{ role: 'user', parts: [
        { text: 'Transcribe this audio into sentences. For each give the text and start and end times in seconds.' },
        { inlineData: { mimeType: 'audio/wav', data } },
      ] }],
      config: {
        abortSignal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
        httpOptions: QUICK_RETRY,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { text: { type: 'STRING' }, start: { type: 'NUMBER' }, end: { type: 'NUMBER' } },
            required: ['text', 'start', 'end'],
          },
        } as unknown as Schema,
      },
    });
    parsed = parseJson(res.text);
  } catch (e) {
    throw toGeminiError(e, 'transcribe');
  }
  const items = (Array.isArray(parsed) ? parsed : []).flatMap((x: { text?: unknown; start?: unknown; end?: unknown } | null) => {
    const text = typeof x?.text === 'string' ? x.text.trim() : '';
    const startMs = toMs(x?.start), endMs = toMs(x?.end);
    return text && startMs !== null && endMs !== null ? [{ text, startMs: Math.max(0, startMs), endMs }] : [];
  }).sort((a, b) => a.startMs - b.startMs);
  return items
    .map((l, i) => ({ ...l, endMs: Math.min(l.endMs, items[i + 1]?.startMs ?? Infinity) }))
    .filter((l) => l.endMs > l.startMs);
}

export interface ImageInput { data: Buffer; mimeType: string }

/** Paints one square image from a prompt, optionally editing/redrawing the given reference images. */
export async function generateImage(prompt: string, refs: ImageInput[] = []): Promise<Buffer> {
  const ai = client();
  let data: string | undefined;
  try {
    const res = await generate(ai, 'image', {
      model: imageModel(),
      contents: [{ role: 'user', parts: [
        ...refs.map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.data.toString('base64') } })),
        { text: prompt },
      ] }],
      config: {
        abortSignal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        httpOptions: QUICK_RETRY,
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1' },
      },
    });
    data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/'))?.inlineData?.data;
  } catch (e) {
    throw toGeminiError(e, 'image');
  }
  if (!data) throw new GeminiError('no_image'); // usually a safety refusal
  return Buffer.from(data, 'base64');
}

const HEX_RE = /^#[0-9a-f]{6}$/i;
export const MOUTH_PROMPT = "Find the character's mouth. Give its bounding box as box_2d [ymin, xmin, ymax, xmax] scaled 0-1000, " +
  'and the skin colour right around the mouth as #rrggbb. Set found to false if the character has no visible mouth.';

/** Finds the character's mouth in a PNG; null when there is no clear mouth (lip sync then just shows the art). */
export async function findMouth(png: Buffer): Promise<MouthBox | null> {
  const ai = client();
  let parsed: unknown;
  try {
    const res = await generate(ai, 'mouth', {
      model: textModel(),
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'image/png', data: png.toString('base64') } },
        { text: MOUTH_PROMPT },
      ] }],
      config: {
        abortSignal: AbortSignal.timeout(AUTOTAG_TIMEOUT_MS),
        httpOptions: QUICK_RETRY,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { found: { type: 'BOOLEAN' }, box_2d: { type: 'ARRAY', items: { type: 'NUMBER' } }, skin: { type: 'STRING' } },
          required: ['found'],
        } as unknown as Schema,
      },
    });
    parsed = parseJson(res.text);
  } catch (e) {
    throw toGeminiError(e, 'mouth');
  }
  return parseMouthBox(parsed);
}

/** Validates a mouth reply ({found, box_2d: [ymin, xmin, ymax, xmax] on 0-1000, skin}) from any vision model. */
export function parseMouthBox(parsed: unknown): MouthBox | null {
  const r = parsed as { found?: unknown; box_2d?: unknown; skin?: unknown } | null;
  const box = Array.isArray(r?.box_2d) && r!.box_2d.length === 4 && r!.box_2d.every((v) => typeof v === 'number' && v >= 0 && v <= 1000) ? (r!.box_2d as number[]) : null;
  if (r?.found !== true || !box) return null;
  const [y0, x0, y1, x1] = box;
  const w = (x1 - x0) / 1000;
  if (w <= 0.005 || w > 0.6 || y1 <= y0) return null;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { x: round((x0 + x1) / 2000), y: round((y0 + y1) / 2000), w: round(w), skin: typeof r.skin === 'string' && HEX_RE.test(r.skin) ? r.skin : '#f2c9a0' };
}
