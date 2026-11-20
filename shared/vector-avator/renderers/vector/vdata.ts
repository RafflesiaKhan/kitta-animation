// vector.json (docs/vector-parts.md) types, loading and path helpers for method V.
// Paths are parsed once into absolute M/L/C/Z commands so they can be re-emitted with any
// point mapping (affine for rigid parts, per-point for springs and the head shell).

export type Pt = [number, number];

export interface VShape { name: string; d: string; fill: string | null }
export interface VPart {
  id: string; label: string; parent: string | null; pivot: Pt; visible: boolean; coverage: string;
  bone: string; layer: string; group?: string; variants?: string[]; clipTo?: string; color?: string;
  /** false: no automatic outline on this part; seamlessWith: no line against these parts/groups */
  outline?: boolean; seamlessWith?: string[];
  shapes: VShape[];
}
export interface ArmDef {
  width: { shoulder: number; elbow: number; wrist: number };
  bands: { from: number; to: number; color: string }[];
  shade: { color: string; side: "under" | "over" | "front" | "back"; ratio?: number };
  attach?: string;
  /** true: the hand joins the arm without a wrist line */
  seamlessHand?: boolean;
}
export interface ChainDef {
  id: string; bone: string; parts: string[]; root: Pt; tip: Pt; segments: number;
  stiffness: number; damping: number; gravity: number;
  /** reaction to motion relative to the other chains (default 1) */
  gain?: number;
}
export interface VectorDoc {
  format: string; character: string; width: number; height: number;
  parts: VPart[];
  skeleton: Record<string, Pt>;
  arms: { L: ArmDef; R: ArmDef };
  chains?: ChainDef[];
  parallax?: Record<string, number>;
  /** head-turn tunables (head.ts HeadTurn) and the rim of the whole head [half width, up, down] */
  headTurn?: Partial<Record<string, number>> & { reach?: [number, number, number] };
  expressions: Record<string, Record<string, string>>;
}

export type Cmd = { k: "M" | "L"; p: Pt } | { k: "C"; p: [Pt, Pt, Pt] } | { k: "Z" };

export function parsePath(d: string): Cmd[] {
  const tok = d.match(/[MmLlHhVvCcQqSsTtZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: Cmd[] = [];
  let i = 0, cmd = "", cx = 0, cy = 0, sx = 0, sy = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        cx = ox + num(); cy = oy + num(); sx = cx; sy = cy;
        out.push({ k: "M", p: [cx, cy] });
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": cx = ox + num(); cy = oy + num(); out.push({ k: "L", p: [cx, cy] }); break;
      case "H": cx = (rel ? cx : 0) + num(); out.push({ k: "L", p: [cx, cy] }); break;
      case "V": cy = (rel ? cy : 0) + num(); out.push({ k: "L", p: [cx, cy] }); break;
      case "C": {
        const a: Pt = [ox + num(), oy + num()], b: Pt = [ox + num(), oy + num()], c: Pt = [ox + num(), oy + num()];
        out.push({ k: "C", p: [a, b, c] }); cx = c[0]; cy = c[1];
        break;
      }
      case "Q": {
        const q: Pt = [ox + num(), oy + num()], c: Pt = [ox + num(), oy + num()];
        const a: Pt = [cx + (2 / 3) * (q[0] - cx), cy + (2 / 3) * (q[1] - cy)];
        const b: Pt = [c[0] + (2 / 3) * (q[0] - c[0]), c[1] + (2 / 3) * (q[1] - c[1])];
        out.push({ k: "C", p: [a, b, c] }); cx = c[0]; cy = c[1];
        break;
      }
      case "Z": out.push({ k: "Z" }); cx = sx; cy = sy; break;
      default: throw new Error(`unsupported path command ${cmd} in ${d.slice(0, 40)}`);
    }
  }
  return out;
}

export type MapFn = (p: Pt) => Pt;

/** Emit commands into a Path2D (or a CanvasRenderingContext2D path) with an optional point map. */
export function emitPath(cmds: Cmd[], f?: MapFn, path: Path2D = new Path2D()): Path2D {
  const m = f ?? ((p: Pt) => p);
  for (const c of cmds) {
    if (c.k === "M") { const p = m(c.p); path.moveTo(p[0], p[1]); }
    else if (c.k === "L") { const p = m(c.p); path.lineTo(p[0], p[1]); }
    else if (c.k === "C") { const a = m(c.p[0]), b = m(c.p[1]), e = m(c.p[2]); path.bezierCurveTo(a[0], a[1], b[0], b[1], e[0], e[1]); }
    else path.closePath();
  }
  return path;
}

/** Flatten to closed polylines (one per subpath). */
export function flatten(cmds: Cmd[], steps = 8, f?: MapFn): Pt[][] {
  const m = f ?? ((p: Pt) => p);
  const rings: Pt[][] = [];
  let cur: Pt[] = [];
  let last: Pt = [0, 0];
  for (const c of cmds) {
    if (c.k === "M") { if (cur.length > 2) rings.push(cur); cur = [m(c.p)]; last = c.p; }
    else if (c.k === "L") { cur.push(m(c.p)); last = c.p; }
    else if (c.k === "C") {
      const [a, b, e] = c.p;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps, u = 1 - t;
        const x = u * u * u * last[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * e[0];
        const y = u * u * u * last[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * e[1];
        cur.push(m([x, y]));
      }
      last = e;
    } else { if (cur.length > 2) rings.push(cur); cur = []; }
  }
  if (cur.length > 2) rings.push(cur);
  return rings;
}

export function bbox(rings: Pt[][]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

export interface LoadedPart extends VPart {
  cmds: Cmd[][];            // per shape
  fills: (string | null)[];
  baseColor: string;
  rings: Pt[][];            // flattened outline of all shapes (rest pose, canvas coords)
  box: [number, number, number, number];
}

export interface LoadedVector { doc: VectorDoc; parts: LoadedPart[]; byId: Record<string, LoadedPart> }

export async function loadVector(url: string): Promise<LoadedVector> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`vector data not found: ${url}`);
  return prepareVector((await res.json()) as VectorDoc);
}

export function prepareVector(doc: VectorDoc): LoadedVector {
  const parts: LoadedPart[] = doc.parts.map((p) => {
    const cmds = p.shapes.map((s) => parsePath(s.d));
    const rings = cmds.flatMap((c) => flatten(c, 6));
    return { ...p, cmds, fills: p.shapes.map((s) => s.fill), baseColor: p.color ?? p.shapes.find((s) => s.fill)?.fill ?? "#ffffff", rings, box: bbox(rings) };
  });
  return { doc, parts, byId: Object.fromEntries(parts.map((p) => [p.id, p])) };
}

/** Affine map [a, b, c, d, e, f] as in CanvasRenderingContext2D.setTransform. */
export type Affine = [number, number, number, number, number, number];
export const IDENT: Affine = [1, 0, 0, 1, 0, 0];
export function apply(m: Affine, p: Pt): Pt { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
export function mulAff(m: Affine, n: Affine): Affine {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
export function rotAbout(c: Pt, ang: number, scale = 1): Affine {
  const co = Math.cos(ang) * scale, si = Math.sin(ang) * scale;
  return [co, si, -si, co, c[0] - co * c[0] + si * c[1], c[1] - si * c[0] - co * c[1]];
}
export function translate(dx: number, dy: number): Affine { return [1, 0, 0, 1, dx, dy]; }
