// Automatic outlines (vector_plan.md §8): no black outer outline by default; where a part is
// drawn over an already drawn part of the same or a similar colour, a line slightly darker
// than the front part is drawn along the front part's edge, on its inside.
import pc, { type Ring } from "./pc";
import { apply, flatten, mulAff, type Affine, type LoadedPart, type Pt } from "./vdata";
import { hasCanvas, makeCanvas } from "../../canvasFactory";

export interface OutlineSettings {
  enabled: boolean;
  outer: boolean;
  width: number;      // drawing px (inside the front part)
  darken: number;     // 0..1 lightness reduction
  threshold: number;  // CIE76 delta E: colours closer than this count as "similar"
  outerColor: string; // "" = derived from each part
  /** hand-drawn ("brush") lines; null = the plain constant-width stroke (id044) */
  hand?: HandLine | null;
  /** current time in seconds (set by the renderer each frame; used by the boil) */
  clock?: number;
}

/** Hand-drawn line settings (id053). The part data is not changed: only the way the
 *  generated outline is stroked (and, optionally, a tiny wobble of the face features). */
export interface HandLine {
  wobble: number;    // drawing px: offset of the line along the normal (slow noise)
  wave: number;      // drawing px: wavelength of that noise
  pressure: number;  // 0..1: width variation along the line (and a little thicker on curves)
  taper: number;     // drawing px: thinning toward the visible ends of a line (0 = off)
  boil: number;      // re-draws of the noise per second (0 = still, no flicker)
  face: number;      // drawing px: wobble of feature shapes (eyes, mouth, brows; 0 = off)
  seed: number;
  /** drawing px: extra wobble that may go far inward (re-rolled by the boil; 0 = off) */
  boilWob?: number;
  /** line material: a paper-grain texture and rough edges ("none" = flat colour) */
  texture?: LineTexture;
  /** 0..1 edge roughness (default by texture: pencil 0.3, crayon 0.6, none 0) */
  rough?: number;
}

export type LineTexture = "none" | "pencil" | "crayon";

export type HandPreset = "weak" | "mid" | "strong" | "sketch";
const STRONG: HandLine = { wobble: 1.9, wave: 22, pressure: 0.9, taper: 30, boil: 0, face: 0.7, seed: 1 };
export const HAND_PRESETS: Record<HandPreset, HandLine> = {
  weak: { wobble: 0.6, wave: 40, pressure: 0.3, taper: 12, boil: 0, face: 0.25, seed: 1 },
  mid: { wobble: 1.1, wave: 30, pressure: 0.6, taper: 20, boil: 0, face: 0.45, seed: 1 },
  strong: STRONG,
  // optional set for a stronger hand-made look: strong + 8fps boil + 2px big wobble + crayon
  sketch: { ...STRONG, boil: 8, boilWob: 2, texture: "crayon" },
};
/** Preset used when the URL has no vHand (owner decision, 2026-11-18). */
export const DEFAULT_HAND: HandPreset = "strong";

/** URL parameters: vHand=0|1|2|3|4 (off, weak, mid, strong, sketch) or off|weak|mid|strong|sketch
 *  (default: strong), then optional overrides vWob, vWave, vPress, vTaper, vBoil, vFaceWob, vSeed,
 *  vBoilWob, vRough and vTex=pencil|crayon|none. */
export function handFromQuery(p: URLSearchParams): HandLine | null {
  const v = p.get("vHand");
  const names: (HandPreset | null)[] = [null, "weak", "mid", "strong", "sketch"];
  const name = v == null ? DEFAULT_HAND : (names[Number(v)] ?? (v in HAND_PRESETS ? (v as HandPreset) : null));
  if (!name) return null;
  const h = { ...HAND_PRESETS[name] };
  const ov: [string, keyof HandLine][] = [["vWob", "wobble"], ["vWave", "wave"], ["vPress", "pressure"], ["vTaper", "taper"], ["vBoil", "boil"], ["vFaceWob", "face"], ["vSeed", "seed"]];
  for (const [k, f] of ov) if (p.has(k) && isFinite(Number(p.get(k)))) (h as Record<string, unknown>)[f] = Number(p.get(k));
  if (p.has("vBoilWob") && isFinite(Number(p.get("vBoilWob")))) h.boilWob = Number(p.get("vBoilWob"));
  if (p.has("vRough") && isFinite(Number(p.get("vRough")))) h.rough = Number(p.get("vRough"));
  const t = p.get("vTex");
  if (t === "pencil" || t === "crayon" || t === "none") h.texture = t;
  return h;
}

