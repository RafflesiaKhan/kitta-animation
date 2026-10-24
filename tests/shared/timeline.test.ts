import { describe, it, expect } from 'vitest';
import { frameAt, frameCount, FPS, TRANSITION_MS } from '../../shared/timeline';
import type { Timeline } from '../../shared/types';

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

describe('blink', () => {
  it('is deterministic', () => {
    expect(frameAt(t, 3400).blink).toBe(frameAt(t, 3400).blink);
  });
  it('is true for 150ms in every 3500ms window starting at 3350', () => {
    for (const base of [0, 3500, 7000]) {
      expect(frameAt(t, base + 3349).blink).toBe(false);
      expect(frameAt(t, base + 3350).blink).toBe(true);
      expect(frameAt(t, base + 3499).blink).toBe(true);
      expect(frameAt(t, base + 3500).blink).toBe(false);
    }
    expect(frameAt(t, 0).blink).toBe(false);
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
