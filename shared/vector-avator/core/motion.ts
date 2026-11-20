// Motion = sequence of whole-pose keyframes (convenient for hand keying).
// A bone that is absent from a key is interpolated between the neighbouring keys that
// do contain it (so keys can be sparse). Face fields work the same way.
import { lerp, smoothstep, IDENTITY, type Quat, type Vec3 } from "./math";
import { parseRotation, HAND_SHAPES, type BoneRotationJson, type HandShape, type Pose } from "./pose";
import { DEFAULT_FACE, lerpFace, parseFace, type FaceState } from "./face";
import { quatSlerp, vecLerp } from "./math";
import { isKnownBone } from "./skeleton";

export type Ease = "linear" | "smooth" | "step";

export interface MotionKeyJson {
  t: number;
  /** Ease used from this key to the next one. Default "smooth". */
  ease?: Ease;
  bones?: Record<string, BoneRotationJson>;
  hips?: Vec3;
  face?: Partial<FaceState>;
  /** Hand shapes from this key on (held until the next key that sets them). */
  hands?: { L?: HandShape; R?: HandShape };
  /** Whole-body vertical squash & stretch (1 = none). See Pose.squash. */
  squash?: number;
}

export interface MotionJson {
  name: string;
  label?: string;
  duration: number;
  loop?: boolean;
  keys: MotionKeyJson[];
}

interface Track<T> { t: number[]; v: T[]; ease: Ease[] }

export interface Motion {
  name: string;
  label: string;
  duration: number;
  loop: boolean;
  bones: Record<string, Track<Quat>>;
  hips: Track<Vec3>;
  face: Track<Partial<FaceState>>;
  hands: Track<{ L?: HandShape; R?: HandShape }>;
  squash: Track<number>;
}

export function parseMotion(json: MotionJson): Motion {
  const keys = [...json.keys].sort((a, b) => a.t - b.t);
  const bones: Record<string, Track<Quat>> = {};
  const hips: Track<Vec3> = { t: [], v: [], ease: [] };
  const face: Track<Partial<FaceState>> = { t: [], v: [], ease: [] };
  const hands: Track<{ L?: HandShape; R?: HandShape }> = { t: [], v: [], ease: [] };
  const squash: Track<number> = { t: [], v: [], ease: [] };
  let handPrev: { L?: HandShape; R?: HandShape } = {};
  for (const k of keys) {
    const ease = k.ease ?? "smooth";
    for (const [name, r] of Object.entries(k.bones ?? {})) {
      if (!isKnownBone(name)) throw new Error(`motion ${json.name}: unknown bone "${name}"`);
      (bones[name] ??= { t: [], v: [], ease: [] });
      bones[name].t.push(k.t); bones[name].v.push(parseRotation(r)); bones[name].ease.push(ease);
    }
    if (k.hips) { hips.t.push(k.t); hips.v.push(k.hips); hips.ease.push(ease); }
    if (k.squash !== undefined) { squash.t.push(k.t); squash.v.push(k.squash); squash.ease.push(ease); }
    if (k.face) { parseFace(k.face); face.t.push(k.t); face.v.push(k.face); face.ease.push(ease); }
    if (k.hands) {
      for (const v of Object.values(k.hands)) if (v && !HAND_SHAPES.includes(v)) throw new Error(`motion ${json.name}: unknown hand shape "${v}"`);
      handPrev = { ...handPrev, ...k.hands };
      hands.t.push(k.t); hands.v.push(handPrev); hands.ease.push("step");
    }
  }
  return { name: json.name, label: json.label ?? json.name, duration: json.duration, loop: json.loop ?? true, bones, hips, face, hands, squash };
}

/** Find surrounding keys and the eased blend factor. */
function locate<T>(tr: Track<T>, t: number): [number, number, number] {
  const n = tr.t.length;
  if (n === 1 || t <= tr.t[0]) return [0, 0, 0];
  if (t >= tr.t[n - 1]) return [n - 1, n - 1, 0];
  let i = 0;
  while (i < n - 2 && tr.t[i + 1] <= t) i++;
  const span = tr.t[i + 1] - tr.t[i];
  let u = span > 0 ? (t - tr.t[i]) / span : 0;
  const e = tr.ease[i];
  if (e === "step") u = 0;
  else if (e === "smooth") u = smoothstep(u);
  return [i, i + 1, u];
}

export interface SampleOptions {
  /** Quantize body time to this frame rate (limited animation). 0/undefined = continuous. */
  bodyFps?: number;
  /** Quantize face time to this frame rate. */
  faceFps?: number;
}

export function quantize(t: number, fps?: number): number {
  return fps && fps > 0 ? Math.floor(t * fps + 1e-6) / fps : t;
}

export function motionTime(m: Motion, t: number): number {
  if (!m.loop) return Math.min(Math.max(t, 0), m.duration);
  return ((t % m.duration) + m.duration) % m.duration;
}

export function samplePose(m: Motion, time: number, opts: SampleOptions = {}): Pose {
  const t = quantize(motionTime(m, time), opts.bodyFps);
  const bones: Record<string, Quat> = {};
  for (const [name, tr] of Object.entries(m.bones)) {
    const [a, b, u] = locate(tr, t);
    bones[name] = quatSlerp(tr.v[a] ?? IDENTITY, tr.v[b] ?? IDENTITY, u);
  }
  let hips: Vec3 = [0, 0, 0];
  if (m.hips.t.length) {
    const [a, b, u] = locate(m.hips, t);
    hips = vecLerp(m.hips.v[a], m.hips.v[b], u);
  }
  const extra: Partial<Pose> = {};
  if (m.squash?.t.length) {
    const [a, b, u] = locate(m.squash, t);
    extra.squash = lerp(m.squash.v[a], m.squash.v[b], u);
  }
  if (m.hands?.t.length) {
    let i = -1;
    while (i + 1 < m.hands.t.length && m.hands.t[i + 1] <= t + 1e-9) i++;
    return { bones, hips, hands: i >= 0 ? m.hands.v[i] : {}, ...extra };
  }
  return { bones, hips, ...extra };
}

export function sampleFace(m: Motion, time: number, opts: SampleOptions = {}, base: FaceState = DEFAULT_FACE): FaceState {
  const t = quantize(motionTime(m, time), opts.faceFps);
  if (!m.face.t.length) return base;
  // accumulate discrete/numeric fields key by key so sparse keys inherit previous values
  let prev = base;
  const states: FaceState[] = m.face.v.map((v) => (prev = parseFace(v, prev)));
  const [a, b, u] = locate(m.face, t);
  return lerpFace(states[a], states[b], u);
}

export { lerp };