// ---------------------------------------------------------------- noise (deterministic)
function hash3(ix: number, iy: number, s: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1]. */
export function noise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash3(ix, iy, seed), b = hash3(ix + 1, iy, seed), c = hash3(ix, iy + 1, seed), d = hash3(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
/** Two octaves of value noise, roughly in [-1, 1]. */
export function fbm2(x: number, y: number, seed: number): number {
  return (noise2(x, y, seed) * 0.67 + noise2(x * 2.1 + 5.3, y * 2.1 + 1.7, seed + 101) * 0.33) * 2 - 1;
}
/** Seed of the current frame: changes `boil` times per second, constant when boil = 0. */
export function boilSeed(h: HandLine, clock = 0): number {
  return (h.seed | 0) + (h.boil > 0 ? Math.floor(clock * h.boil + 1e-6) * 7919 : 0);
}

/** Wobble of feature shapes (local = rest drawing coordinates). The field depends only on the
 *  position, so an eye white and its clip copy move together. */
export function faceWobbleMap(h: HandLine | null | undefined, clock = 0): ((p: Pt) => Pt) | null {
  if (!h || !(h.face > 0)) return null;
  const s = boilSeed(h, clock) + 31, f = 14;
  return ([x, y]) => [x + h.face * fbm2(x / f, y / f, s), y + h.face * fbm2(x / f + 9.1, y / f - 3.7, s + 57)];
}

// ---------------------------------------------------------------- line texture (paper grain)
export const TEX_SIZE = 128;
/** Value noise that repeats every `period` lattice cells (the texture tiles without seams). */
function pnoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const m = (v: number) => ((v % period) + period) % period;
  const a = hash3(m(ix), m(iy), seed), b = hash3(m(ix + 1), m(iy), seed), c = hash3(m(ix), m(iy + 1), seed), d = hash3(m(ix + 1), m(iy + 1), seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
/** Coverage (0..1) of a line material at each texture pixel, tiling TEX_SIZE x TEX_SIZE.
 *  pencil: fine grain with diagonal streaks, rather light; crayon: coarse paper tooth that
 *  leaves small holes. */
export function textureAlpha(kind: LineTexture, seed = 1): Float32Array {
  const N = TEX_SIZE, out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = hash3(x, y, seed + 5);
    let a = 1;
    if (kind === "pencil") {
      // streaks along the diagonal (period 128 px: u, v in lattice cells of 2 / 8 px)
      const st = pnoise((x + y) / 2, (x - y + N) / 8, N / 2, seed + 9) * 0.6 + pnoise(x / 4, y / 4, N / 4, seed + 3) * 0.4;
      a = 0.18 + 0.75 * st + 0.3 * (r - 0.5);
    } else if (kind === "crayon") {
      const tooth = pnoise(x / 4, y / 4, N / 4, seed + 7) * 0.6 + pnoise(x / 2, y / 2, N / 2, seed + 8) * 0.4;
      const t = Math.min(1, Math.max(0, (tooth - 0.24) / 0.26));
      a = t * t * (3 - 2 * t) * (0.8 + 0.2 * r);
    }
    out[y * N + x] = Math.min(1, Math.max(0, a));
  }
  return out;
}
const texCache = new Map<string, CanvasPattern | null>();
function texturePattern(g: CanvasRenderingContext2D, kind: LineTexture, color: string, mild: boolean): CanvasPattern | null {
  const key = `${kind}|${color}|${mild ? 1 : 0}`;
  if (texCache.has(key)) return texCache.get(key)!;
  let pat: CanvasPattern | null = null;
  if (hasCanvas()) {
    const N = TEX_SIZE, cv = makeCanvas(N, N);
    const c = cv.getContext("2d")!;
    const img = c.createImageData(N, N);
    const al = textureAlpha(kind), [R, G, B] = hexRgb(color);
    // mild (face features): no holes, only a grain, so pupils and lashes keep their shape
    for (let i = 0; i < N * N; i++) { img.data[4 * i] = R; img.data[4 * i + 1] = G; img.data[4 * i + 2] = B; img.data[4 * i + 3] = Math.round(255 * (mild ? 0.7 + 0.3 * al[i] : al[i])); }
    c.putImageData(img, 0, 0);
    pat = g.createPattern(cv, "repeat");
  }
  texCache.set(key, pat);
  return pat;
}
/** Size of one texture pixel in drawing px (the grain zooms with the picture). */
export const TEXEL = 1.2;
/** Fill style of a line: the flat colour, or the colour with the paper grain of the chosen
 *  texture. The grain is fixed to the paper (the canvas, not the part) and jumps with the
 *  boil. `m` = the current transform (canvas px per local unit), `view` = the drawing-to-canvas
 *  transform (for the grain size). */
export function lineFill(g: CanvasRenderingContext2D, color: string, h: HandLine | null | undefined, clock: number | undefined, m: Affine, view: Affine, mild = false): string | CanvasPattern {
  if (!h || !h.texture || h.texture === "none" || typeof DOMMatrix === "undefined") return color;
  const pat = texturePattern(g, h.texture, color, mild);
  if (!pat) return color;
  const s = boilSeed(h, clock);
  const ox = Math.floor(hash3(s, 1, 99) * TEX_SIZE), oy = Math.floor(hash3(s, 2, 99) * TEX_SIZE);
  const px = TEXEL * scaleOf(view);
  pat.setTransform(new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]).inverse().scale(px).translate(ox, oy));
  return pat;
}
/** Face features drawn as dark shapes (lash lines, brows, mouth line) get the line
 *  texture too, so they match the outlines. Light shapes (eye whites, blush) stay flat. */
