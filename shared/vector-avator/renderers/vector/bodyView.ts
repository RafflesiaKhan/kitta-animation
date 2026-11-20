// Turned body views for method V (docs/vector-parts.md §7, id056).
// A body turned more than 15 deg is not drawn by rotating the flat front parts any further;
// the renderer switches to a drawing of the body seen from about 30 deg (body30.json) and
// rotates that by the remaining -15..+15 deg. The head, hands and sleeves stay the front
// parts: the head parts are translated so that the head joint sits on the turned body's neck.
// The opposite direction uses the same drawing mirrored (with _L/_R swapped).
import type { ArmDef, ChainDef, Pt, VectorDoc, VPart } from "./vdata";
import { parsePath } from "./vdata";

export interface BodyViewDoc {
  format: string;
  character?: string;
  view?: string;
  /** angle of the drawing in degrees; + = the character turned to its left (screen right) */
  yaw: number;
  skeleton: Record<string, Pt>;
  parts: VPart[];
  chains?: ChainDef[];
  arms?: { L?: Partial<ArmDef>; R?: Partial<ArmDef> };
  /** optional full draw order (part ids of the composed character) */
  order?: string[];
}

export async function loadBodyView(url: string): Promise<BodyViewDoc | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    // the dev server answers unknown paths with index.html
    if (ct.includes("html")) return null;
    return (await res.json()) as BodyViewDoc;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- path / name helpers

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

/** Re-emit a path with every point mapped (absolute M/L/C/Z). */
export function mapPathD(d: string, f: (p: Pt) => Pt): string {
  const out: string[] = [];
  for (const c of parsePath(d)) {
    if (c.k === "M" || c.k === "L") { const p = f(c.p); out.push(`${c.k}${fmt(p[0])} ${fmt(p[1])}`); }
    else if (c.k === "C") { const [a, b, e] = c.p.map(f); out.push(`C${fmt(a[0])} ${fmt(a[1])} ${fmt(b[0])} ${fmt(b[1])} ${fmt(e[0])} ${fmt(e[1])}`); }
    else out.push("Z");
  }
  return out.join(" ");
}

/** Swap the character's own sides in an id / bone / skeleton key (_L <-> _R, left <-> right). */
export function swapSide(s: string): string {
  return s
    .replace(/_L(?=$|_)/g, "\u0001").replace(/_R(?=$|_)/g, "_L").replace(/\u0001/g, "_R")
    .replace(/^left/, "\u0002").replace(/^right/, "left").replace(/^\u0002/, "right");
}

function mapPart(p: VPart, f: (q: Pt) => Pt, rename: (s: string) => string = (s) => s): VPart {
  return {
    ...p,
    id: rename(p.id),
    bone: rename(p.bone),
    group: p.group ? rename(p.group) : p.group,
    clipTo: p.clipTo ? rename(p.clipTo) : p.clipTo,
    parent: p.parent ? rename(p.parent) : p.parent,
    seamlessWith: p.seamlessWith?.map(rename),
    pivot: f(p.pivot),
    shapes: p.shapes.map((s) => ({ ...s, d: mapPathD(s.d, f) })),
  };
}

function mapChain(c: ChainDef, f: (q: Pt) => Pt, rename: (s: string) => string = (s) => s): ChainDef {
  return { ...c, id: rename(c.id), bone: rename(c.bone), parts: c.parts.map(rename), root: f(c.root), tip: f(c.tip) };
}

/** The view drawn the other way round: mirrored about the hips and with the sides swapped. */
export function mirrorView(v: BodyViewDoc): BodyViewDoc {
  const cx = v.skeleton.hips[0];
  const f = (p: Pt): Pt => [2 * cx - p[0], p[1]];
  const skeleton: Record<string, Pt> = {};
  for (const [k, p] of Object.entries(v.skeleton)) skeleton[swapSide(k)] = f(p);
  const arms = v.arms ? { L: v.arms.R, R: v.arms.L } : undefined;
  const sw = (a?: Partial<ArmDef>) => (a?.attach ? { ...a, attach: swapSide(a.attach) } : a);
  return {
    ...v,
    yaw: -v.yaw,
    skeleton,
    parts: v.parts.map((p) => mapPart(p, f, swapSide)),
    chains: v.chains?.map((c) => mapChain(c, f, swapSide)),
    arms: arms ? { L: sw(arms.L), R: sw(arms.R) } : undefined,
    order: v.order?.map(swapSide),
  };
}

