import type { Expression, MouthShape } from '../types';
import { FACES, type MouthMood } from './expressions';

// Mouth geometry is centred on (0,0); the Character translates/scales it into place.
// w = half-width, up = opening above the corner line, down = opening below it,
// round = 0 (wide, flat lips) .. 1 (round/puckered).
interface ShapeParams { w: number; up: number; down: number; round: number; teeth: number; tongue: 'none' | 'low' | 'high' }
const SHAPES: Record<MouthShape, ShapeParams> = {
  A: { w: 50, up: 0, down: 5, round: 0, teeth: 0, tongue: 'none' },    // closed M/B/P
  B: { w: 52, up: 8, down: 20, round: 0.1, teeth: 12, tongue: 'none' }, // slightly open, teeth
  C: { w: 55, up: 16, down: 40, round: 0.2, teeth: 12, tongue: 'low' }, // open
  D: { w: 62, up: 24, down: 62, round: 0.3, teeth: 14, tongue: 'low' }, // wide open
  E: { w: 40, up: 16, down: 34, round: 0.7, teeth: 0, tongue: 'low' },  // slightly rounded
  F: { w: 24, up: 14, down: 22, round: 1, teeth: 0, tongue: 'none' },   // puckered
  G: { w: 50, up: 8, down: 16, round: 0.1, teeth: 99, tongue: 'none' }, // F/V: teeth on lower lip
  H: { w: 52, up: 14, down: 36, round: 0.2, teeth: 10, tongue: 'high' },// L: tongue behind teeth
  X: { w: 44, up: 0, down: 3, round: 0, teeth: 0, tongue: 'none' },     // rest
};

const n = (v: number) => String(Math.round(v * 10) / 10);

// The mood is an expression name or a mixed MouthMood (while one expression blends into the next).
function geometry(shape: MouthShape, mood: Expression | MouthMood) {
  const p = SHAPES[shape];
  const e = typeof mood === 'string' ? FACES[mood].mouth : mood;
  const w = p.w * e.ws;
  const cy = -e.lift * (p.w / 55); // corner y; smaller mouths bend less
  const r = Math.min(1, p.round + e.round);
  const k = w * (0.55 + 0.4 * r); // control-point x: closer to the corners = rounder
  const uy = -(p.up * e.hs) / 0.75; // cubic midpoint reaches 0.75 of the control y
  const ly = (p.down * e.hs) / 0.75;
  return { p, w, cy, k, uy, ly, upperMid: 0.25 * cy + 0.75 * uy, lowerMid: 0.25 * cy + 0.75 * ly };
}

/** One closed path: the mouth outline (upper lip left→right, lower lip right→left). */
export function mouthPath(shape: MouthShape, mood: Expression | MouthMood): string {
  const { w, cy, k, uy, ly } = geometry(shape, mood);
  return `M${n(-w)} ${n(cy)} C${n(-k)} ${n(uy)} ${n(k)} ${n(uy)} ${n(w)} ${n(cy)} C${n(k)} ${n(ly)} ${n(-k)} ${n(ly)} ${n(-w)} ${n(cy)} Z`;
}

/** Extra detail the Character draws inside the mouth (clipped to mouthPath). */
export function mouthDetail(shape: MouthShape, mood: Expression | MouthMood) {
  const { p, w, upperMid, lowerMid } = geometry(shape, mood);
  const open = lowerMid - upperMid;
  const teethBottom = p.teeth === 0 ? null : Math.min(upperMid + p.teeth, lowerMid - (p.teeth === 99 ? 3 : 0));
  const tongue =
    p.tongue === 'low' ? { cx: 0, cy: lowerMid, rx: w * 0.55, ry: open * 0.4 }
    : p.tongue === 'high' ? { cx: 0, cy: upperMid + p.teeth + open * 0.25, rx: w * 0.4, ry: open * 0.35 }
    : null;
  return { w, upperMid, lowerMid, teethBottom, tongue };
}
