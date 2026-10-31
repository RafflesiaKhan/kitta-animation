import type { ActionMark, Expression, Line, Marks, Timeline } from './types';

// The Animate step's hand-placed animation. Every edit is pure and keeps the invariants frameAt relies on:
// expressions sorted with the first at 0 (the character always has one), an expression's end (if any) no later than the
// next one's start, actions sorted and never overlapping.

export const ACTION_MS = 2000; // length of a newly placed action
export const MIN_ACTION_MS = 500;
export const MIN_EXPRESSION_MS = 500;

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

/** The expression showing at ms: the latest one started that hasn't ended, else the one before it, and so on. */
export function expressionAt(m: Marks, ms: number): Expression {
  for (let j = m.expressions.length - 1; j >= 0; j--) {
    const e = m.expressions[j];
    if (e.startMs <= ms && (e.endMs === undefined || ms < e.endMs)) return e.expression;
  }
  return 'neutral';
}

/** When the showing expression last changed at or before ms (a start or an end), for the morph between them. */
export function lastExpressionChange(m: Marks, ms: number): number {
  let at = 0;
  for (const e of m.expressions) {
    if (e.startMs > ms) break;
    at = Math.max(at, e.startMs, e.endMs !== undefined && e.endMs <= ms ? e.endMs : 0);
  }
  return at;
}

/** Starts an expression at ms, holding until the next one; one it lands inside is cut there (same start: swapped). */
export function addExpression(m: Marks, ms: number, expression: Expression): Marks {
  const at = Math.max(0, Math.round(ms));
  const same = m.expressions.find((e) => e.startMs === at);
  const rest = m.expressions.filter((e) => e !== same).map((e) => {
    if (e.startMs >= at || e.endMs === undefined || e.endMs <= at) return e;
    const { endMs: _cut, ...held } = e;
    return held;
  });
  const expressions = [...rest, { ...same, startMs: at, expression }].sort((a, b) => a.startMs - b.startMs);
  return { ...m, expressions };
}

/** Moves an expression (and its end, keeping its length) between its neighbours. */
export function moveExpression(m: Marks, i: number, ms: number, durationMs = Infinity): Marks {
  if (i <= 0 || i >= m.expressions.length) return m;
  const e = m.expressions[i], prev = m.expressions[i - 1];
  const len = e.endMs === undefined ? undefined : e.endMs - e.startMs;
  const lo = prev.endMs ?? prev.startMs + 1;
  const hi = len === undefined ? (m.expressions[i + 1]?.startMs ?? Infinity) - 1 : Math.min(m.expressions[i + 1]?.startMs ?? durationMs, durationMs) - len;
  const startMs = clamp(Math.round(ms), lo, Math.max(lo, hi));
  const moved = len === undefined ? { ...e, startMs } : { ...e, startMs, endMs: startMs + len };
  return { ...m, expressions: m.expressions.map((x, j) => (j === i ? moved : x)) };
}

/**
 * Sets when an expression ends (the one before it shows again), at least MIN_EXPRESSION_MS after its start. Stretched
 * up to the next expression or the end of the audio, it holds again. The first expression always holds.
 */
export function resizeExpression(m: Marks, i: number, endMs: number, durationMs: number): Marks {
  if (i <= 0 || i >= m.expressions.length) return m;
  const e = m.expressions[i];
  const hi = Math.min(m.expressions[i + 1]?.startMs ?? durationMs, durationMs);
  const end = Math.max(Math.round(endMs), e.startMs + MIN_EXPRESSION_MS);
  const { endMs: _old, ...held } = e;
  const next = end >= hi ? held : { ...held, endMs: end };
  return { ...m, expressions: m.expressions.map((x, j) => (j === i ? next : x)) };
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
