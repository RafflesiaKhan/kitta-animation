import { describe, it, expect } from 'vitest';
import { validateExport } from '../../server/validate';
import { STARTERS } from '../../shared/character/starters';

const { name: _n, ...character } = STARTERS.kit;
const format = { aspect: '16:9', transparent: false };
const marks = {
  expressions: [{ startMs: 0, expression: 'neutral' }, { startMs: 300, expression: 'happy' }],
  actions: [{ startMs: 0, endMs: 500, gesture: 'wave' }, { startMs: 500, endMs: 1000, gesture: 'nod' }],
};
const withMarks = (m: unknown) => ({ character, format, timeline: { durationMs: 1000, cues: [], lines: [], marks: m } });

describe('validateExport marks', () => {
  it('accepts well-formed marks and keeps them', () => {
    expect(validateExport(withMarks(marks))?.timeline.marks).toEqual(marks);
    expect(validateExport({ character, format, timeline: { durationMs: 1000, cues: [], lines: [] } })).not.toBeNull();
  });
  it.each([
    ['unknown expression', { ...marks, expressions: [{ startMs: 0, expression: 'smug' }] }],
    ['first expression not at 0', { ...marks, expressions: [{ startMs: 100, expression: 'happy' }] }],
    ['unsorted expressions', { ...marks, expressions: [{ startMs: 0, expression: 'happy' }, { startMs: 500, expression: 'sad' }, { startMs: 400, expression: 'sad' }] }],
    ['gesture none', { ...marks, actions: [{ startMs: 0, endMs: 500, gesture: 'none' }] }],
    ['unknown gesture', { ...marks, actions: [{ startMs: 0, endMs: 500, gesture: 'dance' }] }],
    ['overlapping actions', { ...marks, actions: [{ startMs: 0, endMs: 600, gesture: 'wave' }, { startMs: 500, endMs: 900, gesture: 'nod' }] }],
    ['empty clip', { ...marks, actions: [{ startMs: 500, endMs: 500, gesture: 'wave' }] }],
    ['clip past the end', { ...marks, actions: [{ startMs: 500, endMs: 1200, gesture: 'wave' }] }],
    ['not an object', 'x'],
  ])('rejects %s', (_label, m) => {
    expect(validateExport(withMarks(m))).toBeNull();
  });
});
