import type { FrameState } from './types';
import type { RigClip, RigKey, RigPart, RigPose, RigProportions, RigShape, RigTransform, SvgRigAction, SvgRigCharacter, SvgRigExpression, SvgRigGesture, SvgRigPack, SvgRigView } from './svg-rig';
import { SVG_RIG_ACTIONS, SVG_RIG_GESTURES } from './svg-rig';

// The deterministic pose evaluator (plan §4 "Composition rules"): from one FrameState — which is a pure function of
// scene time — it layers root, body action, expression, blink, gesture, speech and idle motion into a matrix per part.
// No clocks, no randomness: the same frame always draws the same picture, in the preview and the export.

export type Matrix = [number, number, number, number, number, number];
export interface PlacedPart { id: string; matrix: Matrix; /** Scales only this part's own shapes (body proportions). */ shapeScale: [number, number]; shapes: RigShape[] }

const mul = ([a, b, c, d, e, f]: Matrix, [g, h, i, j, k, l]: Matrix): Matrix =>
  [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
const local = (x: number, y: number, deg: number, sx: number, sy: number): Matrix => {
  const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  return [cos * sx, sin * sx, -sin * sy, cos * sy, x, y];
};

/** Adds two transforms: offsets and rotation add, scales multiply, the later variant wins. */
export function combine(a: RigTransform = {}, b: RigTransform = {}): RigTransform {
  const out: RigTransform = {};
  for (const k of ['x', 'y', 'rotate'] as const) if (a[k] !== undefined || b[k] !== undefined) out[k] = (a[k] ?? 0) + (b[k] ?? 0);
  for (const k of ['scaleX', 'scaleY'] as const) if (a[k] !== undefined || b[k] !== undefined) out[k] = (a[k] ?? 1) * (b[k] ?? 1);
  const variant = b.variant ?? a.variant;
  if (variant) out.variant = variant;
  return out;
}

/** A transform weighted toward rest (0 = none of it, 1 = all of it). */
function weigh(t: RigTransform, w: number): RigTransform {
  const out: RigTransform = {};
  for (const k of ['x', 'y', 'rotate'] as const) if (t[k] !== undefined) out[k] = t[k]! * w;
  for (const k of ['scaleX', 'scaleY'] as const) if (t[k] !== undefined) out[k] = 1 + (t[k]! - 1) * w;
  if (t.variant && w >= 0.5) out.variant = t.variant;
  return out;
}

const smooth = (u: number) => u * u * (3 - 2 * u);

/** One channel of a clip at progress 0..1: eased between keys; a variant switches halfway between two keys. */
export function sampleKeys(keys: RigKey[], p: number): RigTransform {
  const t = Math.min(1, Math.max(0, p));
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].at <= t) i++;
  const a = keys[i], b = keys[i + 1] ?? a;
  const u = b.at > a.at ? smooth((t - a.at) / (b.at - a.at)) : 1;
  const out: RigTransform = {};
  for (const k of ['x', 'y', 'rotate'] as const) if (a[k] !== undefined || b[k] !== undefined) out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * u;
  for (const k of ['scaleX', 'scaleY'] as const) if (a[k] !== undefined || b[k] !== undefined) out[k] = (a[k] ?? 1) + ((b[k] ?? 1) - (a[k] ?? 1)) * u;
  const variant = u < 0.5 ? a.variant : b.variant;
  if (variant) out.variant = variant;
  return out;
}

export function sampleClip(c: RigClip, p: number): RigPose {
  return Object.fromEntries(c.tracks.map((t) => [t.part, sampleKeys(t.keys, p)]));
}

/** What a frame's gesture plays on this rig: today's Animate names map onto the rig's catalog. */
const LEGACY: Record<string, { gesture?: SvgRigGesture; action?: SvgRigAction }> = {
  wave: { gesture: 'wave' }, nod: { gesture: 'nod' }, lookDown: { action: 'bow' }, celebrate: { action: 'celebrate' },
  shrug: { gesture: 'shrug' }, think: { gesture: 'think' }, point: { gesture: 'point-right' }, explain: { gesture: 'explain' },
  starterWalk: { action: 'walk' },
};
export function rigMotionFor(name: string): { gesture?: SvgRigGesture; action?: SvgRigAction } {
  if (LEGACY[name]) return LEGACY[name];
  if ((SVG_RIG_GESTURES as readonly string[]).includes(name)) return { gesture: name as SvgRigGesture };
  if ((SVG_RIG_ACTIONS as readonly string[]).includes(name)) return { action: name as SvgRigAction };
  return {};
}

