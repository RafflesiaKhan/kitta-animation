import type { ActionMark, AnyCharacter, CharacterConfig, Expression, Gesture, Line, MouthCue, Timeline } from './types';
import { EXPRESSIONS, GESTURES } from './types';
import { addAction, addExpression, marksFromLines } from './marks';

// A scene is hand-written source (actors, lines, shots, listener reactions) resolved against the built audio into a
// Scene: each actor owns a normal Timeline, so the existing character drawing and frameAt work per actor unchanged.

export const STAGE_W = 1920, STAGE_H = 1080;

export interface LineMoment { line: number; at: number } // `at` is 0..1 through that line
export interface SceneActorSource { id: string; character: CharacterConfig | { artId: string }; voice: string; speaker?: string; x: number; scale: number; flip?: boolean; idleOffsetMs: number }
export interface SceneLineSource { actor: string; text: string; expression: Expression; gesture: Gesture }
export interface ShotSource extends LineMoment { name: string; zoom: number; focusX: number; focusY: number } // focus is 0..1 of the stage
export interface ReactionSource extends LineMoment { actor: string; expression?: Expression; gesture?: ActionMark['gesture'] }
export interface SceneSource { title: string; background: string; actors: SceneActorSource[]; lines: SceneLineSource[]; shots: ShotSource[]; reactions: ReactionSource[] }

export interface SceneActor { id: string; character: AnyCharacter; x: number; scale: number; flip?: boolean; idleOffsetMs: number; timeline: Timeline }
export interface Shot { startMs: number; name: string; zoom: number; focusX: number; focusY: number }
export interface Scene { title: string; audioId: string; durationMs: number; background: string; actors: SceneActor[]; shots: Shot[] } // background is a data URI

const validLine = (source: SceneSource, line: number) => Number.isInteger(line) && line >= 0 && line < source.lines.length;
const validAt = (at: number) => at >= 0 && at <= 1;

export function sceneProblems(source: SceneSource): string[] {
  const out: string[] = [];
  if (!source.lines.length) out.push('The scene has no lines');
  const ids = new Set(source.actors.map((a) => a.id));
  source.lines.forEach((l, i) => { if (!ids.has(l.actor)) out.push(`Line ${i + 1}: unknown actor "${l.actor}"`);
    if (!EXPRESSIONS.includes(l.expression)) out.push(`Line ${i + 1}: unknown expression "${l.expression}"`);
    if (!GESTURES.includes(l.gesture)) out.push(`Line ${i + 1}: unknown gesture "${l.gesture}"`);
  });
  source.shots.forEach((s) => {
    if (!validLine(source, s.line)) out.push(`Shot "${s.name}": no line ${s.line}`);
    if (!validAt(s.at)) out.push(`Shot "${s.name}": at must be 0..1`);
    if (!(s.zoom >= 1)) out.push(`Shot "${s.name}": zoom must be at least 1`);
  });
  if (!source.shots.length) out.push('The scene has no shots');
  else {
    const first = source.shots.reduce((a, b) => (b.line < a.line || (b.line === a.line && b.at < a.at) ? b : a));
    if (first.line !== 0 || first.at !== 0) out.push('The first shot must start at line 0, at 0');
  }
  source.reactions.forEach((r, i) => {
    if (!ids.has(r.actor)) out.push(`Reaction ${i + 1}: unknown actor "${r.actor}"`);
    if (!validLine(source, r.line)) out.push(`Reaction ${i + 1}: no line ${r.line}`);
    if (!validAt(r.at)) out.push(`Reaction ${i + 1}: at must be 0..1`);
    if (r.expression && !EXPRESSIONS.includes(r.expression)) out.push(`Reaction ${i + 1}: unknown expression "${r.expression}"`);
    if (r.gesture && (r.gesture === ('none' as string) || !GESTURES.includes(r.gesture))) out.push(`Reaction ${i + 1}: unknown gesture "${r.gesture}"`);
  });
  return out;
}

type Built = { audioId: string; durationMs: number; spans: { startMs: number; endMs: number }[]; cues: MouthCue[]; background: string; characters: Record<string, AnyCharacter> };

/** `built.characters` is keyed by actor id. */
export function resolveScene(source: SceneSource, built: Built): Scene {
  const momentMs = ({ line, at }: LineMoment) => built.spans[line].startMs + at * (built.spans[line].endMs - built.spans[line].startMs);

  const actors = source.actors.map((a): SceneActor => {
    const own = source.lines.flatMap((l, i) => (l.actor === a.id ? [{ l, span: built.spans[i] }] : []));
    const lines: Line[] = own.map(({ l, span }) => ({ text: l.text, startMs: span.startMs, endMs: span.endMs, expression: l.expression, gesture: l.gesture }));
    const cues = own.flatMap(({ span }) =>
      built.cues
        .filter((c) => c.startMs < span.endMs && c.endMs > span.startMs)
        .map((c) => ({ ...c, startMs: Math.max(c.startMs, span.startMs), endMs: Math.min(c.endMs, span.endMs) })));
    let marks = marksFromLines(lines);
    for (const r of source.reactions) {
      if (r.actor !== a.id) continue;
      const ms = momentMs(r);
      if (r.expression) marks = addExpression(marks, ms, r.expression);
      if (r.gesture) marks = addAction(marks, ms, r.gesture, built.durationMs) ?? marks;
    }
    return { id: a.id, character: built.characters[a.id], x: a.x, scale: a.scale, flip: a.flip, idleOffsetMs: a.idleOffsetMs, timeline: { durationMs: built.durationMs, cues, lines, marks } };
  });

  const shots = source.shots
    .map((s): Shot => ({ startMs: momentMs(s), name: s.name, zoom: s.zoom, focusX: s.focusX, focusY: s.focusY }))
    .sort((a, b) => a.startMs - b.startMs);

  return { title: source.title, audioId: built.audioId, durationMs: built.durationMs, background: built.background, actors, shots };
}

const aim = (focus: number, size: number, zoom: number) => Math.max(size - size * zoom, Math.min(0, size / 2 - focus * size * zoom)) || 0;

/** The shot showing at ms (the first one before any has started), as a zoom and an offset kept inside the set. */
export function cameraAt(scene: Scene, ms: number): { zoom: number; x: number; y: number; name: string } {
  const shot = [...scene.shots].reverse().find((s) => s.startMs <= ms) ?? scene.shots[0];
  return { zoom: shot.zoom, x: aim(shot.focusX, STAGE_W, shot.zoom), y: aim(shot.focusY, STAGE_H, shot.zoom), name: shot.name };
}
