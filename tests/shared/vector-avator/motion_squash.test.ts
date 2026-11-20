import { describe, expect, it } from "vitest";
import { parseMotion, samplePose } from "../../../shared/vector-avator/core/motion";
import { composePose } from "../../../shared/vector-avator/core/compose";
import { DEFAULT_FACE } from "../../../shared/vector-avator/core/face";

describe("squash & stretch track", () => {
  const m = parseMotion({
    name: "sq", duration: 1, loop: true,
    keys: [{ t: 0, ease: "linear", squash: 1 }, { t: 0.5, ease: "linear", squash: 0.9 }, { t: 1, squash: 1 }],
  });
  it("interpolates the squash value", () => {
    expect(samplePose(m, 0.25).squash).toBeCloseTo(0.95);
    expect(samplePose(m, 0.5).squash).toBeCloseTo(0.9);
  });
  it("is absent for motions without the track", () => {
    const n = parseMotion({ name: "n", duration: 1, keys: [{ t: 0, hips: [0, 0, 0] }] });
    expect(samplePose(n, 0.3).squash).toBeUndefined();
  });
  it("survives composing with the face", () => {
    expect(composePose(samplePose(m, 0.5), DEFAULT_FACE).squash).toBeCloseTo(0.9);
  });
});