export function featureFill(g: CanvasRenderingContext2D, color: string, o: OutlineSettings, m: Affine, view: Affine): string | CanvasPattern {
  const h = o.hand;
  if (!h || !h.texture || h.texture === "none" || !/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (toLab(hexRgb(color))[0] > 45) return color;
  return lineFill(g, color, h, o.clock, m, view, true);
}

// ---------------------------------------------------------------- brush line geometry
/** Closed ring resampled at (about) equal arc length. A repeated closing point is dropped. */
export function resampleRing(ring: Pt[], step: number): Pt[] {
  let pts = ring;
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) pts = pts.slice(0, -1);
  }
  const n0 = pts.length;
  if (n0 < 3) return pts.slice();
  let total = 0;
  for (let i = 0; i < n0; i++) { const a = pts[i], b = pts[(i + 1) % n0]; total += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  if (!(total > 0)) return pts.slice();
  const n = Math.max(3, Math.round(total / step));
  const d = total / n;
  const out: Pt[] = [];
  let i = 0, segStart = 0;
  for (let k = 0; k < n; k++) {
    const s = k * d;
    for (;;) {
      const a = pts[i % n0], b = pts[(i + 1) % n0];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (s <= segStart + L || i >= n0 - 1) {
        const t = L > 0 ? Math.min(1, Math.max(0, (s - segStart) / L)) : 0;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        break;
      }
      segStart += L; i++;
    }
  }
  return out;
}

export interface BrushRing {
  c: Pt[];      // centre line (local coordinates), closed
  half: number[]; // half of the line width at each point (local units)
  step: number; // sample spacing in drawing px
}

/** Brush line along a closed ring. `k` = drawing px per local unit, `w` = line width (drawing
 *  px, as OutlineSettings.width). Noise is taken at the local position, so a rigidly moving
 *  part keeps the same line in every frame. */
