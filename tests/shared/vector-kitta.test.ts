import { describe, it, expect } from 'vitest';
import { EXPRESSION_MAP, GESTURE_MOTION, MOUTH_MAP, MOTIONS, faceFor, poseFor } from '../../shared/vector-avator/kitta';
import { EXPRESSIONS, type FrameState, type MouthShape } from '../../shared/types';

const frame = (o: Partial<FrameState> = {}): FrameState => ({
  expression: 'neutral', mouth: 'X', gesture: 'none', gestureProgress: 0, blink: false, bob: 0, ...o,
});

describe('Kitta → vector-avator mapping', () => {
  it('maps every Rhubarb mouth shape to the planned vowel', () => {
    const want: Record<MouthShape, string> = { X: 'sil', A: 'sil', B: 'i', G: 'i', C: 'e', H: 'e', D: 'a', E: 'o', F: 'u' };
    expect(MOUTH_MAP).toEqual(want);
  });

  it('maps every expression as planned', () => {
    expect(Object.keys(EXPRESSION_MAP).sort()).toEqual([...EXPRESSIONS].sort());
    for (const e of ['happy', 'excited', 'wink'] as const) expect(EXPRESSION_MAP[e]).toBe('smile');
    expect(EXPRESSION_MAP.surprised).toBe('surprised');
    for (const e of ['sad', 'worried', 'confused', 'angry'] as const) expect(EXPRESSION_MAP[e]).toBe('troubled');
    for (const e of ['neutral', 'thinking', 'sleepy'] as const) expect(EXPRESSION_MAP[e]).toBe('neutral');
  });

  it('wink closes the right eye, sleepy half-closes both, a blink closes both', () => {
    expect(faceFor(frame({ expression: 'wink' })).eyeR).toBe('closed');
    expect(faceFor(frame({ expression: 'sleepy' })).eye).toBe('half');
    const blinking = faceFor(frame({ expression: 'wink', blink: true }));
    expect(blinking.eye).toBe('closed');
    expect(blinking.eyeR).toBeUndefined();
  });

  it('takes the mouth from the frame', () => {
    expect(faceFor(frame({ mouth: 'D' })).mouth).toBe('a');
    expect(faceFor(frame({ mouth: 'F' })).mouth).toBe('u');
  });

  it('lookDown pitches the head down, in the middle of the gesture only', () => {
    expect(faceFor(frame({ gesture: 'lookDown', gestureProgress: 0.5 })).pitch).toBeLessThan(0);
    expect(faceFor(frame({ gesture: 'lookDown', gestureProgress: 0 })).pitch).toBeCloseTo(0);
  });

  it('maps gestures to the planned motion clips', () => {
    expect(GESTURE_MOTION).toMatchObject({
      explain: 'explain', point: 'point', think: 'think', shrug: 'spread', celebrate: 'spread', nod: 'nod_surprise', wave: 'mb_wave',
    });
    for (const name of Object.values(GESTURE_MOTION)) expect(MOTIONS[name!]).toBeDefined();
  });

  it('offsets the idle motion by the clock', () => {
    const a = JSON.stringify(poseFor(frame(), 0));
    const b = JSON.stringify(poseFor(frame(), 1900));
    expect(a).not.toBe(b);
  });
});
