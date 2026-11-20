// Skeleton for method V: the common humanoid pose (normalized space, rest = T-pose) is
// applied to bone lengths measured on the character's own drawing (vector.json skeleton),
// giving 3D joint positions in canvas pixels. The projection is orthographic:
//   screen x = hips.x + X, screen y = hips.y - Y, depth = Z (+ toward the viewer).
// Arm lengths are therefore fixed in 3D and only shorten on screen by foreshortening.
import { IDENTITY, quatMul, type Quat, type Vec3 } from "../../core/math";
import { getRotation, type Pose } from "../../core/pose";
import type { Affine, Pt, VectorDoc } from "./vdata";

export interface JointDef { name: string; parent: string | null; rest: Vec3 }

export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

export interface WorldJoint { pos: Vec3; rot: Quat }

export class VRig {
  joints: JointDef[] = [];
  byName: Record<string, JointDef> = {};
  hips: Pt;
  upperLen: { L: number; R: number };
  foreLen: { L: number; R: number };
  /** pixels per metre for the hips translation of the motion data */
  pxPerM: number;
  world: Record<string, WorldJoint> = {};

  constructor(doc: VectorDoc) {
    const sk = doc.skeleton;
    this.hips = sk.hips;
    const P = (p: Pt): Vec3 => [p[0] - sk.hips[0], sk.hips[1] - p[1], 0];
    const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    this.upperLen = { L: dist(sk.shoulder_L, sk.elbow_L), R: dist(sk.shoulder_R, sk.elbow_R) };
    this.foreLen = { L: dist(sk.elbow_L, sk.wrist_L), R: dist(sk.elbow_R, sk.wrist_R) };
    // usagi_v2 (the motion source) has its hips about 0.32 m above the floor
    const floor = Math.max(sk.ankle_L[1], sk.ankle_R[1]);
    this.pxPerM = Math.max(200, (floor - sk.hips[1]) / 0.32);
    const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const hips = P(sk.hips), chest = P(sk.chest), neck = P(sk.neck), head = P(sk.head);
    const def = (name: string, parent: string | null, rest: Vec3) => {
      const j = { name, parent, rest };
      this.joints.push(j); this.byName[name] = j;
    };
    def("hips", null, hips);
    def("spine", "hips", lerp(hips, chest, 0.35));
    def("chest", "spine", chest);
    def("neck", "chest", neck);
    def("head", "neck", head);
    for (const s of ["L", "R"] as const) {
      const side = s === "L" ? "left" : "right";
      const sign = s === "L" ? 1 : -1;
      const sh = P(sk[`shoulder_${s}`]);
      def(`${side}Shoulder`, "chest", [lerp(neck, sh, 0.3)[0], sh[1], 0]);
      def(`${side}UpperArm`, `${side}Shoulder`, sh);
      def(`${side}LowerArm`, `${side}UpperArm`, add(sh, [sign * this.upperLen[s], 0, 0]));
      def(`${side}Hand`, `${side}LowerArm`, add(sh, [sign * (this.upperLen[s] + this.foreLen[s]), 0, 0]));
      def(`${side}HandTip`, `${side}Hand`, add(sh, [sign * (this.upperLen[s] + this.foreLen[s] + 40), 0, 0]));
      const hp = P(sk[`hip_${s}`]), an = P(sk[`ankle_${s}`]);
      def(`${side}UpperLeg`, "hips", hp);
      def(`${side}LowerLeg`, `${side}UpperLeg`, lerp(hp, an, 0.5));
      def(`${side}Foot`, `${side}LowerLeg`, an);
    }
  }

  /** Forward kinematics. */
  solve(pose: Pose): void {
    const w: Record<string, WorldJoint> = {};
    const t = pose.hips ?? [0, 0, 0];
    for (const j of this.joints) {
      const local = j.name.endsWith("HandTip") ? IDENTITY : getRotation(pose, j.name);
      if (!j.parent) {
        w[j.name] = { pos: add(j.rest, [t[0] * this.pxPerM, t[1] * this.pxPerM, t[2] * this.pxPerM]), rot: local };
        continue;
      }
      const p = w[j.parent];
      const off = sub(j.rest, this.byName[j.parent].rest);
      w[j.name] = { pos: add(p.pos, rotate(p.rot, off)), rot: quatMul(p.rot, local) };
    }
    this.world = w;
  }

  /** Breathing: lift the chest and everything above it by b px (world up). */
  breathe(b: number): void {
    if (!b) return;
    const under = new Set<string>(["chest"]);
    for (const j of this.joints) if (j.parent && under.has(j.parent)) under.add(j.name);
    for (const n of under) { const w = this.world[n]; if (w) w.pos = [w.pos[0], w.pos[1] + b, w.pos[2]]; }
  }

  /** Turned body views (bodyView.ts): the body was solved with the drawing's angle taken out
   *  of the hips (the drawing already shows it). The arms are generated, so they get that
   *  angle back: each arm is turned by `yaw` (radians, about the vertical axis) around its
   *  shoulder, which restores its direction in the world. */
  rotateArms(yaw: number): void {
    if (!yaw) return;
    const q: Quat = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    for (const side of ["left", "right"]) {
      const S = this.world[`${side}UpperArm`];
      if (!S) continue;
      for (const n of ["UpperArm", "LowerArm", "Hand", "HandTip"]) {
        const j = this.world[`${side}${n}`];
        if (!j) continue;
        j.pos = add(S.pos, rotate(q, sub(j.pos, S.pos)));
        j.rot = quatMul(q, j.rot);
      }
    }
  }

  /** Screen position (canvas px of the drawing) and depth of a joint. */
  screen(name: string): { p: Pt; z: number } {
    const j = this.world[name];
    return { p: [this.hips[0] + j.pos[0], this.hips[1] - j.pos[1]], z: j.pos[2] };
  }

  restScreen(name: string): Pt {
    const r = this.byName[name].rest;
    return [this.hips[0] + r[0], this.hips[1] - r[1]];
  }

  /** 2D affine of a flat part attached to a bone: the 3D rigid motion of the bone, projected. */
  boneAffine(name: string): Affine {
    const j = this.world[name];
    if (!j) return [1, 0, 0, 1, 0, 0];
    const ex = rotate(j.rot, [1, 0, 0]), ey = rotate(j.rot, [0, 1, 0]);
    const a = ex[0], b = -ex[1], c = -ey[0], d = ey[1];
    const s0 = this.restScreen(name), s1 = this.screen(name).p;
    return [a, b, c, d, s1[0] - a * s0[0] - c * s0[1], s1[1] - b * s0[0] - d * s0[1]];
  }

  /** In-plane angle (screen, radians, clockwise +) of the bone's local axis. */
  screenAngle(name: string, axis: Vec3 = [0, 1, 0]): number {
    const v = rotate(this.world[name].rot, axis);
    return Math.atan2(-v[1], v[0]) - Math.atan2(-axis[1], axis[0]);
  }

  /** World direction of a bone axis. */
  axis(name: string, v: Vec3): Vec3 { return rotate(this.world[name].rot, v); }
}