export function brushRing(ring: Pt[], k: number, w: number, h: HandLine, seed: number, step = 2.5): BrushRing {
  const c0 = resampleRing(ring, step / k);
  const n = c0.length;
  const c: Pt[] = [], half: number[] = [];
  if (n < 3) return { c: c0, half: c0.map(() => w / k), step };
  // turning angle per point, smoothed over +-2 samples -> curvature (rad per drawing px)
  const turn = c0.map((p, i) => {
    const a = c0[(i - 1 + n) % n], b = c0[(i + 1) % n];
    const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    let d = t2 - t1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  });
  const maxOff = 0.7 * w;
  const bw = h.boilWob ?? 0;
  const rough = h.rough ?? (h.texture === "crayon" ? 0.6 : h.texture === "pencil" ? 0.3 : 0);
  // inward side of the ring: left of the direction of travel for a counter-clockwise ring
  let area = 0;
  for (let i = 0; i < n; i++) { const a = c0[i], b = c0[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const inSide = area >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = c0[i], a = c0[(i - 1 + n) % n], b = c0[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const ux = (p[0] * k) / h.wave, uy = (p[1] * k) / h.wave;
    // small wobble both ways; the big (boil) wobble may go far inward but never further out,
    // because the line is clipped to the inside of the part and would vanish
    const big = bw > 0 ? bw * Math.max(-1, Math.min(1, 1.7 * fbm2(ux * 0.8 + 11.3, uy * 0.8 - 5.9, seed + 211))) : 0;
    const off = inSide * Math.max(-maxOff, Math.min(maxOff + bw, h.wobble * fbm2(ux, uy, seed) + big));
    let tsum = 0;
    for (let j = -2; j <= 2; j++) tsum += turn[(i + j + n) % n];
    const kappa = tsum / 5 / step;
    const curve = Math.min(1, kappa * 8); // radius 8 px or less: full boost
    const press = Math.max(0.25, 1 + h.pressure * (0.75 * fbm2(ux * 0.45 + 3.3, uy * 0.45 - 7.1, seed + 13) + 0.45 * curve - 0.1));
    // rough edge (pencil, crayon): the width jumps a little from sample to sample
    const r = rough > 0 ? Math.max(0.3, 1 + rough * 0.6 * (noise2((p[0] * k) / 2.2, (p[1] * k) / 2.2, seed + 77) * 2 - 1)) : 1;
    c.push([p[0] - ty * (off / k), p[1] + tx * (off / k)]);
    half.push((w * press * r) / k);
  }
  return { c, half, step };
}

/** Width factors for a line that is visible only where `vis` is true: 0 outside, rising
 *  smoothly over `taper` drawing px from each visible end. All visible: all 1. */
export function taperFactors(vis: boolean[], step: number, taper: number): number[] {
  const n = vis.length;
  if (!(taper > 0)) return vis.map((v) => (v ? 1 : 0));
  if (vis.every(Boolean)) return vis.map(() => 1);
  if (!vis.some(Boolean)) return vis.map(() => 0);
  const dist = vis.map((v) => (v ? Infinity : 0));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 2 * n; i++) { const a = i % n, b = (i + 1) % n; if (dist[b] > dist[a] + 1) dist[b] = dist[a] + 1; }
    for (let i = 2 * n; i > 0; i--) { const a = i % n, b = (i - 1) % n; if (dist[b] > dist[a] + 1) dist[b] = dist[a] + 1; }
  }
  return dist.map((d) => {
    if (d === 0) return 0;
    const t = Math.min(1, ((d - 0.5) * step) / taper);
    return 0.15 + 0.85 * t * t * (3 - 2 * t);
  });
}

/** The brush as quads (one per segment), all counter-clockwise so that a nonzero fill gives
 *  their union. Neighbouring quads share their edge (same normal at a shared point): no gaps. */
export function ribbonQuads(br: BrushRing, fac: number[] | null): Pt[][] {
  const n = br.c.length, c = br.c;
  if (n < 3) return [];
  const eps = 1e-3 * (br.half[0] || 1);
  const L: Pt[] = [], R: Pt[] = [], hw: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = c[(i - 1 + n) % n], b = c[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const h = br.half[i] * (fac ? fac[i] : 1);
    hw.push(h);
    L.push([c[i][0] - ty * h, c[i][1] + tx * h]);
    R.push([c[i][0] + ty * h, c[i][1] - tx * h]);
  }
  const quads: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (hw[i] < eps && hw[j] < eps) continue;
    const q: Pt[] = [L[i], L[j], R[j], R[i]];
    let area = 0;
    for (let k = 0; k < 4; k++) { const p = q[k], r = q[(k + 1) % 4]; area += p[0] * r[1] - r[0] * p[1]; }
    quads.push(area < 0 ? q.reverse() : q);
  }
  return quads;
}

