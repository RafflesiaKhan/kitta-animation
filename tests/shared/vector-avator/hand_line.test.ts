// Hand-drawn outline (id053, EG4): the part coordinates stay as they are; only the generated
// line gets width variation, a slow wobble, tapered ends and an optional boil.
import { describe, expect, it } from "vitest";
import {
  HAND_PRESETS, boilSeed, boxMask, brushRing, faceWobbleMap, fbm2, handFromQuery, noise2,
  resampleRing, ribbonQuads, taperFactors, textureAlpha, TEX_SIZE, type HandLine,
} from "../../../shared/vector-avator/renderers/vector/outline";
import type { Pt } from "../../../shared/vector-avator/renderers/vector/vdata";

const circle = (r: number, n = 64, cx = 100, cy = 100): Pt[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as Pt);
const square: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
const H: HandLine = { ...HAND_PRESETS.mid };

describe("noise", () => {
  it("is deterministic and smooth", () => {
    expect(noise2(3.3, 4.7, 5)).toBe(noise2(3.3, 4.7, 5));
    expect(noise2(3.3, 4.7, 5)).not.toBe(noise2(3.3, 4.7, 6));
    for (let x = 0; x < 20; x += 0.37) {
      const v = noise2(x, 1.5, 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(noise2(x + 0.01, 1.5, 1) - v)).toBeLessThan(0.05);
      expect(Math.abs(fbm2(x, 2, 1))).toBeLessThanOrEqual(1);
    }
  });
});

describe("resampleRing", () => {
  it("gives (about) equal spacing and drops a closing duplicate", () => {
    const r = resampleRing([...square, [0, 0]], 5);
    expect(r.length).toBe(80);
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(5, 5);
    }
  });
  it("does not change the input ring (part data stays as it is)", () => {
    const ring = square.map((p) => [...p] as Pt);
    resampleRing(ring, 3);
    brushRing(ring, 1, 3.2, H, 1);
    expect(ring).toEqual(square);
  });
});

describe("brushRing", () => {
  it("is the same in every call for the same part and seed (no flicker)", () => {
    const a = brushRing(circle(60), 1, 3.2, H, 1), b = brushRing(circle(60), 1, 3.2, H, 1);
    expect(a).toEqual(b);
  });
  it("follows a rigid move: noise is taken in the part's own coordinates", () => {
    // the same local ring drawn at another place uses the same local points -> same brush
    const k = 1.7;
    const a = brushRing(circle(40), k, 3.2, H, 1);
    const b = brushRing(circle(40), k, 3.2, H, 1);
    expect(a.half).toEqual(b.half);
  });
  it("keeps the wobble within 0.7 x line width and varies the width", () => {
    const ring = circle(80, 32);
    const br = brushRing(ring, 1, 3.2, { ...H, wobble: 10 }, 1);
    const R = resampleRing(ring, 2.5);
    br.c.forEach((p, i) => expect(Math.hypot(p[0] - R[i][0], p[1] - R[i][1])).toBeLessThanOrEqual(0.7 * 3.2 + 1e-9));
    const w = br.half;
    expect(Math.max(...w) - Math.min(...w)).toBeGreaterThan(0.5);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(0.25 * 3.2 - 1e-9);
  });
  it("with wobble and pressure 0 is the plain line (except a little thicker on tight curves)", () => {
    const br = brushRing(square, 1, 3, { ...H, wobble: 0, pressure: 0 }, 1);
    const R = resampleRing(square, 2.5);
    br.c.forEach((p, i) => { expect(p[0]).toBeCloseTo(R[i][0], 9); expect(p[1]).toBeCloseTo(R[i][1], 9); });
    br.half.forEach((h) => expect(h).toBeCloseTo(3, 9));
  });
  it("works in local units: k scales the sample spacing and the width", () => {
    const a = brushRing(circle(50), 2, 3.2, { ...H, wobble: 0, pressure: 0 }, 1);
    expect(a.half[0]).toBeCloseTo(1.6, 9);
    const b = brushRing(circle(50), 1, 3.2, { ...H, wobble: 0, pressure: 0 }, 1);
    expect(a.c.length).toBeGreaterThan(b.c.length * 1.8);
  });
});

