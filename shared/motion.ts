import type { MouthShape, Timeline } from './types';

// Natural performance, derived from the lip-sync cues alone so it works for every voice source (Gemini, OpenAI,
// VoiceStudio, uploads). Everything is a pure function of (timeline, ms), so preview and export stay identical.
//
// - beats: stressed-syllable onsets (open mouth shapes, strongest at the start of a phrase). They drive small
//   head nods, hand "beat" gestures and, for phrase openers, a brow lift.
// - phrase ends: where speech stops for a while. People tend to blink there, so we add a blink.
// - talk level: 1 while speaking, easing to 0 in pauses; scales head sway and talking hands.

export interface Beat { ms: number; strength: number }
export interface Speech { beats: Beat[]; phraseEnds: number[]; spans: { startMs: number; endMs: number }[] }

const QUIET = new Set<MouthShape>(['X', 'A']);
const OPEN_WEIGHT: Partial<Record<MouthShape, number>> = { D: 1, C: 0.75, H: 0.6, E: 0.5 };
const SPAN_GAP_MS = 250; // silence shorter than this stays inside one talking span
const PHRASE_PAUSE_MS = 350; // silence at least this long ends a phrase
const MIN_BEAT_GAP_MS = 280;

const cache = new WeakMap<Timeline, Speech>();

export function analyzeSpeech(t: Timeline): Speech {
  const hit = cache.get(t);
  if (hit) return hit;
  const spans: Speech['spans'] = [];
  for (const c of t.cues) {
    if (QUIET.has(c.shape)) continue;
    const last = spans[spans.length - 1];
    if (last && c.startMs - last.endMs < SPAN_GAP_MS) last.endMs = Math.max(last.endMs, c.endMs);
    else spans.push({ startMs: c.startMs, endMs: c.endMs });
  }
  const phraseEnds = spans.filter((s, i) => (spans[i + 1]?.startMs ?? Infinity) - s.endMs >= PHRASE_PAUSE_MS).map((s) => s.endMs);

  const beats: Beat[] = [];
  let span = 0;
  let firstInSpan = true;
  for (const c of t.cues) {
    while (span < spans.length && spans[span].endMs < c.startMs) { span++; firstInSpan = true; }
    const w = OPEN_WEIGHT[c.shape];
    if (!w) continue;
    const strength = Math.min(1, w * (firstInSpan ? 1 : 0.65) * Math.min(1, (c.endMs - c.startMs) / 110));
    firstInSpan = false;
    const prev = beats[beats.length - 1];
    if (prev && c.startMs - prev.ms < MIN_BEAT_GAP_MS) {
      if (strength > prev.strength) beats[beats.length - 1] = { ms: c.startMs, strength };
    } else if (strength >= 0.3) beats.push({ ms: c.startMs, strength });
  }
  const out = { beats, phraseEnds, spans };
  cache.set(t, out);
  return out;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
/** Quick rise (first quarter), slow fall: the shape of a nod or a beat gesture. 0 outside [0, 1). */
const pulse = (x: number) => (x < 0 || x >= 1 ? 0 : x < 0.25 ? smooth(x / 0.25) : 1 - smooth((x - 0.25) / 0.75));

/** Index of the first item with key >= v (items sorted ascending by key). */
function lowerBound<T>(items: T[], v: number, key: (x: T) => number): number {
  let lo = 0, hi = items.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (key(items[mid]) < v) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Sum of beat pulses of the given width at ms (beats at least minStrength), capped at 1. */
export function beatLevel(s: Speech, ms: number, widthMs: number, minStrength = 0): number {
  let sum = 0;
  for (let i = lowerBound(s.beats, ms - widthMs, (b) => b.ms); i < s.beats.length && s.beats[i].ms <= ms; i++) {
    const b = s.beats[i];
    if (b.strength >= minStrength) sum += b.strength * pulse((ms - b.ms) / widthMs);
  }
  return Math.min(1, sum);
}

/** 1 while talking, easing in and out over 150 ms at span edges. */
export function talkLevel(s: Speech, ms: number): number {
  const i = lowerBound(s.spans, ms - 150, (x) => x.endMs);
  const span = s.spans[i];
  if (!span || ms < span.startMs - 150) return 0;
  if (ms < span.startMs) return smooth(1 - (span.startMs - ms) / 150);
  if (ms <= span.endMs) return 1;
  return smooth(1 - (ms - span.endMs) / 150);
}

// ---------- blinks ----------
const BLINK_MS = 150;
const BLINK_SLOT_MS = 3800;

/** Deterministic 0..1 hash of an integer. */
export function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * Natural blinking: one blink somewhere in every 3.8 s slot (so gaps vary from ~1.5 to ~6 s), an occasional double
 * blink, and a blink just after each phrase ends.
 */
export function blinkAt(s: Speech | null, ms: number): boolean {
  const slot = Math.floor(ms / BLINK_SLOT_MS);
  const start = slot * BLINK_SLOT_MS + 300 + hash01(slot) * 2600;
  if (ms >= start && ms < start + BLINK_MS) return true;
  if (hash01(slot * 7 + 3) < 0.15 && ms >= start + 300 && ms < start + 300 + BLINK_MS) return true; // double blink
  if (s) {
    const i = lowerBound(s.phraseEnds, ms - 60 - BLINK_MS, (x) => x);
    const end = s.phraseEnds[i];
    if (end !== undefined && ms >= end + 60 && ms < end + 60 + BLINK_MS) return true;
  }
  return false;
}

/** Slow, organic drift: a sum of two sines with unrelated periods, about -1..1. */
export const drift = (ms: number, a: number, b: number, phase = 0) =>
  (Math.sin((2 * Math.PI * ms) / a + phase) * 0.65 + Math.sin((2 * Math.PI * ms) / b + phase * 2.3) * 0.35);