/** Stroke a brush ring without a clip (outer outline): segments are grouped by width, so a
 *  ring costs a handful of stroke calls; round caps hide the steps. Under a clip, many stroke
 *  calls are slow, so the inner lines use fillBrush instead. */
function strokeBrush(g: CanvasRenderingContext2D, br: BrushRing) {
  const n = br.c.length;
  const q = (br.half[0] || 1) * 0.16; // width quantum (local units)
  const buckets = new Map<number, Path2D>();
  let prevB = -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const b = Math.max(1, Math.round((br.half[i] + br.half[j]) / q));
    let path = buckets.get(b);
    if (!path) { path = new Path2D(); buckets.set(b, path); }
    if (b !== prevB) path.moveTo(br.c[i][0], br.c[i][1]);
    path.lineTo(br.c[j][0], br.c[j][1]);
    prevB = b;
  }
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const [b, path] of buckets) { g.lineWidth = b * q; g.stroke(path); }
}

/** Fill a brush ring (current transform = the part's): one fill call per ring. */
function fillBrush(g: CanvasRenderingContext2D, br: BrushRing, fac: number[] | null) {
  const path = new Path2D();
  for (const q of ribbonQuads(br, fac)) { path.moveTo(q[0][0], q[0][1]); for (let k = 1; k < 4; k++) path.lineTo(q[k][0], q[k][1]); path.closePath(); }
  g.fill(path, "nonzero");
}

export interface DrawItem {
  id: string;
  aff: Affine;
  paths: Path2D[];
  fills: (string | null)[];
  sil: Path2D;                  // silhouette (union of shapes), before aff
  color: string;
  box: [number, number, number, number]; // after aff (drawing px)
  clip?: { aff: Affine; path: Path2D };
  noOutline?: boolean;
  evenodd?: boolean;
  group?: string;               // pieces of one arm do not outline each other
  clipSelf?: boolean;           // paths[1..] are clipped to paths[0] (generated arms)
  outline?: boolean;            // false: this part never draws an automatic outline
  /** colour regions inside the silhouette (generated arms: one per colour band); default = whole part */
  regions?: { path: Path2D; color: string; shade?: string }[];
  shadePath?: Path2D;
  seamless?: string[];          // no outline between this item and these ids / groups
  /** silhouette as polylines (same coordinates as sil); needed for hand-drawn lines */
  rings?: Pt[][];
}

/** True when the two items must join without a line (vector.json "seamlessWith"). */
export function seamless(a: DrawItem, b: DrawItem): boolean {
  const hit = (x: DrawItem, y: DrawItem) => !!x.seamless && (x.seamless.includes(y.id) || (!!y.group && x.seamless.includes(y.group)));
  return hit(a, b) || hit(b, a);
}

/** Union of all shapes of a part (rest coordinates). */
export function silhouetteRings(p: LoadedPart): Pt[][] {
  const rd = (v: number) => Math.round(v * 100) / 100;
  const polys = p.cmds.map((c) => flatten(c, 6)).filter((r) => r.length)
    .map((rings) => rings.map((r) => { const q = r.map(([x, y]) => [rd(x), rd(y)] as Pt); return [...q, q[0]] as Ring; }));
  if (!polys.length) return [];
  try {
    const u = pc.union(polys[0], ...polys.slice(1));
    return u.flatMap((poly) => poly.map((ring) => ring.slice(0, -1) as Pt[]));
  } catch {
    return polys.flat() as Pt[][];
  }
}

