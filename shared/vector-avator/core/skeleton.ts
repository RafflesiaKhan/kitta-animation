// Common humanoid skeleton. Bone names follow VRM 1.0 humanoid names so the data can
// be applied to three-vrm normalized bones directly. Rotations in poses are expressed
// in the *normalized* space: rest = T-pose, every bone has identity rotation at rest,
// +Y up, the character faces +Z, the character's left is +X.
import type { Vec3 } from "./math";

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Direction of the bone (head -> tail) in the normalized T-pose, used for retargeting. */
  dir: Vec3;
  optional?: boolean;
}

const L = (n: string) => "left" + n;
const R = (n: string) => "right" + n;

export const HUMANOID_BONES: BoneDef[] = [
  { name: "hips", parent: null, dir: [0, 1, 0] },
  { name: "spine", parent: "hips", dir: [0, 1, 0] },
  { name: "chest", parent: "spine", dir: [0, 1, 0] },
  { name: "neck", parent: "chest", dir: [0, 1, 0] },
  { name: "head", parent: "neck", dir: [0, 1, 0] },
  { name: L("Shoulder"), parent: "chest", dir: [1, 0, 0] },
  { name: L("UpperArm"), parent: L("Shoulder"), dir: [1, 0, 0] },
  { name: L("LowerArm"), parent: L("UpperArm"), dir: [1, 0, 0] },
  { name: L("Hand"), parent: L("LowerArm"), dir: [1, 0, 0] },
  { name: R("Shoulder"), parent: "chest", dir: [-1, 0, 0] },
  { name: R("UpperArm"), parent: R("Shoulder"), dir: [-1, 0, 0] },
  { name: R("LowerArm"), parent: R("UpperArm"), dir: [-1, 0, 0] },
  { name: R("Hand"), parent: R("LowerArm"), dir: [-1, 0, 0] },
  { name: L("UpperLeg"), parent: "hips", dir: [0, -1, 0] },
  { name: L("LowerLeg"), parent: L("UpperLeg"), dir: [0, -1, 0] },
  { name: L("Foot"), parent: L("LowerLeg"), dir: [0, 0, 1] },
  { name: R("UpperLeg"), parent: "hips", dir: [0, -1, 0] },
  { name: R("LowerLeg"), parent: R("UpperLeg"), dir: [0, -1, 0] },
  { name: R("Foot"), parent: R("LowerLeg"), dir: [0, 0, 1] },
  { name: "leftEye", parent: "head", dir: [0, 0, 1], optional: true },
  { name: "rightEye", parent: "head", dir: [0, 0, 1], optional: true },
];

export const BONE_NAMES = HUMANOID_BONES.map((b) => b.name);
export const BONE_BY_NAME: Record<string, BoneDef> = Object.fromEntries(HUMANOID_BONES.map((b) => [b.name, b]));

/** Extra bones that some characters have (ears, tails, hair). Optional everywhere. */
export const EXTRA_BONE_PREFIXES = ["tail", "ear", "twintail", "hair"];

export function isKnownBone(name: string): boolean {
  return name in BONE_BY_NAME || EXTRA_BONE_PREFIXES.some((p) => name.startsWith(p));
}

/** Topological order (parents before children). */
export function boneOrder(): string[] {
  return BONE_NAMES.slice();
}
