import { describe, it, expect } from 'vitest';
import { frameAt, frameCount, FPS, TRANSITION_MS } from '../../shared/timeline';
import type { Timeline } from '../../shared/types';
import { marksFromLines } from '../../shared/marks';

const t: Timeline = {
  durationMs: 4000,
  cues: [
    { startMs: 0, endMs: 100, shape: 'A' },
    { startMs: 100, endMs: 300, shape: 'C' },
    { startMs: 500, endMs: 700, shape: 'D' },
  ],
  lines: [
    { text: 'one', startMs: 100, endMs: 1000, expression: 'happy', gesture: 'wave' },
    { text: 'two', startMs: 2000, endMs: 3000, expression: 'sad', gesture: 'nod' },
  ],
};

describe('frameAt mouth', () => {
  it('returns the cue shape inside a cue', () => {
    expect(frameAt(t, 50).mouth).toBe('A');
    expect(frameAt(t, 100).mouth).toBe('C');
    expect(frameAt(t, 299).mouth).toBe('C');
    expect(frameAt(t, 600).mouth).toBe('D');
  });
  it("returns 'X' between cues and after the end", () => {
    expect(frameAt(t, 400).mouth).toBe('X');
    expect(frameAt(t, 700).mouth).toBe('X');
    expect(frameAt(t, 9999).mouth).toBe('X');
  });
});

describe('frameAt expression', () => {
  it('uses the containing line, else the previous line, else neutral', () => {
    expect(frameAt(t, 50).expression).toBe('neutral');
    expect(frameAt(t, 500).expression).toBe('happy');
    expect(frameAt(t, 1500).expression).toBe('happy');
    expect(frameAt(t, 2500).expression).toBe('sad');
    expect(frameAt(t, 3500).expression).toBe('sad');
  });
});

describe('frameAt expression transition', () => {
  it('morphs from the previous line over TRANSITION_MS, then holds', () => {
    expect(frameAt(t, 100)).toMatchObject({ fromExpression: 'neutral', expression: 'happy', blend: 0 });
    const mid = frameAt(t, 100 + TRANSITION_MS / 2);
    expect(mid.blend).toBeGreaterThan(0);
    expect(mid.blend).toBeLessThan(1);
    expect(frameAt(t, 100 + TRANSITION_MS).blend).toBe(1);
    expect(frameAt(t, 2000)).toMatchObject({ fromExpression: 'happy', expression: 'sad', blend: 0 });
    expect(frameAt(t, 50).blend).toBe(1);
  });
});

describe('idle glance', () => {
  const idle: Timeline = { durationMs: 0, cues: [], lines: [] };
  it('looks to alternating sides between lines and stays ahead while speaking', () => {
    expect(frameAt(idle, 1000).glance).toBe(0);
    expect(frameAt(idle, 5800).glance).toBe(1);
    expect(frameAt(idle, 9000 + 5800).glance).toBe(-1);
    for (let ms = 0; ms < 20000; ms += 50) expect(Math.abs(frameAt(idle, ms).glance!)).toBeLessThanOrEqual(1);
    const long: Timeline = { ...idle, lines: [{ text: 'x', startMs: 0, endMs: 9000, expression: 'neutral', gesture: 'none' }] };
    expect(frameAt(long, 5800).glance).toBe(0);
  });
});

describe('frameAt gesture', () => {
  it('applies only inside its line with progress', () => {
    const f = frameAt(t, 550);
    expect(f.gesture).toBe('wave');
    expect(f.gestureProgress).toBe((550 - 100) / (1000 - 100));
    expect(frameAt(t, 2500).gesture).toBe('nod');
  });
  it("is 'none' outside lines", () => {
    expect(frameAt(t, 50).gesture).toBe('none');
    expect(frameAt(t, 1000).gesture).toBe('none');
    expect(frameAt(t, 1500)).toMatchObject({ gesture: 'none', gestureProgress: 0 });
  });
});

describe('frameAt with marks', () => {
  // Looks the same: blend only matters when the expression changes.
  const look = (f: ReturnType<typeof frameAt>) => (f.fromExpression === f.expression ? { ...f, blend: 1 } : f);
  it('animates exactly as the lines do when the marks come from the lines', () => {
    const marked: Timeline = { ...t, marks: marksFromLines(t.lines) };
    for (let ms = 0; ms <= 4000; ms += 50) expect(look(frameAt(marked, ms))).toEqual(look(frameAt(t, ms)));
  });
  it('follows hand-placed expressions and actions instead of the lines', () => {
    const marked: Timeline = { ...t, marks: { expressions: [{ startMs: 0, expression: 'neutral' }, { startMs: 500, expression: 'angry' }], actions: [{ startMs: 1000, endMs: 3000, gesture: 'shrug' }] } };
    expect(frameAt(marked, 600)).toMatchObject({ expression: 'angry', fromExpression: 'neutral' });
    expect(frameAt(marked, 2000)).toMatchObject({ expression: 'angry', gesture: 'shrug', gestureProgress: 0.5 });
    expect(frameAt(marked, 3500)).toMatchObject({ gesture: 'none', gestureProgress: 0 });
  });
});

