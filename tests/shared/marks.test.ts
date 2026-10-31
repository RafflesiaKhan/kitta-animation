import { describe, it, expect } from 'vitest';
import { addAction, addExpression, expressionAt, marksFromLines, marksOf, moveAction, moveExpression, removeAction, removeExpression, resizeAction, resizeExpression } from '../../shared/marks';
import type { Line, Marks, Timeline } from '../../shared/types';

const lines: Line[] = [
  { text: 'one', startMs: 100, endMs: 1000, expression: 'happy', gesture: 'wave' },
  { text: 'two', startMs: 2000, endMs: 3000, expression: 'sad', gesture: 'nod' },
];
const m = marksFromLines(lines);

describe('marksFromLines', () => {
  it('starts neutral, then each line\'s expression; each gesture becomes a clip over its line', () => {
    expect(m.expressions).toEqual([{ startMs: 0, expression: 'neutral' }, { startMs: 100, expression: 'happy' }, { startMs: 2000, expression: 'sad' }]);
    expect(m.actions).toEqual([{ startMs: 100, endMs: 1000, gesture: 'wave' }, { startMs: 2000, endMs: 3000, gesture: 'nod' }]);
  });
  it('adds no extra neutral when the first line starts at 0, and no clip for gesture none', () => {
    const r = marksFromLines([{ text: '', startMs: 0, endMs: 500, expression: 'sad', gesture: 'none' }]);
    expect(r).toEqual({ expressions: [{ startMs: 0, expression: 'sad' }], actions: [] });
    expect(marksFromLines([])).toEqual({ expressions: [{ startMs: 0, expression: 'neutral' }], actions: [] });
  });
  it('marksOf prefers the timeline\'s own marks', () => {
    const own: Marks = { expressions: [{ startMs: 0, expression: 'angry' }], actions: [] };
    const t: Timeline = { durationMs: 4000, cues: [], lines };
    expect(marksOf(t)).toEqual(m);
    expect(marksOf({ ...t, marks: own })).toBe(own);
  });
});

describe('expression edits', () => {
  it('adds sorted, or replaces the one starting at the same time', () => {
    expect(addExpression(m, 1500, 'angry').expressions.map((e) => e.startMs)).toEqual([0, 100, 1500, 2000]);
    expect(addExpression(m, 100, 'angry').expressions[1]).toEqual({ startMs: 100, expression: 'angry' });
  });
  it('moves between its neighbours; the first one never moves or goes', () => {
    expect(moveExpression(m, 1, 5000).expressions[1].startMs).toBe(1999);
    expect(moveExpression(m, 1, -50).expressions[1].startMs).toBe(1);
    expect(moveExpression(m, 0, 300)).toBe(m);
    expect(removeExpression(m, 0)).toBe(m);
    expect(removeExpression(m, 2).expressions).toHaveLength(2);
  });
});

describe('action edits', () => {
  const free: Marks = { expressions: m.expressions, actions: [{ startMs: 5000, endMs: 6000, gesture: 'wave' }] };
  it('adds a 2 s clip in free space, cut short by the next clip or the end', () => {
    expect(addAction(free, 1000, 'shrug', 10000)!.actions[0]).toEqual({ startMs: 1000, endMs: 3000, gesture: 'shrug' });
    expect(addAction(free, 4200, 'shrug', 10000)!.actions[0]).toEqual({ startMs: 4200, endMs: 5000, gesture: 'shrug' });
    expect(addAction({ ...free, actions: [] }, 600, 'point', 1200)!.actions[0]).toEqual({ startMs: 600, endMs: 1200, gesture: 'point' });
  });
  it('adds nothing with under 0.5 s of room or inside a clip', () => {
    expect(addAction(free, 4600, 'shrug', 10000)).toBeNull();
    expect(addAction(free, 5500, 'shrug', 10000)).toBeNull();
    expect(addAction(free, 9800, 'shrug', 10000)).toBeNull();
  });
  it('moves keeping its length, stopping at neighbours and the ends', () => {
    expect(moveAction(m, 0, 1500, 4000).actions[0]).toEqual({ startMs: 1100, endMs: 2000, gesture: 'wave' });
    expect(moveAction(m, 0, -300, 4000).actions[0]).toMatchObject({ startMs: 0, endMs: 900 });
    expect(moveAction(m, 1, 3900, 4000).actions[1]).toMatchObject({ startMs: 3000, endMs: 4000 });
  });
  it('resizes from 0.5 s up to the next clip or the end; removes', () => {
    expect(resizeAction(m, 0, 150, 4000).actions[0].endMs).toBe(600);
    expect(resizeAction(m, 0, 2500, 4000).actions[0].endMs).toBe(2000);
    expect(resizeAction(m, 1, 9000, 4000).actions[1].endMs).toBe(4000);
    expect(removeAction(m, 0).actions).toEqual([m.actions[1]]);
  });
});

describe('expression length', () => {
  // neutral from 0, angry from 1000 to 2000, then happy from 3000.
  const ended: Marks = { expressions: [{ startMs: 0, expression: 'neutral' }, { startMs: 1000, endMs: 2000, expression: 'angry' }, { startMs: 3000, expression: 'happy' }], actions: [] };
  it('goes back to the expression before it once it ends, and the next one still picks up', () => {
    expect(expressionAt(ended, 1500)).toBe('angry');
    expect(expressionAt(ended, 2500)).toBe('neutral');
    expect(expressionAt(ended, 3500)).toBe('happy');
    const nested: Marks = { ...ended, expressions: [{ startMs: 0, expression: 'neutral' }, { startMs: 500, expression: 'sad' }, { startMs: 1000, endMs: 2000, expression: 'angry' }] };
    expect(expressionAt(nested, 2500)).toBe('sad');
  });
  it('stretches its end up to the next one; reaching it (or the end of the audio) makes it hold again', () => {
    expect(resizeExpression(m, 1, 1200, 4000).expressions[1]).toEqual({ startMs: 100, endMs: 1200, expression: 'happy' });
    expect(resizeExpression(m, 1, 200, 4000).expressions[1].endMs).toBe(600); // at least half a second
    expect(resizeExpression(m, 1, 2500, 4000).expressions[1].endMs).toBeUndefined(); // reached sad at 2000
    expect(resizeExpression(m, 2, 9000, 4000).expressions[2].endMs).toBeUndefined();
    expect(resizeExpression(m, 0, 500, 4000)).toBe(m); // the first one always holds
  });
  it('moves keeping its length, staying clear of its neighbours', () => {
    expect(moveExpression(ended, 1, 1800, 4000).expressions[1]).toEqual({ startMs: 1800, endMs: 2800, expression: 'angry' });
    expect(moveExpression(ended, 1, 2900, 4000).expressions[1]).toEqual({ startMs: 2000, endMs: 3000, expression: 'angry' });
  });
  it('a new expression dropped inside an ended one cuts it there', () => {
    expect(addExpression(ended, 1500, 'sad').expressions.slice(1, 3)).toEqual([{ startMs: 1000, expression: 'angry' }, { startMs: 1500, expression: 'sad' }]);
    expect(addExpression(ended, 1000, 'sad').expressions[1]).toEqual({ startMs: 1000, endMs: 2000, expression: 'sad' }); // same start: swapped, length kept
  });
});