/** Progress through a clip: looping clips run whole cycles across the mark's duration. */
function clipProgress(c: RigClip, progress: number, durationMs?: number): number {
  if (!c.loop) return progress;
  const cycles = Math.max(1, Math.round((durationMs ?? c.durationMs) / c.durationMs));
  const p = progress * cycles;
  return p >= cycles ? 1 : p % 1;
}

const ARM = /^(arm|forearm|hand)-/;
const clampScale = (v: number | undefined) => Math.min(1.25, Math.max(0.8, v ?? 1));

/** Every part placed for this frame, in draw order. */
export function poseRig(pack: SvgRigPack, character: Pick<SvgRigCharacter, 'view' | 'proportions'>, frame: FrameState, intensity = 1): PlacedPart[] {
  const view = pack.views[character.view ?? 'front'] ?? pack.views.front;
  const pose = performancePose(pack, view, frame, intensity);
  return placeParts(view, pose, character.proportions);
}

/** The frame as one transform per part (before proportions). */
export function performancePose(pack: SvgRigPack, view: SvgRigView, frame: FrameState, intensity = 1): RigPose {
  const ids = new Set(view.parts.map((p) => p.id));
  const expr = (name: string) => view.expressions[name as SvgRigExpression] ?? view.expressions.neutral ?? {};
  const blend = frame.fromExpression !== undefined && frame.blend !== undefined ? Math.min(1, Math.max(0, frame.blend)) : 1;
  let pose: RigPose = {};
  const add = (p: RigPose, replaceArms = false) => {
    for (const [id, t] of Object.entries(p)) {
      if (!ids.has(id)) continue;
      pose[id] = replaceArms && ARM.test(id) ? combine(stripRest(pose[id]), t) : combine(pose[id], t);
    }
  };
  // body action first (idle when nothing plays), then the gesture, which owns the arm channels it moves
  const motion = rigMotionFor(frame.gesture);
  const time = frame.timeMs ?? 0;
  const action = motion.action ? pack.actions[motion.action] : undefined;
  if (action) add(sampleClip(action, clipProgress(action, frame.gestureProgress, frame.gestureDurationMs)));
  else add(sampleClip(pack.actions.idle, (time % pack.actions.idle.durationMs) / pack.actions.idle.durationMs));
  // expression: the change animates from the previous face
  const face: RigPose = {};
  for (const [name, w] of [[frame.fromExpression, 1 - blend], [frame.expression, blend]] as const) {
    if (!name || w <= 0) continue;
    for (const [id, t] of Object.entries(expr(name))) face[id] = combine(face[id], weigh(t, w * intensity));
  }
  add(face);
  if (frame.blink) add(view.blink);
  const gesture = motion.gesture ? pack.gestures[motion.gesture] : undefined;
  if (gesture) add(sampleClip(gesture, clipProgress(gesture, frame.gestureProgress, frame.gestureDurationMs)), true);
  // speech owns the mouth's aperture while talking; silent, the expression's mouth shows
  if (view.mouthPart && ids.has(view.mouthPart)) {
    const speaking = frame.mouth !== 'X';
    const variant = speaking ? frame.mouth : pose[view.mouthPart]?.variant ?? 'X';
    pose[view.mouthPart] = { ...pose[view.mouthPart], variant };
  }
  // natural motion from the timeline (all optional)
  const extra: RigPose = {
    body: { y: frame.bob ?? 0, x: frame.sway ?? 0 },
    head: { y: (frame.nod ?? 0) * 1.5, rotate: frame.tilt ?? 0 },
  };
  if (frame.glance) {
    if (ids.has('pupil-left') || ids.has('pupil-right')) { extra['pupil-left'] = { x: frame.glance * 8 }; extra['pupil-right'] = { x: frame.glance * 8 }; }
    else extra.head = combine(extra.head, { x: frame.glance * 5 });
  }
  if (frame.browLift) { extra['brow-left'] = { y: -6 * frame.browLift }; extra['brow-right'] = { y: -6 * frame.browLift }; }
  add(extra);
  return pose;
}

