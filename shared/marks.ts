import type { ActionMark, Expression, Line, Marks, Timeline } from './types';

// The Animate step's hand-placed animation. Every edit is pure and keeps the invariants frameAt relies on:
// expressions sorted with the first at 0 (the character always has one), actions sorted and never overlapping.

export const ACTION_MS = 2000; // length of a newly placed action
export const MIN_ACTION_MS = 500;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The animation the lines already describe: neutral until the first line, each line's expression from its start, each gesture over its line. */
export function marksFromLines(lines: Line[]): Marks {
  const expressions = lines.map((l) => ({ startMs: l.startMs, expression: l.expression }));
  if (!expressions.length || expressions[0].startMs > 0) expressions.unshift({ startMs: 0, expression: 'neutral' });
  const actions = lines.flatMap((l) => (l.gesture === 'none' ? [] : [{ startMs: l.startMs, endMs: l.endMs, gesture: l.gesture }]));
  return { expressions, actions };
}

const derived = new WeakMap<Timeline, Marks>();

/** The marks that drive a timeline: its own, else the ones its lines describe. */
export function marksOf(t: Timeline): Marks {
  if (t.marks) return t.marks;
  let m = derived.get(t);
  if (!m) derived.set(t, (m = marksFromLines(t.lines)));
  return m;
}

export function addExpression(m: Marks, ms: number, expression: Expression): Marks {
  const at = Math.max(0, Math.round(ms));
  const rest = m.expressions.filter((e) => e.startMs !== at);
  const expressions = [...rest, { startMs: at, expression }].sort((a, b) => a.startMs - b.startMs);
  return { ...m, expressions };
}

export function moveExpression(m: Marks, i: number, ms: number): Marks {
  if (i <= 0 || i >= m.expressions.length) return m;
  const next = m.expressions[i + 1]?.startMs ?? Infinity;
  const startMs = clamp(Math.round(ms), m.expressions[i - 1].startMs + 1, next - 1);
  return { ...m, expressions: m.expressions.map((e, j) => (j === i ? { ...e, startMs } : e)) };
}

export function removeExpression(m: Marks, i: number): Marks {
  if (i <= 0 || i >= m.expressions.length) return m;
  return { ...m, expressions: m.expressions.filter((_, j) => j !== i) };
}

/** Places an action at ms, ACTION_MS long or up to the next clip / the end; null when there is less than MIN_ACTION_MS of room. */
export function addAction(m: Marks, ms: number, gesture: ActionMark['gesture'], durationMs: number): Marks | null {
  const startMs = Math.max(0, Math.round(ms));
  if (m.actions.some((a) => startMs >= a.startMs && startMs < a.endMs)) return null;
  const next = m.actions.find((a) => a.startMs > startMs)?.startMs ?? durationMs;
  const endMs = Math.min(startMs + ACTION_MS, next, durationMs);
  if (endMs - startMs < MIN_ACTION_MS) return null;
  const actions = [...m.actions, { startMs, endMs, gesture }].sort((a, b) => a.startMs - b.startMs);
  return { ...m, actions };
}

/** Moves an action to start at ms, keeping its length, between its neighbours and inside the audio. */
export function moveAction(m: Marks, i: number, ms: number, durationMs: number): Marks {
  const a = m.actions[i];
  if (!a) return m;
  const len = a.endMs - a.startMs;
  const lo = m.actions[i - 1]?.endMs ?? 0;
  const hi = (m.actions[i + 1]?.startMs ?? durationMs) - len;
  const startMs = clamp(Math.round(ms), lo, Math.max(lo, hi));
  return { ...m, actions: m.actions.map((x, j) => (j === i ? { ...x, startMs, endMs: startMs + len } : x)) };
}

/** Moves an action's end, keeping it at least MIN_ACTION_MS long and short of the next clip / the end. */
export function resizeAction(m: Marks, i: number, endMs: number, durationMs: number): Marks {
  const a = m.actions[i];
  if (!a) return m;
  const hi = m.actions[i + 1]?.startMs ?? durationMs;
  const end = clamp(Math.round(endMs), Math.min(a.startMs + MIN_ACTION_MS, hi), hi);
  return { ...m, actions: m.actions.map((x, j) => (j === i ? { ...x, endMs: end } : x)) };
}

export function removeAction(m: Marks, i: number): Marks {
  return { ...m, actions: m.actions.filter((_, j) => j !== i) };
}
