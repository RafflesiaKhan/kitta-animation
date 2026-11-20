// Head turn for method V, Live2D style (docs/vector-parts.md §3.5; ideas from method D,
// docs/character-pipeline.md rules C-G and L).
//
// One front drawing is deformed instead of only being slid layer by layer:
// - Facial features are rigid pieces. Their centre rides a sphere of the face radius and the
//   piece only squeezes horizontally (rule E: no fisheye inside a part). The iris rolls inside
//   the eye white (rule F) and the mouth stays under the nose (rule C).
// - Hair and the face outline are soft shells: every path point moves by
//   parallax * R * sin(yaw) * rim(u) * dome(v). rim(u) = (1-u^2)^2 is 0 with zero slope on the
//   rim of the whole head (rules D and L: the silhouette stays, the turning side compresses,
//   the trailing side widens); dome(v) lets the crown move less than the face (a sphere).
// - Layers behind the head (negative parallax: back hair) slide the other way as a whole.
// - Ears and tails on the head (spring chains) are attached at their root: they follow the
//   head there as rigid pieces and narrow on the turning side / widen on the other.
// - Everything also shifts a little toward the turn (the head is in front of the neck).
import type { Pt } from "./vdata";

/** Tunables of the head turn (vector.json "headTurn", all optional). */
export interface HeadTurn {
  /** scale of the face sphere for the turn (x skeleton.head_radius); > 1 when the face is
   *  drawn smaller than the head it sits on (a face patch in a ball of fur) */
  radius: number;
  /** exponent of the rim falloff of the face turn (cos^n; >= 1) */
  rimFalloff: number;
  /** whole-head shift toward the turn at 90 deg, in head radii */
  shift: number;
  /** how much of the yaw displacement remains on the crown (0..1) */
  domeFloor: number;
  /** iris roll inside the eye white, in eye widths per sin(yaw) */
  irisRoll: number;
  /** the pupil sits in front of the iris (on the cornea bulge): it moves this many times
   *  further than the iris when the eye rolls, which reads as a turning eyeball */
  pupilDepth: number;
  /** foreshortening of the iris/pupil when they roll (0 = none, 1 = cos of the roll angle) */
  irisSqueeze: number;
  /** narrowing of the ear on the turning side (and widening on the other) per sin(yaw) */
  earSqueeze: number;
  /** how much the ear roots close in on the head centre (1 = like points on the side of a
   *  turning cylinder: offset x cos(yaw)) */
  earIn: number;
  /** slide of the inner shapes of an ear toward the turn, in ear widths per sin(yaw) */
  earInner: number;
  /** extra depth of the nose (it sticks out of the face) */
  noseDepth: number;
  /** gain of the up/down (pitch) displacement of all layers */
  pitchGain: number;
}

export const DEFAULT_HEAD_TURN: HeadTurn = {
  radius: 1, rimFalloff: 1, shift: 0.08, domeFloor: 0.35, irisRoll: 0.2, pupilDepth: 1.35, irisSqueeze: 1, earSqueeze: 0.3, earIn: 1, earInner: 0.08, noseDepth: 1.1, pitchGain: 1,
};

export interface HeadFrame {
  c: Pt;          // head centre (drawing px, rest)
  r: [number, number];
  yaw: number;    // radians, + = the character turns to its left (screen right)
  pitch: number;  // radians, + = looks up
  /** rim of the whole head around c: half width, height above c, height below c (px) */
  reach?: [number, number, number];
  turn?: Partial<HeadTurn>;
}