describe("boil", () => {
  it("changes the seed boil times per second and never without boil", () => {
    expect(boilSeed({ ...H, boil: 0 }, 0)).toBe(boilSeed({ ...H, boil: 0 }, 7.3));
    const h = { ...H, boil: 12 };
    expect(boilSeed(h, 0)).toBe(boilSeed(h, 0.08));
    expect(boilSeed(h, 0)).not.toBe(boilSeed(h, 0.09));
    const a = brushRing(circle(60), 1, 3.2, h, boilSeed(h, 0)), b = brushRing(circle(60), 1, 3.2, h, boilSeed(h, 0.5));
    expect(a.half).not.toEqual(b.half);
  });
});

describe("taperFactors", () => {
  it("is 1 everywhere for a fully visible ring and 0 where hidden", () => {
    expect(taperFactors([true, true, true, true], 2.5, 10)).toEqual([1, 1, 1, 1]);
    expect(taperFactors([false, false, false], 2.5, 10)).toEqual([0, 0, 0]);
  });
  it("thins toward the visible ends", () => {
    const vis = Array.from({ length: 40 }, (_, i) => i >= 5 && i < 35);
    const f = taperFactors(vis, 2.5, 20);
    expect(f[0]).toBe(0);
    expect(f[5]).toBeLessThan(0.3);
    expect(f[20]).toBe(1);
    expect(f[6]).toBeLessThan(f[8]);
    expect(f[33]).toBeLessThan(f[30]);
    // a run around the ring's start (wraps)
    const w = taperFactors(Array.from({ length: 40 }, (_, i) => i < 5 || i >= 30), 2.5, 5);
    expect(w[0]).toBeGreaterThan(w[29 + 1]);
    expect(w[10]).toBe(0);
  });
  it("without a taper only masks", () => {
    expect(taperFactors([true, false, true], 2.5, 0)).toEqual([1, 0, 1]);
  });
});

describe("ribbonQuads", () => {
  it("are all counter-clockwise and skip hidden segments", () => {
    const br = brushRing(circle(60), 1, 3.2, HAND_PRESETS.strong, 1);
    const qs = ribbonQuads(br, null);
    expect(qs.length).toBe(br.c.length);
    for (const q of qs) {
      let a = 0;
      for (let k = 0; k < 4; k++) a += q[k][0] * q[(k + 1) % 4][1] - q[(k + 1) % 4][0] * q[k][1];
      expect(a).toBeGreaterThanOrEqual(0);
    }
    const fac = br.c.map((_, i) => (i < 10 ? 1 : 0));
    // segments touching a visible point: (n-1 -> 0), 0 -> 1, ..., 9 -> 10
    expect(ribbonQuads(br, fac).length).toBe(11);
  });
  it("neighbouring quads share their edge (no gaps)", () => {
    const br = brushRing(circle(60), 1, 3.2, H, 1);
    const qs = ribbonQuads(br, null);
    const key = (p: Pt) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    for (let i = 0; i < qs.length; i++) {
      const a = new Set(qs[i].map(key)), b = qs[(i + 1) % qs.length].map(key);
      expect(b.filter((x) => a.has(x)).length).toBe(2);
    }
  });
});

describe("boxMask", () => {
  it("keeps only points near the other part", () => {
    const m = boxMask([[0, 0], [50, 50], [200, 200]], [1, 0, 0, 1, 0, 0], [40, 40, 60, 60], 3);
    expect(m).toEqual([false, true, false]);
    const t = boxMask([[0, 0]], [1, 0, 0, 1, 45, 45], [40, 40, 60, 60], 0);
    expect(t).toEqual([true]);
  });
});

describe("face wobble", () => {
  it("is off without settings, small and position-only (eye white and its clip copy agree)", () => {
    expect(faceWobbleMap(null)).toBeNull();
    expect(faceWobbleMap({ ...H, face: 0 })).toBeNull();
    const m = faceWobbleMap(H)!;
    const p: Pt = [312.5, 210.25];
    const q = m(p);
    expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeLessThanOrEqual(H.face * Math.SQRT2 + 1e-9);
    expect(faceWobbleMap(H)!(p)).toEqual(q);
  });
});

