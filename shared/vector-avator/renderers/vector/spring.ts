// Spring chains for swinging parts (ears, twin tails, tails, ribbons) — vector_plan.md §7.
// Each chain is split into N segments along root -> tip. Every segment has an angle offset
// from its rest direction, driven by the acceleration of the chain root (inertia) and by
// gravity, and pulled back by a spring. Parameters are the three 0..1 values of vector.json
// (stiffness, damping, gravity). Integration uses a fixed sub-step so that the result only
// depends on the sequence of frame times (reproducible video export).
import type { ChainDef, Pt } from "./vdata";

export interface ChainState { th: number[]; om: number[]; ls: number; lv: number }

export class SpringChain {
  readonly n: number;
  readonly joints: Pt[];          // rest joint positions (drawing px), joints[0] = root
  readonly segLen: number;
  readonly k: number; readonly c: number; readonly g: number;
  state: ChainState;
  private lastRoot: Pt | null = null;
  private lastVel: Pt = [0, 0];
  private lastAngle = 0;
  private lastYaw = 0; private lastPitch = 0; private lastYawVel = 0; private lastPitchVel = 0;
  private restDirs: Pt[];
  gain = 1;
  /** cap on the root acceleration (px/s^2): cuts and seeks, and very sharp snaps (dances)
   *  that would otherwise throw every segment to its angle limit */
  accMax = 60000;

  constructor(readonly def: ChainDef, scale = 1) {
    this.n = Math.max(1, Math.round(def.segments));
    this.joints = [];
    for (let i = 0; i <= this.n; i++) {
      const t = i / this.n;
      this.joints.push([def.root[0] + (def.tip[0] - def.root[0]) * t, def.root[1] + (def.tip[1] - def.root[1]) * t]);
    }
    this.segLen = Math.hypot(def.tip[0] - def.root[0], def.tip[1] - def.root[1]) / this.n;
    const d: Pt = [(def.tip[0] - def.root[0]) / (this.segLen * this.n), (def.tip[1] - def.root[1]) / (this.segLen * this.n)];
    this.restDirs = Array.from({ length: this.n }, () => d);
    // soft and bouncy: ears and twin tails are charm points (owner, 2026-11-17).
    // stiffness 0.7 -> about 1.5 Hz; damping 0.4 -> damping ratio about 0.22 (visible overshoot)
    this.k = 6 + 110 * def.stiffness;
    this.c = 2 * Math.sqrt(this.k) * (0.04 + 0.45 * def.damping);
    this.g = 40 * def.gravity * scale;
    this.state = { th: new Array(this.n).fill(0), om: new Array(this.n).fill(0), ls: 0, lv: 0 };
  }

  reset() {
    this.state = { th: new Array(this.n).fill(0), om: new Array(this.n).fill(0), ls: 0, lv: 0 };
    this.lastRoot = null; this.lastVel = [0, 0];
  }

  /** Take over the swing of the same chain in another body view (id056): the angles carry
   *  over; the root history restarts so the root's jump between drawings is not a kick. */
  adopt(o: SpringChain) {
    if (o.n !== this.n) { this.reset(); return; }
    this.state = { th: [...o.state.th], om: [...o.state.om], ls: o.state.ls, lv: o.state.lv };
    this.lastRoot = null; this.lastVel = [0, 0];
  }