/** The arm channel without its idle sway, so a gesture fully owns it. */
const stripRest = (t?: RigTransform): RigTransform => (t?.variant ? { variant: t.variant } : {});

/** World matrices from the hierarchy; proportions scale segments locally and move descendants' joints with them. */
export function placeParts(view: SvgRigView, pose: RigPose, proportions: RigProportions = {}): PlacedPart[] {
  const torso = clampScale(proportions.torsoWidth), head = clampScale(proportions.headScale);
  const arm = clampScale(proportions.armLength), leg = clampScale(proportions.legLength);
  const byId = new Map(view.parts.map((p) => [p.id, p]));
  // longer legs lift the hips by exactly the added knee-to-ankle length, so the feet stay on the ground
  const lift = ((byId.get('shin-left')?.y ?? 0) + (byId.get('foot-left')?.y ?? 0)) * (leg - 1);
  const world = new Map<string, Matrix>();
  const seg = (p: RigPart): { joint: [number, number]; own: [number, number]; scale: number } => {
    const id = p.id;
    if (/^(arm|forearm)-/.test(id)) return { joint: /^forearm-/.test(id) ? [arm, arm] : [torso, 1], own: [1, arm], scale: 1 };
    if (/^hand-/.test(id)) return { joint: [arm, arm], own: [1, 1], scale: 1 };
    if (/^(leg|shin)-/.test(id)) return { joint: /^shin-/.test(id) ? [leg, leg] : [torso, 1], own: [1, leg], scale: 1 };
    if (/^foot-/.test(id)) return { joint: [leg, leg], own: [1, 1], scale: 1 };
    if (id === 'head') return { joint: [1, 1], own: [1, 1], scale: head };
    if (p.parent === null || id === 'torso') return { joint: [1, 1], own: [torso, 1], scale: 1 };
    return { joint: [1, 1], own: [1, 1], scale: 1 };
  };
  const matrixOf = (p: RigPart, seen: Set<string>): Matrix => {
    const cached = world.get(p.id);
    if (cached) return cached;
    if (seen.has(p.id)) return [1, 0, 0, 1, 0, 0];
    seen.add(p.id);
    const t = pose[p.id] ?? {};
    const s = seg(p);
    const x = p.x * s.joint[0] + (t.x ?? 0), y = p.y * s.joint[1] + (t.y ?? 0) - (p.parent === null ? lift : 0);
    const m = local(x, y, t.rotate ?? 0, (t.scaleX ?? 1) * s.scale, (t.scaleY ?? 1) * s.scale);
    const parent = p.parent ? byId.get(p.parent) : undefined;
    const out = parent ? mul(matrixOf(parent, seen), m) : m;
    world.set(p.id, out);
    return out;
  };
  return view.parts.map((p) => {
    const variant = pose[p.id]?.variant;
    // a closed eye drawing replaces the whole eye, so its pupil hides
    const hidden = !!p.parent && pose[p.parent]?.variant === 'closed';
    return { id: p.id, matrix: matrixOf(p, new Set()), shapeScale: seg(p).own, shapes: hidden ? [] : (variant && p.variants?.[variant]) || p.shapes };
  });
}

/** The square part of the canvas a framing shows: the whole figure, or head to waist. */
export function rigViewBox(view: Pick<SvgRigView, 'waistY' | 'groundY'>, framing: 'waist' | 'full' = 'waist'): [number, number, number, number] {
  if (framing === 'full') { const s = Math.max(1000, view.groundY + 30); return [500 - s / 2, view.groundY + 30 - s, s, s]; }
  const s = Math.min(1000, view.waistY + 70);
  return [500 - s / 2, 0, s, s];
}