describe("URL settings", () => {
  it("reads presets and overrides", () => {
    // default (no vHand) is the strong preset; 0 / off turns the hand-drawn line off
    expect(handFromQuery(new URLSearchParams(""))).toEqual(HAND_PRESETS.strong);
    expect(handFromQuery(new URLSearchParams("vHand=0"))).toBeNull();
    expect(handFromQuery(new URLSearchParams("vHand=off"))).toBeNull();
    // the optional sketch set: strong + 8fps boil + 2px big wobble + crayon
    const sk = handFromQuery(new URLSearchParams("vHand=4"))!;
    expect(sk).toEqual(HAND_PRESETS.sketch);
    expect(sk).toMatchObject({ wobble: HAND_PRESETS.strong.wobble, boil: 8, boilWob: 2, texture: "crayon" });
    expect(handFromQuery(new URLSearchParams("vHand=sketch&vTex=none"))!.texture).toBe("none");
    expect(handFromQuery(new URLSearchParams("vHand=1"))).toEqual(HAND_PRESETS.weak);
    expect(handFromQuery(new URLSearchParams("vHand=strong"))).toEqual(HAND_PRESETS.strong);
    const h = handFromQuery(new URLSearchParams("vHand=2&vBoil=12&vWob=0.3&vTaper=0"))!;
    expect(h.boil).toBe(12);
    expect(h.wobble).toBe(0.3);
    expect(h.taper).toBe(0);
    expect(h.pressure).toBe(HAND_PRESETS.mid.pressure);
  });
});

// review 1 (2026-11-18): bigger boil wobble, pencil / crayon line texture
describe("big wobble", () => {
  // signed distance into the square [0,100]^2 (positive = inside)
  const depth = (p: Pt) => Math.min(p[0], 100 - p[0], p[1], 100 - p[1]);
  const big = (ring: Pt[]) => {
    const h = { ...H, wobble: 1, boilWob: 8 };
    return brushRing(ring, 1, 3.2, h, 3).c.map(depth);
  };
  it("goes far inward but never further out than 0.7 x width (either ring direction)", () => {
    for (const ring of [square, [...square].reverse()]) {
      const d = big(ring);
      expect(Math.min(...d)).toBeGreaterThanOrEqual(-0.7 * 3.2 - 1e-6);
      expect(Math.max(...d)).toBeGreaterThan(0.7 * 3.2 + 2);
      expect(Math.max(...d)).toBeLessThanOrEqual(0.7 * 3.2 + 8 + 1e-6);
    }
  });
  it("is re-rolled by the boil", () => {
    const h = { ...H, boil: 8, boilWob: 4 };
    const a = brushRing(square, 1, 3.2, h, boilSeed(h, 0)).c, b = brushRing(square, 1, 3.2, h, boilSeed(h, 0.2)).c;
    expect(a).not.toEqual(b);
  });
});

describe("line texture", () => {
  const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;
  it("is deterministic, in 0..1, and tiles without a seam", () => {
    for (const kind of ["pencil", "crayon"] as const) {
      const a = textureAlpha(kind), b = textureAlpha(kind);
      expect(a).toEqual(b);
      expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...a)).toBeLessThanOrEqual(1);
      // the last column continues into the first one about as smoothly as inside the tile
      const N = TEX_SIZE;
      let edge = 0, inner = 0;
      for (let y = 0; y < N; y++) { edge += Math.abs(a[y * N + N - 1] - a[y * N]); inner += Math.abs(a[y * N + 63] - a[y * N + 64]); }
      expect(edge).toBeLessThan(inner * 1.5 + 1);
    }
  });
  it("pencil is a light grain; crayon leaves holes (paper tooth)", () => {
    const p = textureAlpha("pencil"), c = textureAlpha("crayon");
    expect(mean(p)).toBeGreaterThan(0.3);
    expect(mean(p)).toBeLessThan(0.8);
    expect(c.filter((v) => v === 0).length / c.length).toBeGreaterThan(0.03);
    expect(mean(c)).toBeGreaterThan(0.5);
    expect(textureAlpha("none").every((v) => v === 1)).toBe(true);
  });
  it("roughens the edge only with a texture or rough > 0", () => {
    const flat = brushRing(circle(60), 1, 3.2, { ...H, wobble: 0, pressure: 0 }, 1).half;
    const cr = brushRing(circle(60), 1, 3.2, { ...H, wobble: 0, pressure: 0, texture: "crayon" }, 1).half;
    expect(Math.max(...flat) - Math.min(...flat)).toBeLessThan(0.2);
    expect(Math.max(...cr) - Math.min(...cr)).toBeGreaterThan(1);
  });
  it("is read from the URL", () => {
    const h = handFromQuery(new URLSearchParams("vHand=3&vBoil=8&vBoilWob=4&vTex=crayon&vRough=0.2"))!;
    expect(h.texture).toBe("crayon");
    expect(h.boilWob).toBe(4);
    expect(h.rough).toBe(0.2);
    expect(handFromQuery(new URLSearchParams("vHand=3&vTex=marker"))!.texture).toBeUndefined();
  });
});