/** Displacement of the layer centre in head radii per sin(yaw); + = toward the turn. */
export const DEFAULT_PARALLAX: Record<string, number> = {
  hair_back: -0.1, ear: -0.04, head: 0.45, feature: 0.75, hair_side: 0.65, hair_front: 0.85,
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const turnOf = (h: HeadFrame): HeadTurn => ({ ...DEFAULT_HEAD_TURN, ...(h.turn ?? {}) });
const reachOf = (h: HeadFrame): [number, number, number] => h.reach ?? [h.r[0], h.r[1], h.r[1]];

export function layerPhi(p: number, yaw: number): number {
  return Math.asin(clamp(p * Math.sin(yaw), -1, 1));
}

/** 1 at the centre, 0 with zero slope at |u| >= 1 (outlines crossing the rim never kink). */
export function rimWeight(u: number): number {
  const c = clamp(u, -1, 1);
  return (1 - c * c) * (1 - c * c);
}

/** Row weight of the yaw displacement: 1 from the head centre down (the jaw is a cylinder),
 *  falling to `floor` at the crown (v = -1, the top of a sphere hardly moves). */
export function domeWeight(v: number, floor: number): number {
  if (v >= 0) return 1;
  const c = Math.max(-1, v);
  return floor + (1 - floor) * (1 - c * c);
}

/** Face radii used for the turn (px). */
export function faceRadius(h: HeadFrame): [number, number] {
  const k = turnOf(h).radius;
  return [h.r[0] * k, h.r[1] * k];
}

/** Whole-head shift (px) toward the turn / the look. */
export function headShift(h: HeadFrame): Pt {
  const t = turnOf(h);
  const r = faceRadius(h);
  return [t.shift * r[0] * Math.sin(h.yaw), -t.shift * r[1] * Math.sin(h.pitch) * t.pitchGain];
}

/** Displacement of a point on the face (without the whole-head shift): each row turns on the
 *  face sphere by phi * cos(theta)^rimFalloff, so the centre turns fully and the rim of the
 *  face stays (method D's shell). Used point by point for the face outline (layer "head") and
 *  through featurePlace for the rigid features, so features never cross the face outline. */
export function faceDisp(h: HeadFrame, p: number, q: Pt): Pt {
  const t = turnOf(h);
  const [R, Ry] = faceRadius(h);
  const u = (q[0] - h.c[0]) / R, v = (q[1] - h.c[1]) / Ry;
  const uc = clamp(u, -1, 1), vc = clamp(v, -1, 1);
  const th = Math.asin(uc);
  const phi = layerPhi(p, h.yaw) * domeWeight(v, t.domeFloor);
  const dx = R * (Math.sin(th + phi * Math.pow(Math.cos(th), t.rimFalloff)) - uc);
  const ay = clamp(-p * Ry * Math.sin(h.pitch) * t.pitchGain, -0.5 * Ry, 0.5 * Ry);
  return [dx, ay * (1 - uc * uc) * (1 - vc * vc) * (1 - vc * vc)];
}

/** Displacement of a point of a hair layer (without the whole-head shift): a soft shell whose
 *  rim is the rim of the whole head; layers behind the head (p < 0) slide as a whole. */
export function shellDisp(h: HeadFrame, p: number, q: Pt): Pt {
  const t = turnOf(h);
  const r = faceRadius(h);
  const sy = Math.sin(h.yaw), sp = Math.sin(h.pitch) * t.pitchGain;
  if (p < 0) return [p * r[0] * sy, -p * r[1] * sp];
  const [rx, up, down] = reachOf(h);
  const u = (q[0] - h.c[0]) / rx;
  const dyq = q[1] - h.c[1];
  const v = dyq < 0 ? dyq / up : dyq / down;
  // the amplitude is limited so that the map stays monotonic (max slope of rimWeight is 1.54)
  const ax = clamp(p * r[0] * sy, -0.55 * rx, 0.55 * rx);
  const ay = clamp(-p * r[1] * sp, -0.5 * Math.min(up, down), 0.5 * Math.min(up, down));
  const uc = clamp(u, -1, 1);
  return [ax * rimWeight(u) * domeWeight(v, t.domeFloor), ay * (1 - uc * uc) * rimWeight(v)];
}

/** Per-point map of a head layer: `face` = the face outline (faceDisp), else hair (shellDisp). */
export function shellMap(h: HeadFrame, p: number, face = false): (q: Pt) => Pt {
  const s = headShift(h);
  return (q: Pt) => {
    const d = face ? faceDisp(h, p, q) : shellDisp(h, p, q);
    return [q[0] + d[0] + s[0], q[1] + d[1] + s[1]];
  };
}

/** Rigid placement of a facial feature centred at c0 with half width hw: its left and right
 *  ends follow the face (faceDisp), the piece in between only squeezes (rule E). `depth` > 1
 *  moves the piece more (nose). */
export function featurePlace(h: HeadFrame, p: number, c0: Pt, hw = 0, depth = 1): { c: Pt; sx: number; sy: number } {
  const t = turnOf(h);
  const w = Math.max(hw, 1);
  const s = headShift(h);
  const dl = faceDisp(h, p * depth, [c0[0] - w, c0[1]])[0], dr = faceDisp(h, p * depth, [c0[0] + w, c0[1]])[0];
  const sx = clamp(1 + (dr - dl) / (2 * w), 0.45, 1.2);
  const dy = -p * depth * faceRadius(h)[1] * Math.sin(h.pitch) * t.pitchGain;
  const sy = Math.max(0.8, Math.cos(h.pitch * 0.6));
  return { c: [c0[0] + (dl + dr) / 2 + s[0], c0[1] + dy + s[1]], sx, sy };
}

/** Rigid placement of a part attached to the head at `anchor` (ear, twin tail): the offset of
 *  the anchor and the horizontal scale about it. */
export function attachPlace(h: HeadFrame, p: number, anchor: Pt): { d: Pt; sx: number } {
  const t = turnOf(h);
  const s = headShift(h);
  const d = shellDisp(h, p, anchor);
  const [rx] = reachOf(h);
  const side = clamp((anchor[0] - h.c[0]) / (0.4 * rx), -1, 1);
  const sx = clamp(1 - t.earSqueeze * Math.sin(h.yaw) * side, 0.6, 1.3);
  const inward = -(anchor[0] - h.c[0]) * (1 - Math.cos(h.yaw)) * t.earIn;
  return { d: [d[0] + s[0] + inward, d[1] + s[1]], sx };
}

/** Rim of the whole head from the boxes [x0, y0, x1, y1] of its fixed (non-swinging) parts. */
export function headReach(c: Pt, r: [number, number], boxes: [number, number, number, number][], margin = 0.03): [number, number, number] {
  let rx = r[0], up = r[1], down = r[1];
  for (const b of boxes) {
    rx = Math.max(rx, c[0] - b[0], b[2] - c[0]);
    up = Math.max(up, c[1] - b[1]);
    down = Math.max(down, b[3] - c[1]);
  }
  return [rx * (1 + margin), up * (1 + margin), down * (1 + margin)];
}