/** The view moved sideways by dx (drawing px). */
export function alignView(v: BodyViewDoc, dx: number): BodyViewDoc {
  const f = (p: Pt): Pt => [p[0] + dx, p[1]];
  const skeleton: Record<string, Pt> = {};
  for (const [k, p] of Object.entries(v.skeleton)) skeleton[k] = f(p);
  return { ...v, skeleton, parts: v.parts.map((p) => mapPart(p, f)), chains: v.chains?.map((c) => mapChain(c, f)) };
}

// ---------------------------------------------------------------- composition

const isHandOrSleeve = (p: VPart) => !!p.group && /^(hand|sleeve)_/.test(p.group);

/** Parts that turn with the head (bone head, or a spring chain hanging from the head). */
export function headPartIds(doc: VectorDoc): Set<string> {
  const headChains = new Set((doc.chains ?? []).filter((c) => c.bone === "head").map((c) => c.id));
  return new Set(doc.parts.filter((p) => p.bone === "head" || headChains.has(p.bone)).map((p) => p.id));
}

/** A complete character doc for a turned body view: the view's body parts, the front head
 *  (translated onto the view's neck), hands and sleeves, and a merged skeleton whose arm
 *  bones keep the front lengths. */
export function composeView(front: VectorDoc, view0: BodyViewDoc): VectorDoc {
  // The body turns about the vertical axis through the hips: the view is placed so that its
  // hips are on the front's axis (the references were aligned by the feet, which are off the
  // axis in a turned view, so the head would jump sideways at the switch).
  const ax = front.skeleton.hips[0] - view0.skeleton.hips[0];
  const view = ax ? alignView(view0, ax) : view0;
  const fs = front.skeleton, vs = view.skeleton;
  const d: Pt = [vs.head[0] - fs.head[0], vs.head[1] - fs.head[1]];
  const shift = (p: Pt): Pt => [p[0] + d[0], p[1] + d[1]];
  const heads = headPartIds(front);

  // skeleton: the view's body landmarks; arms keep the front lengths; the head moves by d
  const skeleton: Record<string, Pt> = { ...fs };
  for (const [k, p] of Object.entries(vs)) skeleton[k] = p;
  for (const s of ["L", "R"]) {
    const sh = vs[`shoulder_${s}`] ?? fs[`shoulder_${s}`];
    for (const j of ["elbow", "wrist"]) {
      const off: Pt = [fs[`${j}_${s}`][0] - fs[`shoulder_${s}`][0], fs[`${j}_${s}`][1] - fs[`shoulder_${s}`][1]];
      skeleton[`${j}_${s}`] = [sh[0] + off[0], sh[1] + off[1]];
    }
  }
  skeleton.head_center = shift(fs.head_center);

  // parts
  const kept = new Map<string, VPart>();
  for (const p of front.parts) {
    if (heads.has(p.id)) kept.set(p.id, mapPart(p, shift));
    else if (isHandOrSleeve(p)) kept.set(p.id, p);
  }
  const viewParts = new Map(view.parts.map((p) => [p.id, p]));
  let parts: VPart[];
  if (view.order?.length) {
    parts = view.order.map((id) => kept.get(id) ?? viewParts.get(id)).filter((p): p is VPart => !!p);
    // anything not listed keeps a sensible place: hands/sleeves are drawn with the arms anyway
    for (const p of front.parts) if (isHandOrSleeve(p) && !view.order.includes(p.id)) parts.push(p);
  } else {
    // the view's body parts fill the slots of the front body parts, in the view's order
    parts = [];
    let k = 0;
    for (const p of front.parts) {
      const keep = kept.get(p.id);
      if (keep) { parts.push(keep); continue; }
      if (k < view.parts.length) parts.push(view.parts[k++]);
    }
    while (k < view.parts.length) parts.push(view.parts[k++]);
  }

  // chains: head chains move with the head; body chains come from the view
  const vChains = new Map((view.chains ?? []).map((c) => [c.id, c]));
  const hipShift: Pt = [vs.hips[0] - fs.hips[0], vs.hips[1] - fs.hips[1]];
  const chains = (front.chains ?? []).map((c) => {
    if (c.bone === "head") return mapChain(c, shift);
    return vChains.get(c.id) ?? mapChain(c, (p) => [p[0] + hipShift[0], p[1] + hipShift[1]]);
  });
  for (const c of view.chains ?? []) if (!chains.some((x) => x.id === c.id)) chains.push(c);

  const arms = {
    L: { ...front.arms.L, ...(view.arms?.L ?? {}) } as ArmDef,
    R: { ...front.arms.R, ...(view.arms?.R ?? {}) } as ArmDef,
  };
  return { ...front, parts, skeleton, chains, arms };
}
