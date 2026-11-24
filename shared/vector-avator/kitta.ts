// Kitta's mapping onto vector-avator: a FrameState (expression, mouth, gesture, blink, ...) becomes a skeleton
// Pose + FaceState. Pure; no canvas. See "version 2 planning/vector-avator-plan.md".
import type { EyeState, FaceState, Expression as VExpression, MouthShape as VMouth } from './core/face';
import { DEFAULT_FACE } from './core/face';
import { composePose } from './core/compose';
import { parseMotion, samplePose, type Motion, type MotionJson } from './core/motion';
import { actionFor } from '../actions';
import { blendPose, type Pose } from './core/pose';
import { smoothstep } from './core/math';
import type { Expression, FrameState, Gesture, MouthShape } from '../types';
import idleJson from './motions/idle.json';
import explainJson from './motions/explain.json';
import pointJson from './motions/point.json';
import thinkJson from './motions/think.json';
import spreadJson from './motions/spread.json';
import nodJson from './motions/nod_surprise.json';
import waveJson from './motions/mb_wave.json';

const load = (j: unknown): Motion => parseMotion(j as MotionJson);
export const MOTIONS = {
  idle: load(idleJson), explain: load(explainJson), point: load(pointJson), think: load(thinkJson),
  spread: load(spreadJson), nod_surprise: load(nodJson), mb_wave: load(waveJson),
} satisfies Record<string, Motion>;

/** Rhubarb mouth shapes → vector-avator's five vowels (plus closed). */
export const MOUTH_MAP: Record<MouthShape, VMouth> = { X: 'sil', A: 'sil', B: 'i', G: 'i', C: 'e', H: 'e', D: 'a', E: 'o', F: 'u' };

export const EXPRESSION_MAP: Record<Expression, VExpression> = {
  happy: 'smile', excited: 'smile', wink: 'smile',
  surprised: 'surprised',
  sad: 'troubled', worried: 'troubled', confused: 'troubled', angry: 'troubled',
  neutral: 'neutral', thinking: 'neutral', sleepy: 'neutral',
};

/** Gesture → motion clip (lookDown is a head pitch instead). `wave` is an AI motion (MotionBricks): licence unchecked. */
export const GESTURE_MOTION: Partial<Record<Gesture, keyof typeof MOTIONS>> = {
  explain: 'explain', point: 'point', think: 'think', shrug: 'spread', celebrate: 'spread', nod: 'nod_surprise', wave: 'mb_wave',
};

const LOOK_DOWN_DEG = 25;
const EDGE = 0.15; // fraction of a gesture spent blending in and out of the idle motion

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function faceFor(frame: FrameState): FaceState {
  const blend = frame.blend ?? 1;
  const shown = frame.fromExpression !== undefined && blend < 0.5 ? frame.fromExpression : frame.expression;
  const eyes: { eye: EyeState; eyeL?: EyeState; eyeR?: EyeState } = { eye: shown === 'sleepy' ? 'half' : 'open' };
  if (shown === 'wink') eyes.eyeR = 'closed';
  if (frame.blink) { eyes.eye = 'closed'; delete eyes.eyeL; delete eyes.eyeR; }
  const ease = frame.gesture === 'lookDown' ? smoothstep(clamp01(Math.min(frame.gestureProgress / EDGE, (1 - frame.gestureProgress) / EDGE))) : 0;
  return {
    ...DEFAULT_FACE,
    ...eyes,
    expression: EXPRESSION_MAP[shown] ?? 'neutral',
    mouth: MOUTH_MAP[frame.mouth] ?? 'sil',
    pitch: -(frame.nod ?? 0) * 0.9 - LOOK_DOWN_DEG * ease,
    roll: frame.tilt ?? 0,
    gazeX: (frame.glance ?? 0) * 10,
  };
}

/** The body pose: the idle motion (offset per actor), blended with a gesture clip while a gesture plays. */
export function poseFor(frame: FrameState, clockMs: number): Pose {
  const seconds = clockMs / 1000;
  const idle = samplePose(MOTIONS.idle, seconds);
  const action = actionFor(frame.gesture);
  const name = GESTURE_MOTION[frame.gesture];
  const motion = action?.motion ?? (name ? MOTIONS[name] : undefined);
  if (!motion || frame.gesture === 'lookDown' || frame.gesture === 'none') return idle;
  const p = clamp01(frame.gestureProgress);
  const edge = action?.play === 'hold' ? 0.16 : EDGE;
  const k = smoothstep(clamp01(Math.min(p / edge, (1 - p) / edge)));
  if (k <= 0) return idle;
  const motionTime = action?.play === 'loop' ? p * ((frame.gestureDurationMs ?? motion.duration * 1000) / 1000) :
    action?.play === 'hold' ? Math.min(1, p / 0.2) * motion.duration : p * motion.duration;
  const gesture = samplePose(action?.play === 'loop' ? motion : { ...motion, loop: false }, motionTime);
  const mixed = blendPose(idle, gesture, k);
  const hands = (k >= 0.5 ? gesture : idle).hands;
  return { ...mixed, ...(hands ? { hands } : {}), ...(gesture.squash !== undefined ? { squash: 1 + (gesture.squash - 1) * k } : {}) };
}

/** clockMs is the actor's idle clock (time + idleOffsetMs): it moves the idle motion, so two actors don't move in step. */
export function poseAndFace(frame: FrameState, clockMs: number): { pose: Pose; face: FaceState } {
  const face = faceFor(frame);
  return { pose: composePose(poseFor(frame, clockMs), face), face };
}
