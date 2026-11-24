import { describe, it, expect } from 'vitest';
import { EXPRESSION_MAP, GESTURE_MOTION, MOUTH_MAP, MOTIONS, faceFor, poseFor } from '../../shared/vector-avator/kitta';
import { EXPRESSIONS, type FrameState, type MouthShape } from '../../shared/types';
import { parseAction, registerActions } from '../../shared/actions';
import { blendPose } from '../../shared/vector-avator/core/pose';
import { samplePose } from '../../shared/vector-avator/core/motion';
import { smoothstep } from '../../shared/vector-avator/core/math';

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

  it('supports once, loop and hold action playback over a block', () => {
    const make = (name: string, play: 'once' | 'loop' | 'hold') => parseAction({ name, label: name, duration: 1, play, keys: [
      { t: 0, bones: { head: [0, 0, 0] } }, { t: 1, bones: { head: [90, 0, 0] } },
    ] });
    registerActions([make('test-once', 'once'), make('test-loop', 'loop'), make('test-hold', 'hold')]);
    const once = poseFor(frame({ gesture: 'test-once', gestureProgress: .5 }), 0);
    const loop = poseFor(frame({ gesture: 'test-loop', gestureProgress: .75, gestureDurationMs: 4000 }), 0);
    const hold = poseFor(frame({ gesture: 'test-hold', gestureProgress: .5 }), 0);
    expect(once.bones.head).not.toEqual(loop.bones.head);
    expect(hold.bones.head).not.toEqual(once.bones.head);
    expect(hold.bones.head).not.toEqual(loop.bones.head);
  });

  it('keeps every legacy action equal to main at several progress and block lengths', () => {
    const legacy = Object.keys(GESTURE_MOTION) as (keyof typeof GESTURE_MOTION)[];
    for (const gesture of legacy) for (const blockMs of [500, 1500, 6000]) for (const progress of [.1, .5, .9]) {
      const frameAtProgress = frame({ gesture, gestureProgress: progress, gestureDurationMs: blockMs });
      const actual = poseFor(frameAtProgress, 0);
      const name = GESTURE_MOTION[gesture];
      if (!name) continue; // lookDown is a head-only action and has no body clip on main.
      const motion = MOTIONS[name];
      const k = smoothstep(Math.max(0, Math.min(1, Math.min(progress / .15, (1 - progress) / .15))));
      const expectedGesture = samplePose(motion, progress * motion.duration);
      const expected = blendPose(samplePose(MOTIONS.idle, 0), expectedGesture, k);
      for (const bone of Object.keys(expected.bones)) actual.bones[bone].forEach((value, i) => expect(value).toBeCloseTo(expected.bones[bone][i], 12));
      actual.hips.forEach((value, i) => expect(value).toBeCloseTo(expected.hips[i], 12));
    }
  });
});
