import { EXPRESSIONS, GESTURES } from '../shared/types';
import type { CharacterConfig, ExportFormat, Timeline } from '../shared/types';
import { MAX_AUDIO_MS } from './audio';

const SHAPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];
const CHARACTER_KEYS = ['starter', 'skin', 'hairStyle', 'hairColor', 'eyeStyle', 'outfit', 'outfitColor'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Returns the typed export request, or null when the body is malformed. */
export function validateExport(body: unknown): { character: CharacterConfig; timeline: Timeline; format: ExportFormat } | null {
  if (!isObj(body)) return null;
  const { character, timeline, format } = body;
  if (!isObj(character) || !CHARACTER_KEYS.every((k) => typeof character[k] === 'string')) return null;
  if (!isObj(format) || (format.aspect !== '16:9' && format.aspect !== '9:16') || typeof format.transparent !== 'boolean') return null;
  if (!isObj(timeline) || !num(timeline.durationMs) || timeline.durationMs <= 0 || timeline.durationMs > MAX_AUDIO_MS) return null;
  const { cues, lines } = timeline;
  if (!Array.isArray(cues) || !Array.isArray(lines)) return null;
  const sorted = (a: { startMs: number }[]) => a.every((x, i) => i === 0 || a[i - 1].startMs <= x.startMs);
  const cuesOk = cues.every((c) => isObj(c) && num(c.startMs) && num(c.endMs) && SHAPES.includes(c.shape as string));
  const linesOk = lines.every((l) => isObj(l) && num(l.startMs) && num(l.endMs) && EXPRESSIONS.includes(l.expression as never) && GESTURES.includes(l.gesture as never));
  if (!cuesOk || !linesOk || !sorted(cues as never) || !sorted(lines as never)) return null;
  return {
    character: character as unknown as CharacterConfig,
    timeline: timeline as unknown as Timeline,
    format: { aspect: format.aspect, transparent: format.transparent },
  };
}
