// Combine a body pose with the face state: the head direction (yaw/pitch/roll) is
// distributed over neck and head so all 3D renderers turn the head the same way.
import { quatFromEulerDeg, quatMul, type Quat } from "./math";
import { getRotation, type Pose } from "./pose";
import type { FaceState } from "./face";

export const NECK_SHARE = 0.35;

/** Rotation for the face direction in the normalized space.
 *  yaw + : turns to the character's left (around +Y)
 *  pitch +: looks up (around -X, because +X rotation tilts +Z forward downward)
 *  roll + : tilts toward its left shoulder (around -Z) */
export function faceRotation(yaw: number, pitch: number, roll: number, share = 1): Quat {
  return quatFromEulerDeg(-pitch * share, yaw * share, -roll * share);
}

export function composePose(body: Pose, face: FaceState): Pose {
  const bones = { ...body.bones };
  const neck = faceRotation(face.yaw, face.pitch, face.roll, NECK_SHARE);
  const head = faceRotation(face.yaw, face.pitch, face.roll, 1 - NECK_SHARE);
  bones.neck = quatMul(getRotation(body, "neck"), neck);
  bones.head = quatMul(getRotation(body, "head"), head);
  if (face.gazeX || face.gazeY) {
    const g = quatFromEulerDeg(-face.gazeY, face.gazeX, 0);
    bones.leftEye = g;
    bones.rightEye = g;
  }
  return { bones, hips: body.hips, ...(body.hands ? { hands: body.hands } : {}), ...(body.squash !== undefined ? { squash: body.squash } : {}) };
}
