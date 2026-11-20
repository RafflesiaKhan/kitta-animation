// Procedural arm for method V (vector_plan.md §5).
// - upper arm and forearm are two separate gentle curves joined at the elbow;
// - the width tapers from the shoulder to the wrist and grows with depth (nearer = thicker);
// - colour bands along the arm (skin / sleeve / arm cover) and one shade band on one side.
import polygonClipping, { type MultiPolygon, type Ring } from "./pc";
import type { ArmDef, Pt } from "./vdata";

export interface ArmInput {
  S: Pt; E: Pt; W: Pt;           // screen points (drawing px)
  zS: number; zE: number; zW: number;
  upperLen: number; foreLen: number; // 3D lengths
  def: ArmDef;
  /** +1 when the body centre is to the screen right of the shoulder, -1 otherwise */
  towardBody: number;
  depthGain: number;              // width gain per px of depth
  curve: number;                  // gentle curve amount (fraction of segment length)
}

export interface ArmPiece { silhouette: MultiPolygon; bands: { color: string; poly: MultiPolygon }[]; shade: MultiPolygon }

export interface ArmGeom {
  /** upper arm and forearm separately (when they are on different sides of the body) */
  parts: { upper: ArmPiece; fore: ArmPiece };
  silhouette: MultiPolygon;
  bands: { color: string; poly: MultiPolygon }[];
  shade: MultiPolygon;
  shadeColor: string;
  wrist: Pt;
  /** unit direction of the forearm on screen (elbow -> wrist) */
  foreDir: Pt;
  wristWidth: number;
  elbowBend: number;              // 0 = straight, radians
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const addp = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const norm = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const perp = (a: Pt): Pt => [-a[1], a[0]];

interface Sample { p: Pt; n: Pt; w: number; T: number }

/** Quadratic centre curve from a to b, bowed by `bow` (px) along `side`. */
function segment(a: Pt, b: Pt, wa: number, wb: number, side: Pt, bow: number, T0: number, T1: number, n = 12): Sample[] {
  const c = addp(mul(addp(a, b), 0.5), mul(side, bow * 2));
  const out: Sample[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const p: Pt = [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
    const d = norm([2 * u * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), 2 * u * (c[1] - a[1]) + 2 * t * (b[1] - c[1])]);
    out.push({ p, n: perp(d), w: wa + (wb - wa) * t, T: T0 + (T1 - T0) * t });
  }
  return out;
}

const R2 = (v: number) => Math.round(v * 100) / 100;
const rp = (p: Pt): Pt => [R2(p[0]), R2(p[1])];

/** Half-circle cap around c from point `from` to point `to`, bulging along `dir`. */
function cap(c: Pt, from: Pt, to: Pt, dir: Pt, out: Pt[]) {
  const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
  let a1 = Math.atan2(to[1] - c[1], to[0] - c[0]);
  const r = Math.hypot(from[0] - c[0], from[1] - c[1]);
  // pick the rotation sense whose midpoint lies along dir
  let d = a1 - a0;
  while (d <= -Math.PI) d += 2 * Math.PI;
  while (d > Math.PI) d -= 2 * Math.PI;
  const mid = a0 + d / 2;
  if (Math.cos(mid) * dir[0] + Math.sin(mid) * dir[1] < 0) d = d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI;
  a1 = a0 + d;
  for (let k = 1; k < 10; k++) {
    const a = a0 + (d * k) / 10;
    out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
}

function capsule(s: Sample[], roundStart: boolean, roundEnd: boolean, scale = 1): Ring {
  const left = s.map((q) => addp(q.p, mul(q.n, (q.w * scale) / 2)));
  const right = s.map((q) => sub(q.p, mul(q.n, (q.w * scale) / 2)));
  const ring: Pt[] = [...left];
  const last = s[s.length - 1], first = s[0];
  const dEnd = norm(sub(last.p, s[s.length - 2].p));
  const dStart = norm(sub(first.p, s[1].p));
  if (roundEnd) cap(last.p, left[left.length - 1], right[right.length - 1], dEnd, ring);
  ring.push(...[...right].reverse());
  if (roundStart) cap(first.p, right[0], left[0], dStart, ring);
  // drop near-duplicate points and close
  const outp: Pt[] = [];
  for (const p of ring.map(rp)) {
    const l = outp[outp.length - 1];
    if (!l || Math.abs(l[0] - p[0]) > 0.02 || Math.abs(l[1] - p[1]) > 0.02) outp.push(p);
  }
  outp.push(outp[0]);
  return outp as Ring;
}

/** polygon-clipping can fail on degenerate input; fall back to the raw polygons. */
function safe(op: () => MultiPolygon, fallback: MultiPolygon): MultiPolygon {
  try { return op(); } catch { return fallback; }
}

/** How far (drawing px) a colour band reaches into the next band. */
const BAND_OVERLAP = 1.5;

/** Ring with a positive signed area, so overlapping rings in one path stay filled (nonzero). */
function orient(r: Ring): Ring {
  let a = 0;
  for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return a < 0 ? ([...r].reverse() as Ring) : r;
}

function strip(s: Sample[], offA: (q: Sample) => number, offB: (q: Sample) => number): Ring {
  const a = s.map((q) => addp(q.p, mul(q.n, offA(q))));
  const b = s.map((q) => addp(q.p, mul(q.n, offB(q)))).reverse();
  const r = [...a, ...b].map(rp);
  r.push(r[0]);
  return r as Ring;
}

export function buildArm(inp: ArmInput): ArmGeom {
  const { S, E, W, def } = inp;
  const g = (z: number) => Math.max(0.6, 1 + inp.depthGain * z);
  const ws = def.width.shoulder * g(inp.zS), we = def.width.elbow * g(inp.zE), ww = def.width.wrist * g(inp.zW);
  const du = norm(sub(E, S)), df = norm(sub(W, E));
  // elbow bend side: the forearm turns toward one side of the upper arm; bow outward (convex side)
  const cross = du[0] * df[1] - du[1] * df[0];
  const bend = Math.acos(Math.max(-1, Math.min(1, du[0] * df[0] + du[1] * df[1])));
  // bow toward the convex side of the elbow, growing smoothly with the bend: a sign() here
  // flipped the bow from frame to frame on a nearly straight arm (the upper arm "shook")
  const outward = Math.max(-1, Math.min(1, -cross / 0.25));
  const lu = Math.hypot(E[0] - S[0], E[1] - S[1]), lf = Math.hypot(W[0] - E[0], W[1] - E[1]);
  const split = inp.upperLen / (inp.upperLen + inp.foreLen);
  const up = segment(S, E, ws, we, mul(perp(du), outward), inp.curve * lu, 0, split);
  const fo = segment(E, W, we, ww, mul(perp(df), outward), inp.curve * lf * 0.6, split, 1);
  const capU = capsule(up, true, true), capF = capsule(fo, true, true);
  const sil = safe(() => polygonClipping.union([capU], [capF]), [[capU], [capF]]);

  // sample of a segment's centre line at an exact parameter T (band boundaries between samples)
  const at = (seg: Sample[], T: number): Sample => {
    let i = 0;
    while (i < seg.length - 2 && seg[i + 1].T < T) i++;
    const a = seg[i], b = seg[i + 1];
    const u = b.T > a.T ? Math.max(0, Math.min(1, (T - a.T) / (b.T - a.T))) : 0;
    const n = norm([a.n[0] + (b.n[0] - a.n[0]) * u, a.n[1] + (b.n[1] - a.n[1]) * u]);
    return { p: [a.p[0] + (b.p[0] - a.p[0]) * u, a.p[1] + (b.p[1] - a.p[1]) * u], n, w: a.w + (b.w - a.w) * u, T };
  };
  const ext = (q: Sample, toward: Sample): Sample => {
    const d = norm(sub(q.p, toward.p));
    return { ...q, p: addp(q.p, mul(d, q.w)) };
  };
  // Colour bands are built per segment. One strip along the whole centre line folded over
  // itself at a sharply bent elbow: the overlap cancelled out (nonzero fill) and the outer
  // corner of the elbow was not covered, so the base colour showed through as a notch.
  // A strip runs one width past an end of the arm (shoulder, wrist) and past the elbow where
  // the band continues across it, so the round caps are covered as well.
  // A band boundary is a ring around the arm; on a segment that points toward (or away from)
  // the viewer its visible front half projects to half an ellipse that bows toward the far
  // end. Straight cuts there left a V-shaped notch of the far band beside the near end.
  const eps = 1e-6;
  const bow = (a: Pt, b: Pt, za: number, zb: number) => {
    const l2 = Math.hypot(b[0] - a[0], b[1] - a[1]), l3 = Math.hypot(l2, zb - za) || 1;
    return -Math.sign(zb - za) * Math.sqrt(Math.max(0, 1 - (l2 / l3) ** 2)); // along the segment
  };
  const bowU = bow(S, E, inp.zS, inp.zE), bowF = bow(E, W, inp.zE, inp.zW);
  const bandRing = (seg: Sample[], k: number, from: number, to: number, extStart: boolean, extEnd: boolean): Ring | null => {
    const inner = seg.filter((q) => q.T > from + eps && q.T < to - eps);
    const s0 = at(seg, from), s1 = at(seg, to);
    let seq = [s0, ...inner, s1];
    if (Math.hypot(s1.p[0] - s0.p[0], s1.p[1] - s0.p[1]) < 1e-3 && !k) return null;
    if (extStart) seq = [ext(seq[0], seq[1]), ...seq];
    if (extEnd) seq = [...seq, ext(seq[seq.length - 1], seq[seq.length - 2])];
    // boundary from lateral offset +0.7w to -0.7w (or back): straight beyond the arm's
    // half width, half an ellipse inside it; `shift` moves it along the arm
    const edge = (q: Sample, down: boolean, curved: boolean, shift = 0): Pt[] => {
      const h = q.w / 2, t: Pt = [q.n[1], -q.n[0]];
      const cs = [0.7 * q.w, ...(curved && k ? Array.from({ length: 13 }, (_, i) => h - (2 * h * i) / 12) : []), -0.7 * q.w];
      return (down ? cs : [...cs].reverse()).map((c) => {
        const e = (Math.abs(c) < h ? k * h * Math.sqrt(1 - (c / h) ** 2) : 0) + shift;
        return rp(addp(addp(q.p, mul(q.n, c)), mul(t, e)));
      });
    };
    const left = seq.slice(1, -1).map((q) => rp(addp(q.p, mul(q.n, q.w * 0.7))));
    const right = seq.slice(1, -1).map((q) => rp(addp(q.p, mul(q.n, -q.w * 0.7)))).reverse();
    // a band runs a hair into the next one, which is drawn over it: no seam between the
    // bands' anti-aliased edges (the arm has no base fill under its bands)
    const r = [...edge(seq[0], false, !extStart), ...left, ...edge(seq[seq.length - 1], true, !extEnd, extEnd ? 0 : BAND_OVERLAP), ...right];
    r.push(r[0]);
    return orient(r as Ring);
  };
  const rings = (...r: (Ring | null)[]): MultiPolygon => r.filter((x): x is Ring => !!x).map((x) => [x]);
  const bands: ArmGeom["bands"] = [], bandsU: ArmGeom["bands"] = [], bandsF: ArmGeom["bands"] = [];
  for (const b of def.bands) {
    // upper arm part: the band that reaches the elbow also covers the elbow end (and, in the
    // joined arm, the outer corner of the bend and the forearm's round end)
    const rU = b.from < split - eps ? bandRing(up, bowU, Math.max(0, b.from), Math.min(split, b.to), b.from <= eps, b.to >= split - eps) : null;
    // forearm part; as a separate piece it also covers its own round end at the elbow. In the
    // joined arm it does not reach back over the elbow (it would paint over an earlier band)
    const fFrom = Math.max(split, b.from), fTo = Math.min(1, b.to);
    const live = b.to > split + eps;
    const rF = live ? bandRing(fo, bowF, fFrom, fTo, false, b.to >= 1 - eps) : null;
    const rFx = live ? bandRing(fo, bowF, fFrom, fTo, b.from <= split + eps, b.to >= 1 - eps) : null;
    if (rU || rF) bands.push({ color: b.color, poly: rings(rU, rF) });
    if (rU) bandsU.push({ color: b.color, poly: rings(rU) });
    if (rFx) bandsF.push({ color: b.color, poly: rings(rFx) });
  }

  // shade band on the "under" side (toward the body for a hanging arm, downward for a raised one)
  const ratio = def.shade.ratio ?? 0.3;
  const gv = norm([inp.towardBody * 0.7, 1]);
  const pick = (seg: Sample[]) => {
    const m = seg[Math.floor(seg.length / 2)];
    const dotv = m.n[0] * gv[0] + m.n[1] * gv[1];
    const under = dotv >= 0 ? 1 : -1;
    return def.shade.side === "over" ? -under : under;
  };
  // each strip runs half a width past its ends so the upper-arm and forearm shades overlap at
  // the elbow (no notch); the silhouette clip trims the excess. Both rings get the same
  // winding so their overlap stays filled.
  const extended = (seg: Sample[]) => [ext(seg[0], seg[1]), ...seg, ext(seg[seg.length - 1], seg[seg.length - 2])]
    .map((q, i, a) => (i === 0 || i === a.length - 1 ? { ...q, p: addp(q.p, mul(norm(sub(q.p, a[i === 0 ? 1 : a.length - 2].p)), -q.w * 0.5)) } : q));
  const shadeRing = (seg: Sample[]) => { const sd = pick(seg); return orient(strip(extended(seg), (q) => sd * q.w * 0.8, (q) => sd * (q.w / 2 - q.w * ratio))); };
  const shU = shadeRing(up), shF = shadeRing(fo);
  const shade: MultiPolygon = [[shU], [shF]];
  // a separate piece shows only its own segment's bands and shade, clipped to its silhouette
  const parts = {
    upper: { silhouette: [[capU]], bands: bandsU, shade: [[shU]] } as ArmPiece,
    fore: { silhouette: [[capF]], bands: bandsF, shade: [[shF]] } as ArmPiece,
  };
  return { parts, silhouette: sil, bands, shade, shadeColor: def.shade.color, wrist: W, foreDir: df, wristWidth: ww, elbowBend: bend };
}

export function multiPolygonPath(mp: MultiPolygon, path = new Path2D()): Path2D {
  for (const poly of mp) for (const ring of poly) {
    ring.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
  }
  return path;
}
