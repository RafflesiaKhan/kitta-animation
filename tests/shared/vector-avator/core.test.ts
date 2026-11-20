import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { quatFromEulerDeg, quatMul, quatAngleDeg, IDENTITY, type Quat, type Vec3 } from "../../../shared/vector-avator/core/math";
import { parsePose, getRotation } from "../../../shared/vector-avator/core/pose";
import { parseMotion, samplePose, sampleFace, quantize } from "../../../shared/vector-avator/core/motion";
import { composePose, faceRotation } from "../../../shared/vector-avator/core/compose";
import { DEFAULT_FACE } from "../../../shared/vector-avator/core/face";

function rotate(q: Quat, v: Vec3): Vec3 {
  const p: Quat = [v[0], v[1], v[2], 0];
  const c: Quat = [-q[0], -q[1], -q[2], q[3]];
  const r = quatMul(quatMul(q, p), c);
  return [r[0], r[1], r[2]];
}
const close = (a: Vec3, b: Vec3, eps = 1e-6) => a.every((x, i) => Math.abs(x - b[i]) < eps);

describe("math conventions", () => {
  it("positive Z rotation lowers the right arm (-X) and negative lowers the left (+X)", () => {
    const r = rotate(quatFromEulerDeg(0, 0, 90), [-1, 0, 0]);
    expect(close(r, [0, -1, 0])).toBe(true);
    const l = rotate(quatFromEulerDeg(0, 0, -90), [1, 0, 0]);
    expect(close(l, [0, -1, 0])).toBe(true);
  });
  it("face yaw + turns forward (+Z) toward the character's left (+X)", () => {
    const f = rotate(faceRotation(90, 0, 0), [0, 0, 1]);
    expect(close(f, [1, 0, 0])).toBe(true);
  });
  it("face pitch + looks up", () => {
    const f = rotate(faceRotation(0, 90, 0), [0, 0, 1]);
    expect(close(f, [0, 1, 0])).toBe(true);
  });
  it("face roll + tilts the head top toward the left (+X)", () => {
    const f = rotate(faceRotation(0, 0, 90), [0, 1, 0]);
    expect(close(f, [1, 0, 0])).toBe(true);
  });
});

describe("pose json", () => {
  it("parses the sample poses", () => {
    for (const n of ["tpose", "attention", "raise_hand"]) {
      const p = parsePose(JSON.parse(readFileSync(`shared/vector-avator/poses/${n}.json`, "utf8")));
      expect(p.hips).toEqual([0, 0, 0]);
    }
  });
  it("rejects unknown bones", () => {
    expect(() => parsePose({ bones: { leftWing: [0, 0, 0] } })).toThrow();
  });
});

describe("motion sampling", () => {
  const m = parseMotion({
    name: "t", duration: 2, loop: true,
    keys: [
      { t: 0, ease: "linear", bones: { leftUpperArm: [0, 0, 0] }, face: { mouth: "sil" } },
      { t: 1, ease: "linear", bones: { leftUpperArm: [0, 0, -80] }, face: { mouth: "a", yaw: 30 } },
      { t: 2, bones: { leftUpperArm: [0, 0, 0] } },
    ],
  });
  it("interpolates bones linearly", () => {
    const p = samplePose(m, 0.5);
    expect(quatAngleDeg(getRotation(p, "leftUpperArm"), quatFromEulerDeg(0, 0, -40))).toBeLessThan(1e-4);
  });
  it("loops", () => {
    const a = samplePose(m, 0.25), b = samplePose(m, 2.25);
    expect(quatAngleDeg(getRotation(a, "leftUpperArm"), getRotation(b, "leftUpperArm"))).toBeLessThan(1e-4);
  });
  it("quantizes body time for limited animation", () => {
    expect(quantize(0.49, 12)).toBeCloseTo(5 / 12);
    const p = samplePose(m, 0.49, { bodyFps: 2 });
    expect(quatAngleDeg(getRotation(p, "leftUpperArm"), IDENTITY)).toBeLessThan(1e-6);
  });
  it("holds discrete face fields and lerps numeric ones", () => {
    const f = sampleFace(m, 0.5);
    expect(f.mouth).toBe("sil");
    expect(f.yaw).toBeCloseTo(15);
    expect(sampleFace(m, 1.0).mouth).toBe("a");
  });
});

describe("compose", () => {
  it("distributes yaw to neck and head", () => {
    const p = composePose({ bones: {}, hips: [0, 0, 0] }, { ...DEFAULT_FACE, yaw: 40 });
    const total = quatMul(getRotation(p, "neck"), getRotation(p, "head"));
    expect(quatAngleDeg(total, faceRotation(40, 0, 0))).toBeLessThan(1e-4);
  });
});

describe("gesture motions", () => {
  it("all motion files parse", async () => {
    const { readdirSync } = await import("node:fs");
    const files = (readdirSync("shared/vector-avator/motions", { recursive: true }) as string[]).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const f of files) {
      const m = parseMotion(JSON.parse(readFileSync(`shared/vector-avator/motions/${f}`, "utf8")));
      expect(m.duration).toBeGreaterThan(0);
      samplePose(m, m.duration / 2);
      sampleFace(m, m.duration / 2);
    }
  });
});