// ---------------------------------------------------------------- colour
function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toLab([r, g, b]: [number, number, number]): [number, number, number] {
  const f = (c: number) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = k(x); y = k(y); z = k(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const labCache = new Map<string, [number, number, number]>();
export function deltaE(a: string, b: string): number {
  const la = labCache.get(a) ?? toLab(hexRgb(a)); labCache.set(a, la);
  const lb = labCache.get(b) ?? toLab(hexRgb(b)); labCache.set(b, lb);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
function fromLab([L, A, B]: [number, number, number]): [number, number, number] {
  let y = (L + 16) / 116, x = A / 500 + y, z = y - B / 200;
  const f = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  x = f(x) * 0.95047; y = f(y); z = f(z) * 1.08883;
  const r = x * 3.2406 + y * -1.5372 + z * -0.4986, g = x * -0.9689 + y * 1.8758 + z * 0.0415, bb = x * 0.0557 + y * -0.204 + z * 1.057;
  const c = (v: number) => Math.round(255 * Math.max(0, Math.min(1, v > 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v)));
  return [c(r), c(g), c(bb)];
}

/** Line colour: the part colour made darker in CIELAB. The chroma is kept (absolute), so a
 *  warm white becomes a light grey, not orange; strong colours keep their hue. */
export function darken(hex: string, amount: number): string {
  const lab = toLab(hexRgb(hex));
  const L = Math.max(0, lab[0] - amount * 100);
  const k = 1 + amount * 0.6; // a little more chroma so coloured lines stay coloured
  const chroma = Math.hypot(lab[1], lab[2]);
  const ka = chroma < 8 ? 1 : k;
  const out = fromLab([L, lab[1] * ka, lab[2] * ka]);
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

const overlap = (a: DrawItem["box"], b: DrawItem["box"]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const scaleOf = (m: Affine) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

/** Draw P's outline where P lies over earlier items of a similar colour. Colours are compared
 *  per region, so a navy arm cover over a navy skirt gets a line but the white upper arm does not. */
export function drawOutlines(g: CanvasRenderingContext2D, view: Affine, P: DrawItem, drawn: DrawItem[], o: OutlineSettings) {
  if (P.outline === false) return;
  const regs = (it: DrawItem) => it.regions ?? [{ path: null as Path2D | null, color: it.color }];
  const cands = drawn.filter((Q) => !Q.clip && Q.id !== P.id && (!P.group || P.group !== Q.group) && !seamless(P, Q) && overlap(P.box, Q.box));
  if (!cands.length) return;
  const mP = mulAff(view, P.aff);
  // pieces of the same arm (upper arm, forearm, a seamless hand) form one shape: no outline
  // inside the pieces already drawn (e.g. the forearm's round end lying on the hand)
  const same = P.group ? drawn.filter((Q) => Q.group === P.group && Q.id !== P.id) : [];
  // one "outside of Q" clip per piece (applied in turn = outside of their union)
  const outside: Path2D[] = [];
  if (same.length && typeof DOMMatrix !== "undefined") {
    for (const Q of same) {
      const o2 = new Path2D();
      o2.rect(-1e5, -1e5, 2e5, 2e5);
      const m = mulAff(view, Q.aff);
      o2.addPath(Q.sil, new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]));
      outside.push(o2);
    }
  }
  const h = o.hand && P.rings ? o.hand : null;
  const kP = scaleOf(P.aff);
  // hand-drawn line: one brush per silhouette ring, built once for all overlapping pairs
  const brushes = h ? P.rings!.map((r) => brushRing(r, kP, o.width, h, boilSeed(h, o.clock))) : [];
  for (const pr of regs(P)) {
    for (const Q of cands) {
      for (const qr of regs(Q)) {
        if (deltaE(pr.color, qr.color) > o.threshold) continue;
        g.save();
        if (outside.length) { g.setTransform(1, 0, 0, 1, 0, 0); for (const o2 of outside) g.clip(o2, "evenodd"); }
        const mQ = mulAff(view, Q.aff);
        g.setTransform(mQ[0], mQ[1], mQ[2], mQ[3], mQ[4], mQ[5]);
        // visible ends of the line (for the taper): edge points of P lying inside Q's region
        // (without a taper, only the part of the ring near Q's box is filled; the clip does the rest)
        const facs = !h ? null : h.taper > 0
          ? brushes.map((br) => taperFactors(visibleMask(g, view, br.c, P, Q, qr.path, outside), br.step, h.taper))
          : brushes.map((br) => boxMask(br.c, P.aff, Q.box, 3 * o.width).map((v) => (v ? 1 : 0)));
        g.clip(Q.sil, Q.evenodd ? "evenodd" : "nonzero");
        if (qr.path) g.clip(qr.path);
        g.setTransform(mP[0], mP[1], mP[2], mP[3], mP[4], mP[5]);
        g.clip(P.sil, P.evenodd ? "evenodd" : "nonzero");
        if (pr.path) g.clip(pr.path);
        g.strokeStyle = darken(pr.color, o.darken);
        g.lineJoin = "round";
        if (h) {
          g.fillStyle = lineFill(g, darken(pr.color, o.darken), h, o.clock, mP, view);
          brushes.forEach((br, i) => { if (!facs || facs[i].some((f) => f > 0)) fillBrush(g, br, facs ? facs[i] : null); });
        } else {
          g.lineWidth = (2 * o.width) / kP;
          g.stroke(P.sil);
        }
        g.restore();
      }
    }
  }
}

/** Points (P local) whose drawing position lies in the box, grown by `pad` drawing px. */
export function boxMask(pts: Pt[], aff: Affine, box: DrawItem["box"], pad: number): boolean[] {
  return pts.map((p) => {
    const d = apply(aff, p);
    return d[0] >= box[0] - pad && d[0] <= box[2] + pad && d[1] >= box[1] - pad && d[1] <= box[3] + pad;
  });
}

/** Which centre-line points of P's brush lie inside Q (and its colour region) and outside
 *  the pieces of P's own arm. The current transform must be Q's (isPointInPath uses it). */
function visibleMask(g: CanvasRenderingContext2D, view: Affine, pts: Pt[], P: DrawItem, Q: DrawItem, qPath: Path2D | null, outside: Path2D[]): boolean[] {
  const mP = mulAff(view, P.aff);
  const [x0, y0, x1, y1] = Q.box;
  const fr = Q.evenodd ? "evenodd" : "nonzero";
  const mQ = g.getTransform();
  const test = (p: Pt) => {
    const d = apply(P.aff, p);
    if (d[0] < x0 - 2 || d[0] > x1 + 2 || d[1] < y0 - 2 || d[1] > y1 + 2) return false;
    const c = apply(mP, p);
    if (!g.isPointInPath(Q.sil, c[0], c[1], fr)) return false;
    if (qPath && !g.isPointInPath(qPath, c[0], c[1])) return false;
    if (outside.length) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const ok = outside.every((o2) => g.isPointInPath(o2, c[0], c[1], "evenodd"));
      g.setTransform(mQ);
      if (!ok) return false;
    }
    return true;
  };
  // test every 8th point; the points between are tested only where the result changes
  const n = pts.length, S = 8;
  const out: (boolean | undefined)[] = new Array(n);
  for (let i = 0; i < n; i += S) out[i] = test(pts[i]);
  for (let i = 0; i < n; i += S) {
    const j = i + S < n ? i + S : 0;
    const same = out[i] === out[j];
    for (let k = i + 1; k < Math.min(i + S, n); k++) out[k] = same ? out[i] : test(pts[k]);
  }
  return out as boolean[];
}

/** Optional outer outline: the union of all silhouettes, dilated, drawn behind everything. */
export function outerOutline(g: CanvasRenderingContext2D, W: number, H: number, view: Affine, items: DrawItem[], o: OutlineSettings) {
  if (o.hand) {
    // hand-drawn: a brush along every silhouette, drawn behind everything (the parts drawn
    // afterwards cover the inner half and every line inside the figure)
    const h = o.hand, seed = boilSeed(h, o.clock) + 3;
    g.save();
    g.strokeStyle = g.fillStyle = o.outerColor || "#4a5266";
    for (const it of items) {
      if (it.clip) continue;
      const m = mulAff(view, it.aff);
      g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      g.strokeStyle = lineFill(g, o.outerColor || "#4a5266", h, o.clock, m, view);
      if (!it.rings) { g.lineWidth = (2.6 * o.width) / scaleOf(it.aff); g.lineJoin = "round"; g.stroke(it.sil); continue; }
      const k = scaleOf(it.aff);
      for (const r of it.rings) strokeBrush(g, brushRing(r, k, o.width * 1.3, h, seed));
    }
    g.restore();
    return;
  }
  const off = makeCanvas(W, H);
  const c = off.getContext("2d")!;
  c.fillStyle = o.outerColor || "#4a5266";
  for (const it of items) {
    if (it.clip) continue;
    const m = mulAff(view, it.aff);
    c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    c.fill(it.sil, it.evenodd ? "evenodd" : "nonzero");
  }
  const r = Math.max(1, o.width * 1.3 * view[0]);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    g.drawImage(off, Math.cos(a) * r, Math.sin(a) * r);
  }
  g.restore();
}
