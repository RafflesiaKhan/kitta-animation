// Planted legs: a leg is one rigid part (no knee), so rotating it about the hip joint, as the
// bone does, tilts the foot and slides or lifts it when the hips sway. With planted legs the
// sole stays exactly where it is drawn at rest and only the hip end follows the body: the leg
// part is sheared sideways and scaled vertically (horizontal lines stay horizontal, so the
// sole stays flat). The whole-body squash (applied later about the floor point) is cancelled
// for the leg, so the feet neither move nor widen when the body squashes.
import type { Affine, Pt } from "./vdata";

/**
 * @param hipRest  hip joint at rest (drawing px)
 * @param hipNow   hip joint now, before the squash (drawing px)
 * @param soleX    x of the foot at rest (kept fixed)
 * @param floorY   y of the sole (the bottom of the leg part)
 * @param floor    fixed point of the squash (drawing px)
 * @param squash   vertical scale of the squash (1 = none); the horizontal scale is 1/sqrt(squash)
 */
export function plantedLegAffine(hipRest: Pt, hipNow: Pt, soleX: number, floorY: number, floor: Pt, squash = 1): Affine {
  const sx = 1 / Math.sqrt(squash);
  // the sole is drawn where the squash will move it back to its rest place
  const px = floor[0] + (soleX - floor[0]) / sx;
  const py = floor[1] + (floorY - floor[1]) / squash;
  const span = hipRest[1] - floorY || -1;
  const mx = 1 / sx;                                    // the foot keeps its width after the squash
  const ky = (hipNow[1] - py) / span;
  const shx = (hipNow[0] - px - mx * (hipRest[0] - soleX)) / span;
  return [mx, 0, shx, ky, px - mx * soleX - shx * floorY, py - ky * floorY];
}
