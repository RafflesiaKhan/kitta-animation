// Pose = local rotations of bones in the normalized humanoid space (see skeleton.ts).
import { IDENTITY, quatFromEulerDeg, quatNormalize, quatSlerp, vecLerp, type Quat, type Vec3 } from "./math";
import { isKnownBone } from "./skeleton";

export type HandShape = "open" | "point" | "fist" | "palm";
export const HAND_SHAPES: HandShape[] = ["open", "point", "fist", "palm"];

export interface Pose {
  bones: Record<string, Quat>;
  /** Hips translation from the rest position, in metres of the normalized space. */
  hips: Vec3;
  /** Optional hand shapes (used by renderers that swap hand drawings, e.g. method V). */
  hands?: { L?: HandShape; R?: HandShape };
  /**
   * Optional whole-body vertical squash & stretch (1 = none, <1 squashed, >1 stretched).
   * Renderers scale about the feet and widen by 1/sqrt(squash) (volume kept).
   */
  squash?: number;
}

/** JSON form: each bone is either Euler degrees [x, y, z] (XYZ) or {"q": [x, y, z, w]}. */
export type BoneRotationJson = [number, number, number] | { q: [number, number, number, number] };
export interface PoseJson {
  name?: string;
  description?: string;
  bones: Record<string, BoneRotationJson>;
  hips?: Vec3;
}

export function emptyPose(): Pose {
  return { bones: {}, hips: [0, 0, 0] };
}

export function parseRotation(r: BoneRotationJson): Quat {
  if (Array.isArray(r)) return quatFromEulerDeg(r[0], r[1], r[2]);
  return quatNormalize(r.q);
}

export function parsePose(json: PoseJson): Pose {
  const bones: Record<string, Quat> = {};
  for (const [name, r] of Object.entries(json.bones ?? {})) {
    if (!isKnownBone(name)) throw new Error(`unknown bone "${name}"`);
    bones[name] = parseRotation(r);
  }
  return { bones, hips: json.hips ?? [0, 0, 0] };
}

export function getRotation(p: Pose, bone: string): Quat {
  return p.bones[bone] ?? IDENTITY;
}

export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const names = new Set([...Object.keys(a.bones), ...Object.keys(b.bones)]);
  const bones: Record<string, Quat> = {};
  for (const n of names) bones[n] = quatSlerp(getRotation(a, n), getRotation(b, n), t);
  return { bones, hips: vecLerp(a.hips, b.hips, t) };
}