  /** Advance by dt seconds. rootScreen = current root position, rootAngle = in-plane
   *  rotation of the parent (radians, clockwise +); yaw/pitch = head direction (radians) for
   *  chains on the head: turning the head swings them sideways, nodding makes them dip toward
   *  or away from the viewer (shown as a change of length). */
  step(dt: number, rootScreen: Pt, rootAngle: number, yaw = 0, pitch = 0, wag = 0) {
    if (!this.lastRoot) { this.lastRoot = rootScreen; this.lastAngle = rootAngle; this.lastVel = [0, 0]; this.lastYaw = yaw; this.lastPitch = pitch; return; }
    if (dt <= 0) return;
    const vel: Pt = [(rootScreen[0] - this.lastRoot[0]) / dt, (rootScreen[1] - this.lastRoot[1]) / dt];
    const acc: Pt = [(vel[0] - this.lastVel[0]) / dt, (vel[1] - this.lastVel[1]) / dt];
    const angVel = (rootAngle - this.lastAngle) / dt;
    const yawVel = (yaw - this.lastYaw) / dt, pitchVel = (pitch - this.lastPitch) / dt;
    const yawAcc = (yawVel - this.lastYawVel) / dt, pitchAcc = (pitchVel - this.lastPitchVel) / dt;
    this.lastRoot = rootScreen; this.lastVel = vel; this.lastAngle = rootAngle;
    this.lastYaw = yaw; this.lastPitch = pitch; this.lastYawVel = yawVel; this.lastPitchVel = pitchVel;
    const H = 1 / 240;
    const steps = Math.max(1, Math.min(60, Math.round(dt / H)));
    const h = dt / steps;
    // clamp extreme accelerations (cuts, seeks, sharp snaps)
    const amax = this.accMax;
    const al = Math.hypot(acc[0], acc[1]);
    const a: Pt = al > amax ? [acc[0] * amax / al, acc[1] * amax / al] : acc;
    const clampA = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    void yawAcc; void pitchAcc; void clampA;
    const axis: Pt = this.restDirs[0];
    for (let s = 0; s < steps; s++) {
      let cum = rootAngle;
      for (let i = 0; i < this.n; i++) {
        cum += this.state.th[i];
        const rd = this.restDirs[i];
        const ca = Math.cos(cum), sa = Math.sin(cum);
        const dir: Pt = [rd[0] * ca - rd[1] * sa, rd[0] * sa + rd[1] * ca];
        const r = this.segLen * (i + 0.5);
        const w = (i + 1) / this.n;
        // inertia: the base accelerates by a, the segment lags (pseudo force -a)
        const tq = (dir[0] * -a[1] - dir[1] * -a[0]) / Math.max(1, r * 3.5) * this.gain
          // idle wag (tails): a small periodic target the spring follows with a bounce
          + this.k * wag * w
          // gravity pulls toward screen-down, measured relative to the rest pose
          + this.g * (dir[0] * 1 - 0) * 0.02 * w
          - this.g * (rd[0] * Math.cos(rootAngle) - rd[1] * Math.sin(rootAngle)) * 0.02 * w
          // the parent turning in the picture plane drags the chain
          - angVel * this.c * 0.15
          // turning the head (yaw) leaves the chain behind: a lag proportional to the turn speed
          - this.k * yawVel * 0.22 * w * this.gain * Math.sign(-axis[1] || 1);
        const accA = tq - this.k * this.state.th[i] - this.c * this.state.om[i];
        this.state.om[i] += accA * h;
        this.state.th[i] += this.state.om[i] * h;
        this.state.th[i] = Math.max(-1.2, Math.min(1.2, this.state.th[i]));
      }
      // length spring: nodding (pitch) and bouncing along the chain axis
      const along = a[0] * axis[0] + a[1] * axis[1];
      const target = Math.max(-0.25, Math.min(0.15, (pitchVel * 0.09 - along * 0.0004) * this.gain));
      const lacc = this.k * 0.6 * (target - this.state.ls) - this.c * 0.8 * this.state.lv;
      this.state.lv += lacc * h;
      this.state.ls = Math.max(-0.25, Math.min(0.15, this.state.ls + this.state.lv * h));
    }
  }

  /** Deform a rest point (drawing px, before the head/body transform) by the chain angles. */
  deform(p: Pt): Pt {
    const ax: Pt = [this.def.tip[0] - this.def.root[0], this.def.tip[1] - this.def.root[1]];
    const L2 = ax[0] * ax[0] + ax[1] * ax[1] || 1;
    const t = ((p[0] - this.def.root[0]) * ax[0] + (p[1] - this.def.root[1]) * ax[1]) / L2;
    // length change along the axis (dip toward / away from the viewer), growing toward the tip
    const tl = Math.max(0, Math.min(1, t));
    const sc = 1 + this.state.ls * tl;
    let q: Pt = [this.def.root[0] + (p[0] - this.def.root[0]) * (1 + (sc - 1) * Math.abs(ax[0]) / Math.sqrt(L2)),
      this.def.root[1] + (p[1] - this.def.root[1]) * (1 + (sc - 1) * Math.abs(ax[1]) / Math.sqrt(L2))];
    for (let k = this.n - 1; k >= 0; k--) {
      const w = Math.max(0, Math.min(1, (t - k / this.n) * this.n + 0.5));
      if (w <= 0) continue;
      const a = this.state.th[k] * w;
      const j = this.joints[k];
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = q[0] - j[0], dy = q[1] - j[1];
      q = [j[0] + dx * ca - dy * sa, j[1] + dx * sa + dy * ca];
    }
    return q;
  }
}