describe('frameAt with an expression that ends', () => {
  it('morphs back to the expression before it when it ends', () => {
    const marked: Timeline = { ...t, marks: { expressions: [{ startMs: 0, expression: 'sad' }, { startMs: 500, endMs: 1500, expression: 'angry' }], actions: [] } };
    expect(frameAt(marked, 1000)).toMatchObject({ expression: 'angry', blend: 1 });
    expect(frameAt(marked, 1500)).toMatchObject({ expression: 'sad', fromExpression: 'angry', blend: 0 });
    expect(frameAt(marked, 1500 + TRANSITION_MS)).toMatchObject({ expression: 'sad', blend: 1 });
  });
});

describe('blink', () => {
  it('is deterministic', () => {
    expect(frameAt(t, 3400).blink).toBe(frameAt(t, 3400).blink);
  });
  it('blinks for about 150 ms at uneven intervals, never at the very start', () => {
    const idle: Timeline = { durationMs: 0, cues: [], lines: [] };
    const starts: number[] = [];
    let prev = false;
    for (let ms = 0; ms < 60000; ms += 10) {
      const b = frameAt(idle, ms).blink;
      if (b && !prev) starts.push(ms);
      prev = b;
    }
    expect(frameAt(idle, 0).blink).toBe(false);
    const gaps = starts.slice(1).map((x, i) => x - starts[i]);
    expect(starts.length).toBeGreaterThan(12); // ~one per 3.8 s plus doubles
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(290); // double blinks
    expect(Math.max(...gaps)).toBeLessThanOrEqual(6500);
    expect(new Set(gaps.map((g) => Math.round(g / 100))).size).toBeGreaterThan(5); // not a fixed clock
  });
  it('blinks just after a phrase ends', () => {
    const t2: Timeline = { durationMs: 3000, lines: [], cues: [{ startMs: 1000, endMs: 1400, shape: 'D' }, { startMs: 1400, endMs: 3000, shape: 'X' }] };
    expect(frameAt(t2, 1400 + 100).blink).toBe(true);
  });
});

describe('bob', () => {
  it('stays within [-2, 2]', () => {
    for (let ms = 0; ms < 6000; ms += 37) {
      const b = frameAt(t, ms).bob;
      expect(b).toBeGreaterThanOrEqual(-2);
      expect(b).toBeLessThanOrEqual(2);
    }
    expect(frameAt(t, 750).bob).toBeCloseTo(2);
  });
});

describe('frameCount', () => {
  it('rounds up at 30 fps', () => {
    expect(FPS).toBe(30);
    expect(frameCount(1000)).toBe(30);
    expect(frameCount(1001)).toBe(31);
  });
});

describe('speech motion', () => {
  const talk: Timeline = {
    durationMs: 4000,
    lines: [{ text: 'hi', startMs: 0, endMs: 4000, expression: 'neutral', gesture: 'none' }],
    cues: [
      { startMs: 0, endMs: 1000, shape: 'X' },
      { startMs: 1000, endMs: 1150, shape: 'D' }, // phrase opener: strongest beat
      { startMs: 1150, endMs: 1300, shape: 'B' },
      { startMs: 1300, endMs: 1450, shape: 'C' },
      { startMs: 1450, endMs: 4000, shape: 'X' },
    ],
  };
  it('nods, beats the hands and lifts the brows just after a stressed syllable', () => {
    const at = frameAt(talk, 1080);
    expect(at.nod).toBeGreaterThan(3);
    expect(at.beat).toBeGreaterThan(0.4);
    expect(at.browLift).toBeGreaterThan(0.4);
    expect(at.talk).toBe(1);
    const before = frameAt(talk, 500);
    expect(before).toMatchObject({ nod: 0, beat: 0, browLift: 0, talk: 0 });
  });
  it('settles in pauses but keeps a little sway, and is deterministic', () => {
    const quiet = frameAt(talk, 3000);
    expect(quiet.talk).toBe(0);
    expect(quiet.beat).toBe(0);
    expect(Math.abs(quiet.tilt!)).toBeLessThanOrEqual(0.8);
    expect(frameAt(talk, 1234)).toEqual(frameAt(talk, 1234));
  });
});
