import { describe, it, expect } from 'vitest';
import { keywordMatch, marksFromDirections, pauseMsOf, prepareLine, splitScript, type Match } from '../../shared/direction';

const EXAMPLE = `**Title: The Little Robot Who Wanted to Dream**

[expression: warm smile] [action: waves hand gently] Have you ever wondered what happens when a robot starts dreaming? [expression: curious, raised eyebrows] Well, let me tell you a little story. [action: leans forward slightly] Once upon a time, in a city filled with brilliant machines, there lived a tiny robot named Milo. [expression: excited] [action: opens hands enthusiastically] Milo could solve a thousand problems in a second, but there was one thing he couldn't understand. [expression: thoughtful] [action: tilts head slightly] Why do humans dream? [action: pauses for two seconds] [expression: curious] One night, Milo decided to switch off his calculations and simply watch the stars. [action: points towards the sky] And for the very first time, he imagined something that wasn't in his programming. [expression: surprised, eyes widening] He imagined himself flying among the stars! [action: spreads arms joyfully] [expression: delighted] And that's when Milo discovered something beautiful. [action: places hand over heart] [expression: sincere and thoughtful] Sometimes, the greatest discoveries don't begin with answers. [action: pauses briefly] They begin with a little curiosity. [expression: warm, hopeful smile] [action: looks directly at the audience]`;

describe('pauseMsOf', () => {
  it('reads the length in digits or words, else half a second, at most 10 s', () => {
    expect(pauseMsOf('pauses for two seconds')).toBe(2000);
    expect(pauseMsOf('pause 1.5s')).toBe(1500);
    expect(pauseMsOf('pause for 500 ms')).toBe(500);
    expect(pauseMsOf('pauses for a second')).toBe(1000);
    expect(pauseMsOf('pauses briefly')).toBe(500);
    expect(pauseMsOf('pauses for 20 seconds')).toBe(10000);
    expect(pauseMsOf('waves hand gently')).toBeNull();
  });
});

describe('prepareLine', () => {
  it('takes the directions out of what is spoken, keeps voice cues, and turns pauses into silence', () => {
    const p = prepareLine('[action: pauses for two seconds] [expression: curious] One night, Milo [whisper]decided[/whisper] to rest.');
    expect(p.spoken).not.toMatch(/expression|action/);
    expect(p.spoken).toContain('[pause 2s]');
    expect(p.spoken).toContain('[whisper]decided[/whisper]');
    expect(p.tags).toEqual([{ kind: 'expression', phrase: 'curious', at: 0 }]);
  });
  it('places a tag by how far into the spoken words it sits', () => {
    const p = prepareLine('[expression: happy] Hello there [action: waves] my friend');
    expect(p.tags[0]).toEqual({ kind: 'expression', phrase: 'happy', at: 0 });
    expect(p.tags[1].at).toBeCloseTo('Hello there'.length / 'Hello there my friend'.length, 1);
    expect(prepareLine('All done. [expression: happy]').tags[0].at).toBe(1);
  });
});

describe('splitScript', () => {
  const lines = splitScript(EXAMPLE);
  it('makes one line per sentence, with its directions in front, and the title as its own line', () => {
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe('Title: The Little Robot Who Wanted to Dream');
    expect(lines[1]).toMatch(/^\[expression: warm smile\] \[action: waves hand gently\] Have you ever/);
    expect(lines[6]).toMatch(/^\[action: pauses for two seconds\] \[expression: curious\] One night/);
    expect(lines[11]).toMatch(/curiosity\. \[expression: warm, hopeful smile\] \[action: looks directly at the audience\]$/);
  });
  it('merges short sentences to stay within 50 lines of at most 500 characters', () => {
    const many = splitScript(Array.from({ length: 60 }, (_, i) => `Line ${i}.`).join(' '));
    expect(many.length).toBeLessThanOrEqual(50);
    expect(many.join(' ')).toBe(Array.from({ length: 60 }, (_, i) => `Line ${i}.`).join(' '));
    const long = splitScript(`${'word '.repeat(150)}end.`);
    expect(long.every((l) => l.length <= 500)).toBe(true);
  });
});

describe('keywordMatch', () => {
  it.each([
    ['expression', 'warm smile', 'happy'], ['expression', 'curious, raised eyebrows', 'thinking'], ['expression', 'delighted', 'excited'],
    ['expression', 'surprised, eyes widening', 'surprised'], ['expression', 'sincere and thoughtful', 'thinking'], ['expression', 'bored', null],
    ['action', 'waves hand gently', 'wave'], ['action', 'points towards the sky', 'point'], ['action', 'opens hands enthusiastically', 'explain'],
    ['action', 'spreads arms joyfully', 'celebrate'], ['action', 'tilts head slightly', 'think'], ['action', 'leans forward slightly', null],
    ['action', 'places hand over heart', null],
  ] as const)('%s "%s" → %s', (kind, phrase, out) => {
    expect(keywordMatch({ kind, phrase })).toBe(out);
  });
});

describe('marksFromDirections', () => {
  const m = new Map<string, Match>([['expression:happy', 'happy'], ['action:waves', 'wave'], ['expression:sad', 'sad'], ['action:leans', null], ['action:points', 'point']]);
  it('places directions at line starts, by position inside a line, and at the next line for trailing ones', () => {
    const marks = marksFromDirections([
      { startMs: 0, endMs: 1000, tags: [{ kind: 'expression', phrase: 'Happy', at: 0 }, { kind: 'action', phrase: 'waves', at: 0.5 }, { kind: 'expression', phrase: 'sad', at: 1 }] },
      { startMs: 1250, endMs: 3000, tags: [{ kind: 'action', phrase: 'leans', at: 0 }, { kind: 'action', phrase: 'points', at: 1 }] },
    ], m, 3000);
    expect(marks.expressions).toEqual([{ startMs: 0, expression: 'happy' }, { startMs: 1250, expression: 'sad' }]);
    expect(marks.actions).toEqual([{ startMs: 500, endMs: 2500, gesture: 'wave' }]); // point at the very end: no room
  });
  it('starts neutral until the first expression', () => {
    expect(marksFromDirections([{ startMs: 200, endMs: 900, tags: [{ kind: 'expression', phrase: 'sad', at: 0 }] }], m, 900).expressions)
      .toEqual([{ startMs: 0, expression: 'neutral' }, { startMs: 200, expression: 'sad' }]);
  });
});
