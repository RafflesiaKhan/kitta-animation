import type { Expression } from '../types';

// Expression library: every expression is a preset of face parameters, not a
// separate drawing. Character mixes two presets to animate the change from one
// expression to the next, so adding an expression is one entry here.

export interface BrowParams { raise: number; inner: number; outer: number; arch: number }
/** lift > 0 turns the mouth corners up (smile), < 0 down (frown); ws/hs scale width/height; round 0..1 puckers. */
export interface MouthMood { lift: number; ws: number; hs: number; round: number }
export interface FaceParams {
  browL: BrowParams; // viewer's left
  browR: BrowParams;
  eyeScale: number; // 1 = normal size
  lidL: number; // upper lid, 0 open .. 1 shut
  lidR: number;
  squint: number; // lower-lid smile squint, 0 none .. 1 "^^" eyes
  lookX: number; // pupil offset, -1 (left) .. 1 (right)
  lookY: number; // -1 (up) .. 1 (down)
  blush: number; // 0 .. 1 extra cheek colour
  mouth: MouthMood;
  // Body language
  energy: number; // scales nods, sway and hand beats: 0.4 sleepy .. 1.6 excited
  tilt: number; // resting head tilt in degrees (+ = towards the viewer's right)
  slump: number; // head/shoulder drop in px (+ = slumped, - = lifted)
  clasp: number; // 0..1 hands drawn together in front (worried)
}

const brow = (raise: number, inner: number, outer: number, arch: number): BrowParams => ({ raise, inner, outer, arch });
const BASE: FaceParams = {
  browL: brow(0, 0, 0, 6), browR: brow(0, 0, 0, 6), eyeScale: 1, lidL: 0, lidR: 0, squint: 0,
  lookX: 0, lookY: 0, blush: 0, mouth: { lift: 0, ws: 1, hs: 1, round: 0 },
  energy: 1, tilt: 0, slump: 0, clasp: 0,
};
const face = (p: Partial<FaceParams> & { brow?: BrowParams }): FaceParams => {
  const { brow: b, ...rest } = p;
  return { ...BASE, ...(b ? { browL: b, browR: b } : {}), ...rest };
};

export const FACES: Record<Expression, FaceParams> = {
  neutral: BASE,
  happy: face({ brow: brow(10, 0, 2, 12), squint: 1, blush: 0.3, mouth: { lift: 18, ws: 1.1, hs: 1, round: 0 }, energy: 1.2, tilt: 2, slump: -4 }),
  sad: face({ brow: brow(0, -18, 8, 0), lidL: 0.25, lidR: 0.25, lookY: 0.5, mouth: { lift: -16, ws: 0.95, hs: 0.9, round: 0 }, energy: 0.5, tilt: -3, slump: 12 }),
  surprised: face({ brow: brow(26, 0, 0, 14), eyeScale: 1.2, mouth: { lift: 0, ws: 0.75, hs: 1.4, round: 0.5 }, energy: 1.1, slump: -8 }),
  angry: face({ brow: brow(-8, 18, -10, 0), lidL: 0.3, lidR: 0.3, mouth: { lift: -4, ws: 1.15, hs: 0.7, round: 0 }, energy: 1.35, slump: 4 }),
  excited: face({ brow: brow(20, 0, 4, 14), eyeScale: 1.12, blush: 0.8, mouth: { lift: 22, ws: 1.2, hs: 1.25, round: 0 }, energy: 1.6, slump: -6 }),
  thinking: face({ browL: brow(16, 0, 0, 10), browR: brow(-4, 6, -2, 2), lookX: 0.6, lookY: -0.7, mouth: { lift: -4, ws: 0.8, hs: 0.8, round: 0.3 }, energy: 0.7, tilt: 6 }),
  confused: face({ browL: brow(18, -4, 4, 8), browR: brow(-6, 10, -6, 0), lidR: 0.15, lookX: -0.3, mouth: { lift: -8, ws: 0.9, hs: 0.8, round: 0.1 }, energy: 0.9, tilt: -9 }),
  worried: face({ brow: brow(8, -20, 6, 2), lidL: 0.1, lidR: 0.1, lookX: -0.3, mouth: { lift: -10, ws: 0.85, hs: 0.9, round: 0.2 }, energy: 0.8, tilt: -2, slump: 5, clasp: 1 }),
  wink: face({ browL: brow(10, 0, 2, 12), browR: brow(0, 6, 0, 4), lidR: 1, blush: 0.4, mouth: { lift: 16, ws: 1.05, hs: 1, round: 0 }, energy: 1.1, tilt: 5 }),
  sleepy: face({ brow: brow(-2, -4, 2, 2), lidL: 0.6, lidR: 0.6, lookY: 0.3, mouth: { lift: -2, ws: 0.8, hs: 0.8, round: 0.3 }, energy: 0.4, tilt: 4, slump: 9 }),
};

/** Words used to steer the TTS delivery for each expression ("Say in a … tone"). */
export const TONES: Record<Expression, string> = {
  neutral: 'neutral', happy: 'happy', sad: 'sad', surprised: 'surprised', angry: 'angry',
  excited: 'excited', thinking: 'thoughtful', confused: 'puzzled', worried: 'worried', wink: 'playful', sleepy: 'sleepy',
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mixRecord<T extends object>(a: T, b: T, t: number): T {
  const out = {} as Record<string, number>;
  for (const k of Object.keys(a)) out[k] = lerp((a as Record<string, number>)[k], (b as Record<string, number>)[k], t);
  return out as T;
}

/** Face part-way from preset a to preset b; t = 0 is a, 1 is b. */
export function mixFaces(a: FaceParams, b: FaceParams, t: number): FaceParams {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    browL: mixRecord(a.browL, b.browL, t), browR: mixRecord(a.browR, b.browR, t),
    eyeScale: lerp(a.eyeScale, b.eyeScale, t), lidL: lerp(a.lidL, b.lidL, t), lidR: lerp(a.lidR, b.lidR, t),
    squint: lerp(a.squint, b.squint, t), lookX: lerp(a.lookX, b.lookX, t), lookY: lerp(a.lookY, b.lookY, t),
    blush: lerp(a.blush, b.blush, t), mouth: mixRecord(a.mouth, b.mouth, t),
    energy: lerp(a.energy, b.energy, t), tilt: lerp(a.tilt, b.tilt, t), slump: lerp(a.slump, b.slump, t), clasp: lerp(a.clasp, b.clasp, t),
  };
}
