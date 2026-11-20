import { describe, expect, it } from "vitest";
import { plantedLegAffine } from "../../../shared/vector-avator/renderers/vector/plant";
import { apply, type Affine, type Pt } from "../../../shared/vector-avator/renderers/vector/vdata";

// the whole-body squash the renderer applies after the parts (vectorRenderer.ts render())
const squashView = (F: Pt, sq: number): Affine => {
  const sx = 1 / Math.sqrt(sq);
  return [sx, 0, 0, sq, F[0] - sx * F[0], F[1] - sq * F[1]];
};

describe("planted legs", () => {
  const hip: Pt = [602, 1060], soleX = 620, floorY = 1445, F: Pt = [511, 1445];

  it("keeps the sole fixed and flat while the hip moves", () => {
    const A = plantedLegAffine(hip, [700, 1075], soleX, floorY, F, 1);
    expect(apply(A, hip)[0]).toBeCloseTo(700, 6);
    expect(apply(A, hip)[1]).toBeCloseTo(1075, 6);
    for (const x of [580, 620, 660]) {
      const p = apply(A, [x, floorY]);
      expect(p[0]).toBeCloseTo(x, 6);
      expect(p[1]).toBeCloseTo(floorY, 6);
    }
  });

  it("cancels the squash for the feet but not for the hip", () => {
    const sq = 0.92;
    const hipNow: Pt = [560, 1050];
    const S = squashView(F, sq);
    const A = plantedLegAffine(hip, hipNow, soleX, floorY, F, sq);
    const final = (p: Pt) => apply(S, apply(A, p));
    // the sole ends where it is drawn at rest, at its rest width
    expect(final([soleX - 40, floorY])[0]).toBeCloseTo(soleX - 40, 6);
    expect(final([soleX + 40, floorY])[0]).toBeCloseTo(soleX + 40, 6);
    expect(final([soleX, floorY])[1]).toBeCloseTo(floorY, 6);
    // the hip ends where the squashed body puts it
    const want = apply(S, hipNow);
    expect(final(hip)[0]).toBeCloseTo(want[0], 6);
    expect(final(hip)[1]).toBeCloseTo(want[1], 6);
  });
});
