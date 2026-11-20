// Unit tests for method V (vector standing picture): skeleton, arm generation, paths,
// springs, colours and hand shapes in motions.
import { describe, expect, it } from "vitest";
import { VRig, len3 } from "../../../shared/vector-avator/renderers/vector/vrig";
import { buildArm } from "../../../shared/vector-avator/renderers/vector/arm";
import { parsePath, flatten, type VectorDoc } from "../../../shared/vector-avator/renderers/vector/vdata";
import { SpringChain } from "../../../shared/vector-avator/renderers/vector/spring";
import { deltaE, darken } from "../../../shared/vector-avator/renderers/vector/outline";
import { attachPlace, domeWeight, faceDisp, featurePlace, headReach, headShift, rimWeight, shellDisp, shellMap, type HeadFrame } from "../../../shared/vector-avator/renderers/vector/head";
import { parseMotion, samplePose } from "../../../shared/vector-avator/core/motion";
import { quatFromEulerDeg, type Quat } from "../../../shared/vector-avator/core/math";

const doc = {
  format: "so-chara-vector/1", character: "t", width: 1024, height: 1536, parts: [], expressions: {},
  skeleton: {
    hips: [512, 1150], chest: [512, 1000], neck: [512, 900], head: [512, 870], head_center: [512, 650], head_radius: [260, 230],
    shoulder_L: [610, 930], elbow_L: [670, 1030], wrist_L: [720, 1130],
    shoulder_R: [414, 930], elbow_R: [354, 1030], wrist_R: [304, 1130],
    hip_L: [560, 1150], hip_R: [464, 1150], ankle_L: [560, 1360], ankle_R: [464, 1360],
  },
  arms: {
    L: { width: { shoulder: 50, elbow: 40, wrist: 32 }, bands: [{ from: 0, to: 0.5, color: "#ffffff" }, { from: 0.5, to: 1, color: "#22305e" }], shade: { color: "#e2e4ea", side: "under", ratio: 0.3 } },
    R: { width: { shoulder: 50, elbow: 40, wrist: 32 }, bands: [{ from: 0, to: 1, color: "#ffffff" }], shade: { color: "#e2e4ea", side: "under" } },
  },
} as unknown as VectorDoc;

