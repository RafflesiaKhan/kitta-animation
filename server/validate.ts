import { EXPRESSIONS, GESTURES } from '../shared/types';
import type { AnyCharacter, ArtCharacter, ExportFormat, Timeline } from '../shared/types';
import { MAX_AUDIO_MS } from './audio';

const SHAPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHARACTER_KEYS = ['starter', 'skin', 'hairStyle', 'hairColor', 'eyeStyle', 'outfit', 'outfitColor'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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
  return {
    character: art ? ({ kind: 'art', id: character.id, name: '', prompt: '', style: '', images: {} } as ArtCharacter) : (character as unknown as AnyCharacter),
    timeline: timeline as unknown as Timeline,
    format: { aspect: format.aspect, transparent: format.transparent },
  };
}
