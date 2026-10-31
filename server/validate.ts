import { EXPRESSIONS, GESTURES } from '../shared/types';
import type { AnyCharacter, ArtCharacter, ExportFormat, ScriptLineInput, Timeline } from '../shared/types';
import { LANGUAGES, PITCH_RANGE, SPEED_RANGE } from '../shared/voices';
import { MAX_AUDIO_MS } from './audio';

const SHAPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHARACTER_KEYS = ['starter', 'skin', 'hairStyle', 'hairColor', 'eyeStyle', 'outfit', 'outfitColor'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Hand-placed animation: expressions sorted from 0; actions sorted, non-empty, not overlapping, inside the audio. */
function validMarks(marks: unknown, durationMs: number): boolean {
  if (!isObj(marks) || !Array.isArray(marks.expressions) || !Array.isArray(marks.actions)) return false;
  const ex = marks.expressions as Record<string, unknown>[];
  const ac = marks.actions as Record<string, unknown>[];
  const exOk = ex.length > 0 && ex[0]?.startMs === 0 && ex.every((e, i) => isObj(e) && num(e.startMs) && EXPRESSIONS.includes(e.expression as never) && (i === 0 || (ex[i - 1].startMs as number) < e.startMs));
  const acOk = ac.every((a, i) => isObj(a) && num(a.startMs) && num(a.endMs) && a.gesture !== 'none' && GESTURES.includes(a.gesture as never) &&
    a.startMs >= (i === 0 ? 0 : (ac[i - 1].endMs as number)) && a.endMs > a.startMs && a.endMs <= durationMs);
  return exOk && acOk;
}

/** Returns the typed export request, or null when the body is malformed. */
// An AI character only needs its id here; the route loads the rest from the library.
export function validateExport(body: unknown): { character: AnyCharacter; timeline: Timeline; format: ExportFormat } | null {
  if (!isObj(body)) return null;
  const { character, timeline, format } = body;
  const art = isObj(character) && character.kind === 'art';
  if (!isObj(character) || (art ? typeof character.id !== 'string' || !UUID_RE.test(character.id) : !CHARACTER_KEYS.every((k) => typeof character[k] === 'string'))) return null;
  if (!isObj(format) || (format.aspect !== '16:9' && format.aspect !== '9:16') || typeof format.transparent !== 'boolean') return null;
  if (!isObj(timeline) || !num(timeline.durationMs) || timeline.durationMs <= 0 || timeline.durationMs > MAX_AUDIO_MS) return null;
  const { cues, lines } = timeline;
  if (!Array.isArray(cues) || !Array.isArray(lines)) return null;
  const sorted = (a: { startMs: number }[]) => a.every((x, i) => i === 0 || a[i - 1].startMs <= x.startMs);
  const cuesOk = cues.every((c) => isObj(c) && num(c.startMs) && num(c.endMs) && SHAPES.includes(c.shape as string));
  const linesOk = lines.every((l) => isObj(l) && num(l.startMs) && num(l.endMs) && EXPRESSIONS.includes(l.expression as never) && GESTURES.includes(l.gesture as never));
  if (!cuesOk || !linesOk || !sorted(cues as never) || !sorted(lines as never)) return null;
  if (timeline.marks !== undefined && !validMarks(timeline.marks, timeline.durationMs)) return null;
  return {
    character: art ? ({ kind: 'art', id: character.id, name: '', prompt: '', style: '', images: {} } as ArtCharacter) : (character as unknown as AnyCharacter),
    timeline: timeline as unknown as Timeline,
    format: { aspect: format.aspect, transparent: format.transparent },
  };
}

const inRange = (v: unknown, r: number) => v === undefined || (num(v) && Math.abs(v) <= r);

/** One script line for speech: its text, voice and tags, plus the optional voice controls within their ranges. */
export function validScriptLine(l: unknown): l is ScriptLineInput {
  return isObj(l) && typeof l.text === 'string' && l.text.length <= 500 && typeof l.voice === 'string' && l.voice.length > 0 && l.voice.length <= 100 &&
    EXPRESSIONS.includes(l.expression as never) && GESTURES.includes(l.gesture as never) &&
    (l.note === undefined || (typeof l.note === 'string' && l.note.length <= 200)) &&
    (l.language === undefined || LANGUAGES.some((x) => x.id === l.language)) &&
    (l.style === undefined || l.style === 'normal' || l.style === 'whisper') &&
    (l.variability === undefined || l.variability === 'steady' || l.variability === 'varied') &&
    inRange(l.pitch, PITCH_RANGE) && inRange(l.speed, SPEED_RANGE);
}
