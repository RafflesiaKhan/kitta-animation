import { GoogleGenAI } from '@google/genai';
import type { Schema } from '@google/genai';
import { readFile } from 'node:fs/promises';
import { EXPRESSIONS, GESTURES } from '../shared/types';
import type { Expression, Gesture, ScriptLineInput } from '../shared/types';

export { VOICES } from '../shared/voices';

export class GeminiError extends Error {
  constructor(public code: 'no_key' | 'rate_limited' | 'failed') {
    super(code);
    this.name = 'GeminiError';
  }
}

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('no_key');
  return new GoogleGenAI({ apiKey });
}

/** Maps any SDK failure to a GeminiError (429 -> rate_limited) and logs the rest. */
function toGeminiError(e: unknown, what: string): GeminiError {
  if (e instanceof GeminiError) return e;
  const err = e as { status?: number; code?: number; message?: string };
  if (err?.status === 429 || err?.code === 429 || /RESOURCE_EXHAUSTED/.test(err?.message ?? '')) return new GeminiError('rate_limited');
  console.error(`gemini ${what} failed`, err?.status ?? '', err?.message ?? 'unknown error');
  return new GeminiError('failed');
}

const textModel = () => process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash';

const SAMPLE_RATE = 24000; // Gemini TTS: 24 kHz, 16-bit, mono

function wrapPcm(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Speaks one line with Gemini TTS and returns a WAV buffer. */
export async function tts(line: ScriptLineInput): Promise<Buffer> {
  const ai = client();
  try {
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
      contents: `Say in a ${line.expression} tone${line.note ? ', ' + line.note : ''}: ${line.text}`,
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
    const res = await ai.models.generateContent({
      model: textModel(),
      contents: 'Tag each numbered line with the single best expression and an optional gesture for a cartoon character saying it. ' +
        "Use gesture 'none' unless a gesture clearly fits. Reply with a JSON array with one item per line, in order.\n\n" +
        texts.map((t, i) => `${i + 1}. ${t}`).join('\n'),
      config: {
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
  const data = (await readFile(wavPath)).toString('base64');
  let parsed: unknown;
  try {
    const res = await ai.models.generateContent({
      model: textModel(),
      contents: [{ role: 'user', parts: [
        { text: 'Transcribe this audio into sentences. For each give the text and start and end times in seconds.' },
        { inlineData: { mimeType: 'audio/wav', data } },
      ] }],
      config: {
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
