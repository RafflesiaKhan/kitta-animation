import type { ScriptLineInput } from '../shared/types';
import { CUES, LANGUAGES, type TtsProvider } from '../shared/voices';
import { tts, wrapPcm, GeminiError } from './gemini';
import { OpenAIError, speak } from './openai';
import { speechPcm, SPEECH_RATE } from './audio';
import { withRetries } from './retry';

/** Voice providers that are set up: Gemini and OpenAI need their keys, VoiceStudio is opted into with VOICESTUDIO_URL. */
export function ttsProviders(): TtsProvider[] {
  const out: TtsProvider[] = [];
  if (process.env.GEMINI_API_KEY) out.push('gemini');
  if (process.env.OPENAI_API_KEY) out.push('openai');
  if (process.env.VOICESTUDIO_URL) out.push('voicestudio');
  return out;
}

/** Overloaded or rate-limited: worth waiting for. Anything else (bad key, refusal, not running) fails at once. */
export const isTransient = (e: unknown) =>
  (e instanceof GeminiError || e instanceof OpenAIError) && (e.code === 'busy' || e.code === 'rate_limited');

/** A piece of a line: text spoken with the cue in force, or a silence. */
export type Segment = { text: string; cue?: string } | { pauseMs: number };

const MAX_PAUSE_MS = 10_000;
const TOKEN = new RegExp(`<[^>]*pause[^>]*>|\\[\\s*(/?)\\s*(pause|${Object.keys(CUES).join('|')})\\b([^\\]]*)\\]`, 'gi');

/** Length of [pause], [pause 1s], [pause 500ms], or a Gemini-style <short pause> / <long pause>. */
function pauseMs(token: string, arg: string): number {
  if (token.startsWith('<')) return /long/i.test(token) ? 1000 : 400;
  const m = arg.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/i);
  if (!m) return 500;
  return Math.min(MAX_PAUSE_MS, Math.round(parseFloat(m[1]) * (m[2]?.toLowerCase() === 'ms' ? 1 : 1000)));
}

/**
 * Splits a line at its pauses and cues. A cue like [excited] lasts until its [/excited], the next cue or the end of the
 * line. Pauses are made here, as real silence, because providers read most pause tags out loud.
 */
export function parseSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let cue: string | undefined;
  let at = 0;
  const push = (t: string) => { if (t.trim()) out.push(cue ? { text: t.trim(), cue } : { text: t.trim() }); };
  for (const m of text.matchAll(TOKEN)) {
    push(text.slice(at, m.index));
    at = m.index! + m[0].length;
    const name = m[2]?.toLowerCase();
    if (m[0].startsWith('<') || name === 'pause') out.push({ pauseMs: pauseMs(m[0], m[3] ?? '') });
    else cue = m[1] ? undefined : name;
  }
  push(text.slice(at));
  return out;
}

/** What the line says, without any tags (for lip-sync recognition). */
export const plainText = (text: string) => text.replace(/\[[^\]]*\]|<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Steady takes: the same seed for a voice every time. Varied: a new one per line. */
function lineSeed(line: ScriptLineInput): number {
  if (line.variability === 'varied') return Math.floor(Math.random() * 2 ** 31);
  let h = 0;
  for (const c of line.voice) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** OpenAI and Gemini take spoken direction, so style, language and the cue join the line's delivery note. */
function directed(line: ScriptLineInput, text: string, cue?: string): ScriptLineInput {
  const say = [line.note?.trim(), line.style === 'whisper' && 'whispering', LANGUAGES.find((l) => l.id === line.language)?.say, cue && CUES[cue].say];
  const note = say.filter(Boolean).join(', ');
  return { ...line, text, note: note || undefined };
}

/**
 * Speaks one line with the chosen provider, riding out short overloads with patient retries. The line is spoken
 * piece by piece between its pauses and cues; pitch (all providers) and speed (OpenAI and Gemini, whose speed isn't
 * native here) are applied afterwards with ffmpeg, and the pieces are joined with real silence.
 */
export async function speakLine(provider: TtsProvider, line: ScriptLineInput, engine?: string): Promise<Buffer> {
  const studio = provider === 'voicestudio';
  const seed = studio ? lineSeed(line) : undefined;
  const once = (text: string, cue?: string) => withRetries(
    () => (provider === 'gemini' ? tts(directed(line, text, cue))
      : studio ? speak('VoiceStudio', { ...line, text }, engine, { cue, seed })
      : speak('OpenAI', directed(line, text, cue), engine)),
    isTransient, `tts ${provider}`);
  const segments = parseSegments(line.text);
  const tempo = studio ? 1 : 1 + (line.speed ?? 0) / 100;
  const pitchOf = (cue?: string) => 1 + ((line.pitch ?? 0) + (studio ? CUES[cue ?? '']?.pitch ?? 0 : 0)) / 100;
  const only = segments.length === 1 && 'text' in segments[0] ? segments[0] : null;
  // One plain piece with nothing to shift: the provider's audio as is.
  if (only && tempo === 1 && pitchOf(only.cue) === 1) return once(only.text, only.cue);
  const parts: Buffer[] = [];
  for (const s of segments) { // sequential: kinder to free-tier limits
    if ('pauseMs' in s) parts.push(Buffer.alloc(Math.round((s.pauseMs / 1000) * SPEECH_RATE) * 2));
    else parts.push(await speechPcm(await once(s.text, s.cue), { pitch: pitchOf(s.cue), tempo }));
  }
  // Padded to whole milliseconds, so the line's span in the joined script adds up exactly.
  const pcm = Buffer.concat(parts);
  const ms = (SPEECH_RATE / 1000) * 2;
  return wrapPcm(Buffer.concat([pcm, Buffer.alloc((ms - (pcm.length % ms)) % ms)]));
}