const P = (rig: VRig, n: string) => rig.world[n].pos;
const d3 = (a: number[], b: number[]) => len3([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);

describe("VRig (3D arm with fixed lengths, projected)", () => {
  const rig = new VRig(doc);
  const poses: Record<string, Quat>[] = [
    {}, // T-pose
    { leftUpperArm: quatFromEulerDeg(0, 0, -72), leftLowerArm: quatFromEulerDeg(0, 0, -5) },
    { leftUpperArm: quatFromEulerDeg(0, 35, -48), leftLowerArm: quatFromEulerDeg(0, -100, 0) }, // forward + bent
    { leftUpperArm: quatFromEulerDeg(10, 80, 20), leftLowerArm: quatFromEulerDeg(0, -60, 30), chest: quatFromEulerDeg(0, 25, 0) },
  ];
  it("keeps the upper arm and forearm lengths in 3D", () => {
    for (const bones of poses) {
      rig.solve({ bones, hips: [0, 0, 0] });
      expect(d3(P(rig, "leftUpperArm"), P(rig, "leftLowerArm"))).toBeCloseTo(rig.upperLen.L, 6);
      expect(d3(P(rig, "leftLowerArm"), P(rig, "leftHand"))).toBeCloseTo(rig.foreLen.L, 6);
    }
  });
  it("only shortens on screen (no rubber stretching)", () => {
    for (const bones of poses) {
      rig.solve({ bones, hips: [0, 0, 0] });
      const s = rig.screen("leftUpperArm").p, e = rig.screen("leftLowerArm").p, w = rig.screen("leftHand").p;
      expect(Math.hypot(e[0] - s[0], e[1] - s[1])).toBeLessThanOrEqual(rig.upperLen.L + 1e-6);
      expect(Math.hypot(w[0] - e[0], w[1] - e[1])).toBeLessThanOrEqual(rig.foreLen.L + 1e-6);
    }
  });
  it("puts the character's left arm on the screen right in the attention pose", () => {
    rig.solve({ bones: { leftUpperArm: quatFromEulerDeg(0, 0, -72), rightUpperArm: quatFromEulerDeg(0, 0, 72) }, hips: [0, 0, 0] });
    expect(rig.screen("leftHand").p[0]).toBeGreaterThan(512);
    expect(rig.screen("rightHand").p[0]).toBeLessThan(512);
    expect(rig.screen("leftHand").p[1]).toBeGreaterThan(rig.screen("leftUpperArm").p[1]); // hangs down
  });
  it("maps the rest pose of a bone to the identity", () => {
    rig.solve({ bones: {}, hips: [0, 0, 0] });
    const a = rig.boneAffine("chest");
    expect(a[0]).toBeCloseTo(1); expect(a[3]).toBeCloseTo(1); expect(a[4]).toBeCloseTo(0); expect(a[5]).toBeCloseTo(0);
  });
});

describe("buildArm", () => {
  const base = { upperLen: 116, foreLen: 112, def: doc.arms.L, towardBody: -1, depthGain: 0.001, curve: 0.035 };
  it("makes one silhouette with bands and a shade", () => {
    const g = buildArm({ ...base, S: [610, 930], E: [670, 1030], W: [720, 1130], zS: 0, zE: 0, zW: 0 });
    expect(g.silhouette.length).toBe(1);
    expect(g.bands.length).toBe(2);
    expect(g.shade.length).toBeGreaterThan(0);
    expect(g.parts.upper.silhouette.length).toBe(1);
  });
  it("gets thicker toward the viewer", () => {
    const area = (z: number) => {
      const g = buildArm({ ...base, S: [610, 930], E: [670, 1030], W: [720, 1130], zS: z, zE: z, zW: z });
      let a = 0;
      for (const ring of g.silhouette[0]) for (let i = 0; i + 1 < ring.length; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      return Math.abs(a / 2);
    };
    expect(area(150)).toBeGreaterThan(area(0));
    expect(area(-150)).toBeLessThan(area(0));
  });

  // nonzero winding of a point over all rings of a multipolygon (how the canvas fills a path)
  const winding = (mp: number[][][][], x: number, y: number) => {
    let wn = 0;
    for (const poly of mp) for (const r of poly) for (let i = 0; i + 1 < r.length; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[i + 1];
      const c = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0);
      if (y0 <= y && y1 > y && c > 0) wn++;
      else if (y0 > y && y1 <= y && c < 0) wn--;
    }
    return wn;
  };
  // grid points inside `sil` that no band covers (the base colour would show there)
  const gaps = (sil: number[][][][], bands: { poly: number[][][][] }[]) => {
    let n = 0;
    const xs = sil.flat(2).map((p) => p[0]), ys = sil.flat(2).map((p) => p[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1.5) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1.5) {
      if (winding(sil, x, y) === 0) continue;
      if (!bands.some((b) => winding(b.poly, x, y) !== 0)) n++;
    }
    return n;
  };
  // usamiku-like bands: white / cyan on the upper arm, navy across the elbow, cyan cuff
  const sleeve = { ...doc.arms.L, width: { shoulder: 80, elbow: 80, wrist: 92 }, bands: [
    { from: 0, to: 0.21, color: "#ffffff" }, { from: 0.21, to: 0.375, color: "#7bdbdb" },
    { from: 0.375, to: 0.875, color: "#314576" }, { from: 0.875, to: 1, color: "#7bdbdb" }] };
  const poses: Record<string, { S: [number, number]; E: [number, number]; W: [number, number]; zS: number; zE: number; zW: number }> = {
    straight: { S: [432, 698], E: [400, 810], W: [380, 930], zS: 0, zE: 0, zW: 0 },
    // upper arm toward the viewer, forearm across the chest (motion "reach")
    reach: { S: [432, 698], E: [406, 711], W: [521, 718], zS: 0, zE: 148, zW: 244 },
    // forearm folded up to the chin (motion "think")
    think: { S: [432, 698], E: [364, 813], W: [342, 666], zS: 0, zE: 68, zW: 90 },
    // forearm raised to the side (motion "explain")
    explain: { S: [432, 698], E: [344, 810], W: [263, 691], zS: -8, zE: 41, zW: 85 },
  };
  for (const [name, p] of Object.entries(poses)) {
    it(`leaves no gap in the colour bands (${name})`, () => {
      const g = buildArm({ ...base, def: sleeve, upperLen: 106, foreLen: 98, ...p });
      expect(gaps(g.silhouette, g.bands)).toBe(0);
      // as separate pieces (upper arm behind the body, forearm in front)
      expect(gaps(g.parts.upper.silhouette, g.parts.upper.bands)).toBe(0);
      expect(gaps(g.parts.fore.silhouette, g.parts.fore.bands)).toBe(0);
    });
  }
  it("bows band boundaries toward the far end on a segment that points at the viewer", () => {
    // upper arm hanging straight down; its elbow end comes toward the viewer when zE > 0
    const top = (zE: number) => {
      const g = buildArm({ ...base, def: sleeve, upperLen: 106, foreLen: 98, S: [400, 700], E: [400, 760], W: [400, 860], zS: 0, zE, zW: zE });
      const navy = g.parts.upper.bands.find((b) => b.color === "#314576")!;
      // top of the navy band on the centre line (x = 400)
      return Math.min(...navy.poly.flat(2).filter((p) => Math.abs(p[0] - 400) < 3).map((p) => p[1]));
    };
    expect(top(0)).toBeGreaterThan(top(80) + 10); // flat: straight cut; toward the viewer: bows up (toward the shoulder)
  });
  it("gives each piece only its own segment's bands", () => {
    const g = buildArm({ ...base, def: sleeve, upperLen: 106, foreLen: 98, ...poses.think });
    expect(g.parts.upper.bands.map((b) => b.color)).toEqual(["#ffffff", "#7bdbdb", "#314576"]);
    expect(g.parts.fore.bands.map((b) => b.color)).toEqual(["#314576", "#7bdbdb"]);
  });
});

describe("paths", () => {
  it("parses relative and quadratic commands", () => {
    const c = parsePath("M 10 10 l 10 0 q 10 0 10 10 Z");
    expect(c.map((x) => x.k)).toEqual(["M", "L", "C", "Z"]);
    const r = flatten(c, 4);
    expect(r[0][r[0].length - 1][0]).toBeCloseTo(30);
    expect(r[0][r[0].length - 1][1]).toBeCloseTo(20);
  });
});

describe("springs", () => {
  const def = { id: "ear_L", bone: "head", parts: [], root: [600, 400] as [number, number], tip: [650, 100] as [number, number], segments: 4, stiffness: 0.5, damping: 0.3, gravity: 0.2 };
  const run = () => {
    const c = new SpringChain(def);
    for (let i = 0; i <= 60; i++) { const t = i / 30; c.step(i ? 1 / 30 : 0, [600 + 80 * Math.sin(t * 6), 400], 0.1 * Math.sin(t * 4)); }
    return c.state.th.slice();
  };
  it("is reproducible", () => { expect(run()).toEqual(run()); });
  it("stays at rest without motion", () => {
    const c = new SpringChain(def);
    for (let i = 0; i < 30; i++) c.step(i ? 1 / 30 : 0, [600, 400], 0);
    for (const v of c.state.th) expect(Math.abs(v)).toBeLessThan(1e-9);
  });
  it("lags behind a sideways jerk", () => {
    const c = new SpringChain(def);
    c.step(0, [600, 400], 0); c.step(1 / 30, [600, 400], 0); c.step(1 / 30, [640, 400], 0);
    expect(c.state.th[0]).toBeLessThan(0); // moving right: the upward ear tips to the left (counter-clockwise)
  });
});

describe("colours", () => {
  it("treats white and off-white as similar, white and navy as different", () => {
    expect(deltaE("#ffffff", "#f6f4f2")).toBeLessThan(16);
    expect(deltaE("#ffffff", "#22305e")).toBeGreaterThan(16);
  });
  it("darkens white into a light grey line", () => {
    const d = darken("#ffffff", 0.2);
    expect(d).not.toBe("#ffffff");
    expect(parseInt(d.slice(1, 3), 16)).toBeGreaterThan(150);
  });
});

describe("head turn (Live2D-style deformation of the front drawing)", () => {
  const yaw = (30 * Math.PI) / 180;
  const h: HeadFrame = { c: [512, 650], r: [260, 230], yaw, pitch: 0, reach: [340, 380, 300] };
  it("moves features toward the turn and squeezes the turning side", () => {
    const near = featurePlace(h, 0.75, [612, 650], 50), far = featurePlace(h, 0.75, [412, 650], 50);
    expect(near.c[0]).toBeGreaterThan(612);
    expect(far.c[0]).toBeGreaterThan(412);
    expect(near.sx).toBeLessThan(1);
    expect(far.sx).toBeGreaterThan(near.sx);
    // mirrored for the other direction
    const m = featurePlace({ ...h, yaw: -yaw }, 0.75, [412, 650], 50);
    expect(m.c[0] - 412).toBeCloseTo(-(near.c[0] - 612), 6);
    expect(m.sx).toBeCloseTo(near.sx, 6);
  });
  it("keeps a feature inside the face outline (same field for both)", () => {
    const edge: [number, number] = [512 + 250, 650];
    const pl = featurePlace(h, 0.75, [512 + 190, 650], 50);
    const s = headShift(h);
    expect(pl.c[0] + 50 * pl.sx).toBeLessThan(edge[0] + faceDisp(h, 0.75, edge)[0] + s[0]);
  });
  it("is the identity at yaw 0 and pitch 0", () => {
    const h0 = { ...h, yaw: 0 };
    const q = shellMap(h0, 0.85)([600, 500]), f = shellMap(h0, 0.6, true)([600, 500]);
    expect(q[0]).toBeCloseTo(600); expect(q[1]).toBeCloseTo(500);
    expect(f[0]).toBeCloseTo(600); expect(f[1]).toBeCloseTo(500);
    const pl = featurePlace(h0, 0.75, [600, 600], 40);
    expect(pl.c[0]).toBeCloseTo(600); expect(pl.sx).toBeCloseTo(1); expect(pl.sy).toBeCloseTo(1);
    const at = attachPlace(h0, -0.04, [700, 400]);
    expect(at.d[0]).toBeCloseTo(0); expect(at.sx).toBeCloseTo(1);
  });
  it("turns the hair shell at the centre and leaves its rim on the head", () => {
    const s = headShift(h)[0];
    expect(shellDisp(h, 0.85, [512, 700])[0]).toBeCloseTo(0.85 * 260 * Math.sin(yaw), 6);
    expect(shellDisp(h, 0.85, [512 + 340, 700])[0]).toBeCloseTo(0, 6);
    expect(shellDisp(h, 0.85, [512 + 400, 700])[0]).toBeCloseTo(0, 6); // beyond the rim
    expect(s).toBeGreaterThan(0);
    // the crown moves less than the face rows
    expect(shellDisp(h, 0.85, [512, 300])[0]).toBeLessThan(shellDisp(h, 0.85, [512, 700])[0]);
    // back hair slides the other way as a whole
    expect(shellDisp(h, -0.2, [400, 700])[0]).toBeCloseTo(-0.2 * 260 * Math.sin(yaw), 6);
  });
  it("never folds: the hair shell and the face stay monotonic across a row", () => {
    for (const face of [false, true]) for (const y of [350, 650, 850]) {
      const m = shellMap(h, face ? 0.75 : 0.85, face);
      let last = -Infinity;
      for (let x = 100; x <= 924; x += 4) {
        const nx = m([x, y])[0];
        expect(nx).toBeGreaterThan(last);
        last = nx;
      }
    }
  });
  it("narrows the ear on the turning side and widens the other, roots close in", () => {
    const l = attachPlace(h, -0.04, [512 + 200, 380]), r = attachPlace(h, -0.04, [512 - 200, 380]);
    expect(l.sx).toBeLessThan(1);
    expect(r.sx).toBeGreaterThan(1);
    expect(l.d[0]).toBeLessThan(r.d[0]); // the gap between the roots shrinks
  });
  it("moves up when looking up; rim weights are 0 at the rim", () => {
    const up = { ...h, yaw: 0, pitch: (15 * Math.PI) / 180 };
    expect(featurePlace(up, 0.75, [512, 650], 40).c[1]).toBeLessThan(650);
    expect(shellDisp(up, 0.85, [512, 650])[1]).toBeLessThan(0);
    expect(rimWeight(1)).toBe(0); expect(rimWeight(0)).toBe(1);
    expect(domeWeight(0.5, 0.35)).toBe(1); expect(domeWeight(-1, 0.35)).toBeCloseTo(0.35);
  });
  it("measures the rim of the whole head from its fixed parts", () => {
    const r = headReach([512, 650], [260, 230], [[200, 300, 800, 900]], 0);
    expect(r).toEqual([312, 350, 250]);
  });
});

describe("hand shapes in motions", () => {
  it("holds the last hand shape (step)", () => {
    const m = parseMotion({ name: "h", duration: 2, keys: [{ t: 0, hands: { R: "open" } }, { t: 1, hands: { R: "point" } }] });
    expect(samplePose(m, 0.5).hands?.R).toBe("open");
    expect(samplePose(m, 1.2).hands?.R).toBe("point");
  });
  it("leaves motions without hands unchanged", () => {
    const m = parseMotion({ name: "n", duration: 1, keys: [{ t: 0, bones: { head: [0, 0, 0] } }] });
    expect(samplePose(m, 0.5).hands).toBeUndefined();
  });
});
