// Method V: vector standing picture (specs/vector_plan.md).
// SVG-path parts from vector.json are drawn with Canvas 2D. The body follows the common
// skeleton through VRig (3D FK with the character's own bone lengths, orthographic
// projection); arms are generated (arm.ts); the head turns by Live2D-style deformation of the
// one front drawing (head.ts);
// swinging parts use spring chains (spring.ts); outlines are generated where a part overlaps
// a part of a similar colour (outline.ts).
import type { CharacterConfig, Renderer, RendererContext } from "../../core/renderer";
import type { Pose, HandShape } from "../../core/pose";
import { DEFAULT_FACE, eyeFor, type FaceState } from "../../core/face";
import { loadVector, emitPath, mulAff, apply, type Affine, type LoadedPart, type LoadedVector, type MapFn, type Pt } from "./vdata";
import { VRig } from "./vrig";
import { buildArm, multiPolygonPath, type ArmGeom } from "./arm";
import { DEFAULT_HEAD_TURN, DEFAULT_PARALLAX, attachPlace, faceDisp, featurePlace, headReach, headShift, shellMap, type HeadFrame } from "./head";
import { SpringChain } from "./spring";
import { plantedLegAffine } from "./plant";
import { composeView, loadBodyView, mirrorView } from "./bodyView";
import { prepareVector, translate } from "./vdata";
import { IDENTITY, quatMul, type Quat } from "../../core/math";
import { makeCanvas } from "../../canvasFactory";
import { OutlineSettings, drawOutlines, silhouetteRings, type DrawItem, outerOutline, darken, handFromQuery, faceWobbleMap, featureFill } from "./outline";


const EXPR_KEY: Record<string, string> = { neutral: "normal", smile: "smile", surprised: "surprise", troubled: "trouble" };
const q = () => new URLSearchParams(typeof location === "undefined" ? "" : location.search);
const num = (k: string, d: number) => (q().has(k) ? Number(q().get(k)) : d);
const flag = (k: string, d: boolean) => (q().has(k) ? q().get(k) !== "0" : d);

export interface VectorOptions {
  bg: string;
  outline: OutlineSettings;
  physics: boolean;
  physGain: number;    // how strongly swinging parts react to motion (1 = as tuned)
  accMax: number;      // cap on the root acceleration a swinging part feels (px/s^2)
  handLag: boolean;
  depthGain: number;   // arm width gain per head-radius of depth
  armCurve: number;
  breath: number;      // breathing lift of the chest (drawing px, 0 = off)
  breathPeriod: number;
  wag: number;         // idle tail wag amplitude (radians, 0 = off)
  plant: boolean;      // planted legs: the soles stay put, the leg shears to the hip (plant.ts)
}

export function optionsFromUrl(): VectorOptions {
  const p = q();
  return {
    bg: p.get("bg") ? `#${p.get("bg")!.replace(/^#/, "")}` : "#dde6f2",
    outline: {
      enabled: flag("vOutline", true),
      outer: flag("vOuter", false),
      width: num("vLine", 3.2),
      darken: num("vDark", 0.2),
      threshold: num("vThr", 16),
      outerColor: p.get("vOuterColor") ? `#${p.get("vOuterColor")}` : "",
      hand: handFromQuery(p),
    },
    physics: flag("vPhys", true),
    physGain: num("vPhysGain", 1),
    accMax: num("vAccMax", 60000),
    handLag: flag("vLag", true),
    depthGain: num("vDepth", 0.18),
    armCurve: num("vCurve", 0.035),
    breath: num("vBreath", 5),
    breathPeriod: num("vBreathT", 3.6),
    wag: num("vWag", 0.07),
    plant: flag("vPlant", false),
  };
}

interface HandState { a: number; v: number; init: boolean }

export class VectorRenderer implements Renderer {
  readonly id = "V" as const;
  readonly label = "V: vector character";
  private cv!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private lv!: LoadedVector;
  private rig!: VRig;
  private pose: Pose = { bones: {}, hips: [0, 0, 0] };
  private face: FaceState = DEFAULT_FACE;
  private view: Affine = [1, 0, 0, 1, 0, 0];
  private W = 960; private H = 540;
  private framing: "body" | "face" = "body";
  opt: VectorOptions = { ...optionsFromUrl(), bg: "" };
  /** Kitta: fixed pixel ratio (the export must not depend on the display); undefined = window's */
  dpr?: number;
  private chains = new Map<string, SpringChain>();
  private partChain = new Map<string, SpringChain>();
  private lastT = -1;
  private groupCenter = new Map<string, Pt>();
  private groupHalf = new Map<string, number>();
  private silRest = new Map<string, Pt[][]>();
  private reach: [number, number, number] = [1, 1, 1];
  private par: Record<string, number> = { ...DEFAULT_PARALLAX };
  private turn: Record<string, number> = {};
  private armLayer = { L: { upper: false, fore: false, raised: false, crossing: false }, R: { upper: false, fore: false, raised: false, crossing: false } };
  private sleeveState = { L: "straight", R: "straight" };
  /** local x side of the index finger in the pointing-hand drawings, and the current mirroring */
  private thumbSide: Record<"L" | "R", number> = { L: 0, R: 0 };
  private handMirror: Record<"L" | "R", boolean> = { L: false, R: false };
  private hand: Record<"L" | "R", HandState> = { L: { a: 0, v: 0, init: false }, R: { a: 0, v: 0, init: false } };
  private debug = false;
  private dt = 0;
  /** last frame's draw list (for tests / debugging) */
  lastItems: DrawItem[] = [];
  /** turned body views (id056, bodyView.ts): angle of this view's body drawing (radians) */
  private viewYaw = 0;
  /** body views [front, +side, -side]; when present, this renderer only composites them */
  private views: VectorRenderer[] | null = null;
  private activeViews = new Set<VectorRenderer>();
  private viewSide = 0; // hysteresis state of the switch: 0 front, +1 / -1 turned
  /** timed crossfade (vSwitch=fadeT): the drawing going out, the one coming in, progress 0..1 */
  private fade: { from: VectorRenderer; to: VectorRenderer; p: number } | null = null;
  private fadeTarget: VectorRenderer | null = null;
  private fadeLastT = -1;
  private maxYawDeg = 30;
  /** body chains (tail) moved behind the body toward where the turned view has them (id056) */
  private slide = new Map<string, Pt>();
  private slideAff(id: string, aff: Affine): Affine {
    const d = this.slide.get(id);
    return d ? mulAff(translate(d[0], d[1]), aff) : aff;
  }
  /** body yaw (deg) and the views drawn in the last frame (for tests / captures) */
  lastBody: { yaw: number; views: { yaw: number; alpha: number }[] } = { yaw: 0, views: [] };

  get canvas(): HTMLCanvasElement { return this.cv; }

  async init(ctx: RendererContext): Promise<void> {
    const c: CharacterConfig = ctx.character;
    if (!c.vector) throw new Error(`${c.label} has no vector data (method V)`);
    this.lv = await loadVector(c.vector.url);
    this.setup(ctx.width, ctx.height, ctx.framing ?? "body", !!ctx.debug);
    // turned body drawing (body30.json next to vector.json); vBody=0 turns it off
    if (flag("vBody", true)) {
      const bv = await loadBodyView(c.vector.url.replace(/[^/]*$/, q().get("vBodyFile") ?? "body30.json"));
      if (bv) this.setupViews(bv, ctx.width, ctx.height, ctx.framing ?? "body", !!ctx.debug);
    }
    ctx.container.appendChild(this.cv);
  }

  /** Children for the front body and the turned body (both directions). */
  private setupViews(bv: Parameters<typeof composeView>[1], w: number, h: number, framing: "body" | "face", debug: boolean) {
    const docs = [{ yaw: 0, lv: this.lv }];
    for (const v of [bv, mirrorView(bv)]) docs.push({ yaw: (v.yaw * Math.PI) / 180, lv: prepareVector(composeView(this.lv.doc, v)) });
    this.views = docs.map(({ yaw, lv }) => {
      const r = new VectorRenderer();
      r.viewYaw = yaw;
      r.maxYawDeg = 45;
      r.setup(w, h, framing, debug, lv);
      return r;
    });
    this.resize(w, h);
  }

  /** Separate from init for tests (no fetch, no DOM container). */
  setup(width: number, height: number, framing: "body" | "face" = "body", debug = false, lv?: LoadedVector) {
    if (lv) this.lv = lv;
    this.rig = new VRig(this.lv.doc);
    this.framing = framing;
    this.debug = debug;
    this.cv = makeCanvas(width, height);
    // software canvas: Canvas 2D clipping on an emulated GPU (headless SwiftShader) is very slow
    this.g = this.cv.getContext("2d", { willReadFrequently: flag("vSoft", true) })!;
    // vStiff / vDamp / vGrav (0..1) override every chain (for comparisons)
    const ov = (k: string, v: number) => (q().has(k) ? Number(q().get(k)) : v);
    for (const ch0 of this.lv.doc.chains ?? []) {
      const ch = { ...ch0, stiffness: ov("vStiff", ch0.stiffness), damping: ov("vDamp", ch0.damping), gravity: ov("vGrav", ch0.gravity) };
      const sc = new SpringChain(ch);
      sc.accMax = this.opt.accMax;
      this.chains.set(ch.id, sc);
      for (const pid of ch.parts) this.partChain.set(pid, sc);
    }
    // group centres (default variant) for rigid feature placement
    const groups = new Map<string, LoadedPart[]>();
    for (const p of this.lv.parts) if (p.group) { if (!groups.has(p.group)) groups.set(p.group, []); groups.get(p.group)!.push(p); }
    for (const [gname, ps] of groups) {
      const vis = ps.filter((p) => p.visible);
      const use = vis.length ? vis : ps;
      const x0 = Math.min(...use.map((p) => p.box[0])), y0 = Math.min(...use.map((p) => p.box[1]));
      const x1 = Math.max(...use.map((p) => p.box[2])), y1 = Math.max(...use.map((p) => p.box[3]));
      this.groupCenter.set(gname, [(x0 + x1) / 2, (y0 + y1) / 2]);
      this.groupHalf.set(gname, (x1 - x0) / 2);
    }
    for (const p of this.lv.parts) this.silRest.set(p.id, silhouetteRings(p));
    // which local side (+x / -x) the index finger of the pointing hand is drawn on
    for (const sd of ["L", "R"] as const) {
      const hp = this.lv.parts.find((x) => x.group === `hand_${sd}` && x.variants?.includes("point"));
      if (!hp) continue;
      let tip: Pt = hp.pivot, best = -Infinity;
      for (const r of hp.rings) for (const q of r) { const d = q[1] - hp.pivot[1]; if (d > best) { best = d; tip = q; } }
      const w = hp.box[2] - hp.box[0];
      const dx = tip[0] - hp.pivot[0];
      this.thumbSide[sd] = Math.abs(dx) > 0.06 * w ? Math.sign(dx) : 0;
    }
    // head turn: layer amounts and tunables (vector.json, then URL: vPar=feature:0.6,head:0.3
    // and vTurn=shift:0.1,irisRoll:0.2), and the rim of the whole head (fixed head parts)
    const kv = (k: string) => Object.fromEntries((q().get(k) ?? "").split(",").filter((x) => x.includes(":")).map((x) => { const [a, b] = x.split(":"); return [a, Number(b)]; }));
    const ht = this.lv.doc.headTurn ?? {};
    this.par = { ...DEFAULT_PARALLAX, ...(this.lv.doc.parallax ?? {}), ...kv("vPar") };
    const { reach: reachIn, ...turnIn } = ht;
    this.turn = { ...(turnIn as Record<string, number>), ...kv("vTurn") };
    const sk0 = this.lv.doc.skeleton;
    const fixed = this.lv.parts.filter((p) => p.bone === "head" && p.layer !== "feature" && p.layer !== "ear" && p.layer !== "body" && !this.partChain.has(p.id) && p.visible);
    this.reach = reachIn ?? headReach(sk0.head_center, sk0.head_radius, fixed.map((p) => p.box));
    this.resize(width, height);
  }

  resize(cw: number, ch: number): void {
    // draw at the device pixel ratio (sharper shots with a deviceScaleFactor; vdpr overrides)
    const dpr = num("vdpr", this.dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
    const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
    this.W = w; this.H = h;
    this.cv.width = w; this.cv.height = h;
    const sk = this.lv.doc.skeleton;
    let box: [number, number, number, number];
    if (this.framing === "face") {
      const [cx, cy] = sk.head_center, [rx, ry] = sk.head_radius;
      box = [cx - rx * 1.9, cy - ry * 2.2, cx + rx * 1.9, cy + ry * 1.6];
    } else {
      const xs = this.lv.parts.filter((p) => p.visible).map((p) => p.box);
      const x0 = Math.min(...xs.map((b) => b[0])), y0 = Math.min(...xs.map((b) => b[1]));
      const x1 = Math.max(...xs.map((b) => b[2])), y1 = Math.max(...xs.map((b) => b[3]));
      const span = Math.max(sk.wrist_L[0] - sk.wrist_R[0], 0) + 2 * (this.rig.upperLen.L + this.rig.foreLen.L);
      const cx = (x0 + x1) / 2;
      const half = Math.max((x1 - x0) / 2, span / 2) * 1.05;
      box = [cx - half, y0 - (y1 - y0) * 0.06, cx + half, y1 + (y1 - y0) * 0.04];
      // vPad: extra margin (x the body height) on every side, e.g. for hops and swinging ears
      const pad = num("vPad", 0) * (y1 - y0);
      box = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad];
    }
    const s = Math.min(w / (box[2] - box[0]), h / (box[3] - box[1]));
    const ox = (w - s * (box[2] - box[0])) / 2 - s * box[0];
    const oy = (h - s * (box[3] - box[1])) / 2 - s * box[1];
    this.view = [s, 0, 0, s, ox, oy];
    // body views share the framing of the front view (the character stays put on screen)
    if (this.views) for (const v of this.views) { v.resize(cw, ch); v.view = [...this.view] as Affine; }
  }

  /** Kitta: forget the spring state, so the next render starts the simulation from rest. */
  restart(): void { this.lastT = -1; }

  setPose(pose: Pose): void { this.pose = pose; }
  setFace(face: FaceState): void { this.face = face; }

  // ------------------------------------------------------------------ state helpers
  private exprKey(): string { return EXPR_KEY[this.face.expression] ?? "normal"; }
  private variantFor(group: string): string | undefined {
    const ex = this.lv.doc.expressions[this.exprKey()] ?? this.lv.doc.expressions.normal ?? {};
    const has = (v: string) => this.lv.parts.some((p) => p.group === group && p.variants?.includes(v));
    if (group.startsWith("eye_")) {
      const side = group.endsWith("_L") ? "L" : "R";
      const st = eyeFor(this.face, side);
      if (st === "closed" && has("closed")) return "closed";
      if (st === "half" && has("half")) return "half";
      const v = ex.eye ?? "open";
      return has(v) ? v : "open";
    }
    if (group.startsWith("brow_")) { const v = ex.brow ?? "normal"; return has(v) ? v : undefined; }
    if (group === "mouth") {
      const m = this.face.mouth;
      if (m !== "sil" && has(m)) return m;
      const v = ex.mouth ?? "closed";
      return has(v) ? v : "closed";
    }
    if (group.startsWith("hand_")) return this.handShape(group.endsWith("_L") ? "L" : "R");
    if (group.startsWith("sleeve_")) return this.sleeveState[group.endsWith("_L") ? "L" : "R"];
    return undefined;
  }

  private handShape(side: "L" | "R"): HandShape {
    const want = this.pose.hands?.[side];
    if (want) return want;
    // automatic: show the palm when it faces the viewer
    const bone = side === "L" ? "leftHand" : "rightHand";
    if (!this.rig.world[bone]) return "open";
    const n = this.rig.axis(bone, [0, -1, 0]); // palm normal in the T-pose points down
    return n[2] > 0.55 ? "palm" : "open";
  }

  private isVisible(p: LoadedPart): boolean {
    if (!p.group) return p.visible;
    const v = this.variantFor(p.group);
    if (v === undefined) return p.visible;
    return !!p.variants?.includes(v);
  }

  // ------------------------------------------------------------------ head
  private headFrame(): HeadFrame {
    const sk = this.lv.doc.skeleton;
    const f0 = this.rig.axis("head", [0, 0, 1]);
    // a turned body view solved the body without the drawing's angle: add it back (the head
    // drawing is the front one, so it turns by the full world yaw)
    const cv = Math.cos(this.viewYaw), sv = Math.sin(this.viewYaw);
    const f = [f0[0] * cv + f0[2] * sv, f0[1], -f0[0] * sv + f0[2] * cv];
    // rule G (docs/character-pipeline.md): 2D head turns are limited to +-30 deg (pitch +-20);
    // with a turned body drawing (id056) head and body together reach 45 deg
    const lim = (num("vMaxYaw", this.maxYawDeg) * Math.PI) / 180, plim = (20 * Math.PI) / 180;
    const yaw = Math.max(-lim, Math.min(lim, Math.atan2(f[0], f[2])));
    const pitch = Math.max(-plim, Math.min(plim, Math.asin(Math.max(-1, Math.min(1, f[1])))));
    return { c: sk.head_center, r: sk.head_radius, yaw, pitch, reach: this.reach, turn: this.turn };
  }

  /** The neck leans with the chin (id056 follow-up): the face outline slides toward the turn
   *  (parallax), so the top of the neck, drawn up behind the chin, would stick out beside the
   *  jaw on the trailing side. Points of the neck part move by the chin's displacement, fully
   *  from the head joint up and fading to nothing at the neck joint (under the collar).
   *  k = fraction of the chin's displacement (1 = the neck top rides with the chin, which
   *  uncovers the collar on the leading side; 0 = off). */
  private neckMap(hf: HeadFrame, k: number): MapFn | null {
    if (!k || (!hf.yaw && !hf.pitch)) return null;
    const sk = this.lv.doc.skeleton;
    const y1 = sk.head[1], y0 = sk.neck[1];
    if (!(y0 > y1)) return null;
    const pv = this.par.head ?? DEFAULT_PARALLAX.head;
    const fd = faceDisp(hf, pv, [hf.c[0], hf.c[1] + hf.r[1]]), hs = headShift(hf);
    const dx = k * (fd[0] + hs[0]), dy = k * (fd[1] + hs[1]);
    return (q: Pt) => {
      const w = Math.max(0, Math.min(1, (y0 - q[1]) / (y0 - y1)));
      return [q[0] + dx * w, q[1] + dy * w];
    };
  }

  private headAffine(): Affine {
    // translation of the head joint + in-plane roll; yaw/pitch are handled by parallax
    const rest = this.rig.restScreen("head");
    const cur = this.rig.screen("head").p;
    const up = this.rig.axis("head", [0, 1, 0]);
    const roll = Math.atan2(up[0], up[1]); // screen clockwise
    const co = Math.cos(roll), si = Math.sin(roll);
    return [co, si, -si, co, cur[0] - co * rest[0] + si * rest[1], cur[1] - si * rest[0] - co * rest[1]];
  }

  // ------------------------------------------------------------------ frame
  render(time: number): void {
    if (this.views) { this.renderViews(time); return; }
    this.rig.solve(this.pose);
    this.rig.rotateArms(this.viewYaw);
    // breathing (a sign of life): the chest rises and falls; the torso stretches from the hips
    const breath = this.opt.breath * 0.5 * (1 - Math.cos((2 * Math.PI * time) / this.opt.breathPeriod));
    const torsoAff = this.rig.boneAffine("chest"), spineAff = this.rig.boneAffine("spine");
    const hipsS = this.rig.screen("hips").p, chestS = this.rig.screen("chest").p;
    const span = Math.max(1, hipsS[1] - chestS[1]);
    const sy = (span + breath) / span;
    const stretch: Affine = [1, 0, 0, sy, 0, hipsS[1] - sy * hipsS[1]];
    this.rig.breathe(breath);
    const hf = this.headFrame();
    const headAff = this.headAffine();
    const par = this.par;
    // dt = 0 when the same time is drawn again (frozen clock during capture): no step.
    // A jump backwards or a long gap (seek, tab switch) restarts the simulation.
    const jump = this.lastT < 0 || time < this.lastT - 1e-9 || time - this.lastT > 0.5;
    if (jump) { for (const c of this.chains.values()) c.reset(); this.hand.L.init = false; this.hand.R.init = false; }
    const dt = jump ? 0 : time - this.lastT;
    this.lastT = time;
    this.dt = dt;
    this.opt.outline.clock = time;

    // spring chains: root follows its parent bone
    for (const ch of this.chains.values()) {
      ch.gain = this.opt.physics ? this.opt.physGain * (ch.def.gain ?? 1) : 0;
      const isHead = ch.def.bone === "head";
      const aff = isHead ? headAff : this.slideAff(ch.def.id, this.rig.boneAffine(ch.def.bone));
      const root = apply(aff, ch.def.root);
      const ang = Math.atan2(aff[1], aff[0]);
      // tails wag a little on their own (two mixed slow waves, so it does not look mechanical)
      const wag = isHead ? 0 : this.opt.wag * (Math.sin(2 * Math.PI * 0.85 * time) * 0.7 + Math.sin(2 * Math.PI * 0.37 * time + 1.3) * 0.3);
      if (this.opt.physics) ch.step(dt, root, ang, isHead ? hf.yaw : 0, isHead ? hf.pitch : 0, wag);
      else ch.reset();
    }

    const items: DrawItem[] = [];
    const headParts = (p: LoadedPart) => p.bone === "head" || (this.chains.get(p.bone)?.def.bone === "head");

    // arms first (geometry), inserted into the list below
    const arms = (["L", "R"] as const).map((s) => this.armItems(s));

    // each arm goes behind its own attach part (a turned body has the near arm in front, id056);
    // an attach part that does not exist puts the arm behind everything else
    const attachOf = (s: "L" | "R") => this.lv.doc.arms[s].attach ?? this.lv.doc.arms.L.attach ?? "torso";
    const att = (["L", "R"] as const).map((s) => (this.lv.byId[attachOf(s)] ? attachOf(s) : this.lv.parts[0]?.id));
    for (const p of this.lv.parts) {
      arms.forEach((a, i) => { if (p.id === att[i]) items.push(...a.back); });
      if (!this.isVisible(p)) continue;
      if (p.group?.startsWith("hand_") || p.group?.startsWith("sleeve_")) continue; // drawn with the arm
      const chain = this.partChain.get(p.id);
      let map: MapFn | null = null;
      let aff: Affine = [1, 0, 0, 1, 0, 0];
      if (headParts(p)) {
        const layer = p.layer;
        const pv = par[layer] ?? 0;
        aff = headAff;
        if (layer === "feature") {
          aff = mulAff(headAff, this.featureLocal(p, hf));
        } else if (chain || layer === "ear") {
          // attached at its root: rigid, narrower on the turning side; inner shapes slide a little
          const a = chain ? chain.def.root : p.pivot;
          const pl = attachPlace(hf, pv, a);
          const place = (dx: number): MapFn => (pt: Pt) => {
            const d = chain ? chain.deform(pt) : pt;
            return [a[0] + (d[0] - a[0]) * pl.sx + pl.d[0] + dx, d[1] + pl.d[1]];
          };
          map = place(0);
          const inner = (this.turn.earInner ?? DEFAULT_HEAD_TURN.earInner) * (p.box[2] - p.box[0]) * Math.sin(hf.yaw);
          if (p.cmds.length > 1 && Math.abs(inner) > 0.01) {
            const mi = place(inner);
            const it = this.partItem(p, aff, map, (i) => (i > 0 ? mi : map!));
            it.clipSelf = true;
            items.push(it);
            continue;
          }
        } else {
          map = shellMap(hf, pv, layer === "head");
        }
      } else {
        const b = chain ? chain.def.bone : p.bone;
        aff = b === "chest" ? mulAff(stretch, torsoAff) : b === "spine" ? mulAff(stretch, spineAff) : this.rig.boneAffine(b);
        if (this.opt.plant && (b === "leftUpperLeg" || b === "rightUpperLeg")) {
          const sk = this.lv.doc.skeleton;
          const hip = b === "leftUpperLeg" ? sk.hip_L : sk.hip_R;
          const ankle = b === "leftUpperLeg" ? sk.ankle_L : sk.ankle_R;
          aff = plantedLegAffine(hip, apply(aff, hip), ankle[0], p.box[3], this.floorPoint(), this.pose.squash ?? 1);
        }
        if (chain) { map = (pt: Pt) => chain.deform(pt); aff = this.slideAff(chain.def.id, aff); }
        else if (b === "neck") map = this.neckMap(hf, num("vNeckFollow", 0.5));
      }
      items.push(this.partItem(p, aff, map));
    }
    for (const a of arms) items.push(...a.front);

    // ---- draw
    // whole-body squash & stretch (Pose.squash): vertical scale about the feet, widened by
    // 1/sqrt(squash) so the volume reads as kept (squashed = wider, stretched = narrower)
    const baseView = this.view;
    const sq = this.pose.squash ?? 1;
    if (Math.abs(sq - 1) > 1e-6) {
      const F = this.floorPoint();
      const sx = 1 / Math.sqrt(sq);
      this.view = mulAff(baseView, [sx, 0, 0, sq, F[0] - sx * F[0], F[1] - sq * F[1]]);
    }
    try { this.drawAll(items); } finally { this.view = baseView; }
  }

  // ------------------------------------------------------------------ body views (id056)
  /** Pick the body drawing from the body yaw and composite the views.
   *  |yaw| <= at: the front body rotated by yaw; beyond: the turned drawing rotated by
   *  yaw -+ 30 deg. vSwitch = cut | hyst (default) | fade | fadeT compares ways to hide the
   *  change: fade blends over an angle range, fadeT over a time after a hysteresis switch. */
  private renderViews(time: number): void {
    const views = this.views!;
    this.rig.solve(this.pose);
    const fw = this.rig.axis("chest", [0, 0, 1]);
    const yaw = (Math.atan2(fw[0], fw[2]) * 180) / Math.PI;
    const mode = q().get("vSwitch") ?? "hyst";
    const at = num("vSwitchAt", 15), hw = num("vFade", 4), hy = num("vHyst", 3);
    const sideView = views.find((v, i) => i > 0 && Math.sign(v.viewYaw) === (Math.sign(yaw) || 1))!;
    const a = Math.abs(yaw);
    const sgn = Math.sign(yaw) || 1;
    let layers: { v: VectorRenderer; alpha: number }[];
    if (mode === "cut") {
      layers = [{ v: a > at ? sideView : views[0], alpha: 1 }];
    } else if (mode === "hyst") {
      if (this.viewSide !== 0 && this.viewSide !== sgn) this.viewSide = 0;
      if (this.viewSide === 0 && a > at + hy) this.viewSide = sgn;
      else if (this.viewSide !== 0 && a < at - hy) this.viewSide = 0;
      layers = [{ v: this.viewSide ? sideView : views[0], alpha: 1 }];
    } else if (mode === "fadeT") {
      layers = this.timedFade(time, a > at + hy ? sideView : a < at - hy ? views[0] : null, views[0]);
    } else {
      const t = Math.max(0, Math.min(1, (a - (at - hw)) / (2 * hw)));
      const s = t * t * (3 - 2 * t);
      layers = s <= 0 ? [{ v: views[0], alpha: 1 }] : s >= 1 ? [{ v: sideView, alpha: 1 }]
        : [{ v: views[0], alpha: 1 }, { v: sideView, alpha: s }];
    }
    // hand the swing of ears/tails and the hand lag over to a view that comes in
    const prev = [...this.activeViews];
    const now = new Set(layers.map((l) => l.v));
    for (const l of layers) if (!this.activeViews.has(l.v) && prev.length) l.v.adoptDynamics(prev[prev.length - 1]);
    this.activeViews = now;
    this.slideTails(yaw, sideView, at);
    for (const l of layers) {
      l.v.setPose(withHipsYaw(this.pose, -l.v.viewYaw));
      l.v.setFace(this.face);
      l.v.render(time);
    }
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    for (const l of layers) {
      g.globalAlpha = l.alpha;
      g.drawImage(l.v.canvas, 0, 0);
    }
    g.globalAlpha = 1;
    const top = layers[layers.length - 1];
    this.lastItems = top.v.lastItems;
    this.lastBody = { yaw, views: layers.map((l) => ({ yaw: (l.v.viewYaw * 180) / Math.PI, alpha: l.alpha })) };
  }

  /** Timed crossfade (owner, 2026-11-18): the switch is decided like the hysteresis one
   *  (`want` = the drawing past the band, null inside it), then the incoming drawing is laid
   *  over the outgoing one during vFadeT seconds with an ease-in opacity p^vFadePow: it starts
   *  faint and slowly, and comes in fast at the end. Turning back during a fade reverses it
   *  from the same opacity. A seek or a long gap finishes the fade at once. */
  private timedFade(time: number, want: VectorRenderer | null, front: VectorRenderer): { v: VectorRenderer; alpha: number }[] {
    const T = Math.max(1e-3, num("vFadeT", 0.6)), n = Math.max(1, num("vFadePow", 2));
    const jump = this.fadeLastT < 0 || time < this.fadeLastT - 1e-9 || time - this.fadeLastT > 0.5;
    const dt = jump ? 0 : time - this.fadeLastT;
    this.fadeLastT = time;
    const target = want ?? this.fadeTarget ?? front;
    if (!this.fadeTarget || jump) { this.fadeTarget = target; this.fade = null; }
    if (target !== this.fadeTarget) {
      const f = this.fade;
      if (f && f.from === target) {
        // reverse from the same opacity: alpha' = 1 - alpha
        this.fade = { from: f.to, to: target, p: Math.pow(Math.max(0, 1 - Math.pow(f.p, n)), 1 / n) };
      } else {
        this.fade = { from: f ? f.to : this.fadeTarget, to: target, p: 0 };
      }
      this.fadeTarget = target;
    } else if (this.fade) {
      this.fade.p += dt / T;
      if (this.fade.p >= 1) this.fade = null;
    }
    const f = this.fade;
    return f ? [{ v: f.from, alpha: 1 }, { v: f.to, alpha: Math.pow(f.p, n) }] : [{ v: target, alpha: 1 }];
  }

  /** A tail drawn to one side of the front body would jump to the other side when the turned
   *  drawing comes in. In the front view it slides behind the body instead, reaching the turned
   *  view's place exactly at the switch angle (vTailSlide=0 turns it off). */
  private slideTails(yaw: number, side: VectorRenderer, at: number): void {
    const front = this.views![0];
    front.slide.clear();
    if (!flag("vTailSlide", true) || !yaw) return;
    const k = Math.min(1, Math.abs(yaw) / at);
    const b = (Math.sign(yaw) * at * Math.PI) / 180;
    const h = front.lv.doc.skeleton.hips[0];
    for (const c of front.lv.doc.chains ?? []) {
      if (c.bone === "head") continue;
      const s = side.lv.doc.chains?.find((x) => x.id === c.id);
      if (!s) continue;
      // both drawings turn about the hips axis: the front by b, the turned one by b - its angle
      const xf = h + (c.root[0] - h) * Math.cos(b), xs = h + (s.root[0] - h) * Math.cos(b - side.viewYaw);
      front.slide.set(c.id, [(xs - xf) * k, (s.root[1] - c.root[1]) * k]);
    }
  }

  /** Continue the physics and hysteresis state of another view (see SpringChain.adopt). */
  private adoptDynamics(o: VectorRenderer): void {
    for (const [id, ch] of this.chains) { const oc = o.chains.get(id); if (oc) ch.adopt(oc); else ch.reset(); }
    this.hand = { L: { ...o.hand.L }, R: { ...o.hand.R } };
    this.handMirror = { ...o.handMirror };
    this.armLayer = { L: { ...o.armLayer.L }, R: { ...o.armLayer.R } };
    this.sleeveState = { ...o.sleeveState };
    this.lastT = o.lastT;
  }

  /** Centre of the feet on the floor (drawing px): the fixed point of squash & stretch. */
  private floorPoint(): Pt {
    const sk = this.lv.doc.skeleton;
    const legs = this.lv.parts.filter((p) => p.visible && /Leg|Foot/.test(p.bone));
    const y = legs.length ? Math.max(...legs.map((p) => p.box[3])) : Math.max(sk.ankle_L[1], sk.ankle_R[1]);
    return [(sk.ankle_L[0] + sk.ankle_R[0]) / 2, y];
  }

  private drawAll(items: DrawItem[]): void {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Kitta: an empty bg means transparent, so the canvas composites into a scene
    if (this.opt.bg) { g.fillStyle = this.opt.bg; g.fillRect(0, 0, this.W, this.H); }
    else g.clearRect(0, 0, this.W, this.H);
    if (this.opt.outline.outer) {
      outerOutline(g, this.W, this.H, this.view, items, this.opt.outline);
    }
    const drawn: DrawItem[] = [];
    for (const it of items) {
      this.drawItem(it, items);
      if (this.opt.outline.enabled && !it.noOutline) drawOutlines(g, this.view, it, drawn, this.opt.outline);
      drawn.push(it);
    }
    this.lastItems = items;
    if (this.debug) this.drawDebug();
  }

  private partItem(p: LoadedPart, aff: Affine, map: MapFn | null, shapeMap?: (i: number) => MapFn): DrawItem {
    // hand-drawn lines (id053): a tiny wobble of the face features (eye white + its clip copy)
    const fw = p.layer === "feature" ? faceWobbleMap(this.opt.outline.hand, this.opt.outline.clock) : null;
    if (fw && !map && !shapeMap && !p.clipTo) map = fw;
    const paths = p.cmds.map((c, i) => emitPath(c, shapeMap ? shapeMap(i) : map ?? undefined));
    const silR = this.silRest.get(p.id)!;
    const sil = silR.map((r) => (map ? r.map(map) : r));
    const silPath = new Path2D();
    for (const r of sil) { r.forEach(([x, y], i) => (i ? silPath.lineTo(x, y) : silPath.moveTo(x, y))); silPath.closePath(); }
    let box = bboxOf(sil.map((r) => r.map((pt) => apply(aff, pt))));
    let clip: DrawItem["clip"];
    if (p.clipTo && this.lv.byId[p.clipTo]) {
      const cp = this.lv.byId[p.clipTo];
      // the clip part uses the same placement as its group (eye white)
      const cAff = this.featureAffineOf(cp) ?? aff;
      clip = { aff: cAff, path: cp.cmds.reduce((acc, c) => emitPath(c, fw ?? undefined, acc), new Path2D()) };
    }
    if (!isFinite(box[0])) box = [0, 0, 0, 0];
    return { id: p.id, aff, paths, fills: p.fills, sil: silPath, color: p.baseColor, box, clip,
      noOutline: !!p.clipTo || p.layer === "feature", outline: p.outline, seamless: p.seamlessWith, rings: sil };
  }

  /** Rigid placement of a feature part in head coordinates (rules C, E, F of method D). */
  private featureLocal(p: LoadedPart, hf: HeadFrame): Affine {
    const pv = this.par.feature ?? 0;
    const centre = (x: LoadedPart): Pt => (x.group ? this.groupCenter.get(x.group)! : [(x.box[0] + x.box[2]) / 2, (x.box[1] + x.box[3]) / 2]);
    const c0 = centre(p);
    const half = (x: LoadedPart) => (x.group ? this.groupHalf.get(x.group)! : (x.box[2] - x.box[0]) / 2);
    const nose = this.lv.byId.nose;
    let pl = featurePlace(hf, pv, c0, half(p), p.id === "nose" ? this.turn.noseDepth ?? DEFAULT_HEAD_TURN.noseDepth : 1);
    if (p.group === "mouth" && nose) {
      // the mouth stays under the nose: it turns with the nose's column and keeps its offset
      const nc = centre(nose);
      const n = featurePlace(hf, pv, [nc[0], c0[1]], half(p));
      pl = { c: [n.c[0] + (c0[0] - nc[0]) * n.sx, n.c[1]], sx: n.sx, sy: n.sy };
    }
    let gx = 0, gy = 0, qx = 1, qy = 1;
    let ci: Pt = c0;
    if (p.clipTo && /_(iris|pupil)$/.test(p.id)) {
      // eyeball model: the iris is a disc on a small sphere (radius = half the eye white).
      // Rolling toward the turn / gaze moves it by sin(a) and foreshortens it by cos(a); the
      // pupil sits in front of the iris (cornea bulge) and moves further (pupilDepth).
      const w = this.lv.byId[p.clipTo];
      const ew = w.box[2] - w.box[0], eh = w.box[3] - w.box[1];
      const T = this.turn;
      const rx = (T.irisRoll ?? DEFAULT_HEAD_TURN.irisRoll) * Math.sin(hf.yaw) + 0.25 * (this.face.gazeX / 30);
      const ry = 0.12 * Math.sin(hf.pitch) + 0.2 * (this.face.gazeY / 20);
      const ax = Math.asin(Math.max(-0.95, Math.min(0.95, 2 * rx))), ay = Math.asin(Math.max(-0.95, Math.min(0.95, 2 * ry)));
      const depth = p.id.endsWith("_pupil") ? T.pupilDepth ?? DEFAULT_HEAD_TURN.pupilDepth : 1;
      gx = (ew / 2) * Math.sin(ax) * depth;
      gy = -(eh / 2) * Math.sin(ay) * depth;
      const k = T.irisSqueeze ?? DEFAULT_HEAD_TURN.irisSqueeze;
      qx = 1 - k * (1 - Math.cos(ax));
      qy = 1 - k * (1 - Math.cos(ay));
      // foreshorten about the part's own centre (the iris/pupil centre)
      const iris = p.id.endsWith("_pupil") ? this.lv.byId[p.id.replace(/_pupil$/, "_iris")] ?? p : p;
      ci = [(iris.box[0] + iris.box[2]) / 2, (iris.box[1] + iris.box[3]) / 2];
    }
    // x -> pl.sx * (ci + q (x - ci) - c0) + pl.c + g
    const ax2 = pl.sx * qx, ay2 = pl.sy * qy;
    return [ax2, 0, 0, ay2, pl.sx * (ci[0] - qx * ci[0] - c0[0]) + pl.c[0] + gx, pl.sy * (ci[1] - qy * ci[1] - c0[1]) + pl.c[1] + gy];
  }

  /** placement of a feature part without the iris roll (used for clip shapes) */
  private featureAffineOf(p: LoadedPart): Affine | null {
    if (p.layer !== "feature") return null;
    return mulAff(this.headAffine(), this.featureLocal(p, this.headFrame()));
  }

  private drawItem(it: DrawItem, _all: DrawItem[]) {
    const g = this.g;
    g.save();
    if (it.clip) {
      const m = mulAff(this.view, it.clip.aff);
      g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      g.clip(it.clip.path);
    }
    const m = mulAff(this.view, it.aff);
    g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    if (it.regions) {
      // generated arm: base, then each colour band (with its own shade), clipped to the silhouette
      if (it.fills[0]) { g.fillStyle = it.fills[0]; g.fill(it.sil); }
      g.clip(it.sil);
      for (const r of it.regions) {
        g.save();
        g.clip(r.path);
        g.fillStyle = r.color;
        g.fill(r.path);
        if (it.shadePath && r.shade) { g.fillStyle = r.shade; g.fill(it.shadePath); }
        g.restore();
      }
      g.restore();
      return;
    }
    it.paths.forEach((p, i) => {
      const f = it.fills[i];
      if (!f) return;
      // face features (noOutline): dark lines get the hand-drawn line texture (id053); not the
      // iris / pupil (clipped to the eye white): they are fills, not lines
      g.fillStyle = it.noOutline && !it.clip ? featureFill(g, f, this.opt.outline, m, this.view) : f;
      if (it.clipSelf && i === 1) g.clip(it.paths[0], "nonzero");
      g.fill(p, it.clipSelf && i > 0 ? "nonzero" : it.evenodd ? "evenodd" : "nonzero");
    });
    g.restore();
  }

  // ------------------------------------------------------------------ arms
  private armItems(s: "L" | "R"): { back: DrawItem[]; front: DrawItem[] } {
    const side = s === "L" ? "left" : "right";
    const def = this.lv.doc.arms[s];
    const S = this.rig.screen(`${side}UpperArm`), E = this.rig.screen(`${side}LowerArm`), Wr = this.rig.screen(`${side}Hand`);
    const chestZ = this.rig.screen("chest").z;
    const R = this.lv.doc.skeleton.head_radius[0];
    const hipsX = this.lv.doc.skeleton.hips[0];
    const geom = buildArm({
      S: S.p, E: E.p, W: Wr.p, zS: S.z, zE: E.z, zW: Wr.z,
      upperLen: this.rig.upperLen[s], foreLen: this.rig.foreLen[s], def,
      towardBody: S.p[0] < hipsX ? 1 : -1, depthGain: this.opt.depthGain / R, curve: this.opt.armCurve,
    });
    // front/back with hysteresis (in head radii)
    const st = this.armLayer[s];
    const zf = ((E.z + Wr.z) / 2 - chestZ) / R, zu = (E.z - chestZ) / R;
    // chibi bodies are shallow: a forearm 0.1 head radii in front of the chest is already in front
    st.fore = st.fore ? zf > 0.04 : zf > 0.1;
    st.upper = st.upper ? zu > 0.2 : zu > 0.35;
    // a chibi head is wider than the shoulders: an arm raised above the neck would vanish
    // behind it, so it goes in front (with a little hysteresis)
    const neckY = this.rig.screen("neck").p[1];
    const foreY = (E.p[1] + Wr.p[1]) / 2;
    const above = st.raised ? foreY < neckY + 0.15 * R : foreY < neckY;
    st.raised = above;
    if (above) { st.fore = true; if (E.p[1] < neckY) st.upper = true; }
    // an arm that crosses toward the body centre (elbow inside the shoulder line) must pass in
    // front of the chest; behind the torso it would vanish (pointing between the legs)
    const cx = this.lv.doc.skeleton.hips[0];
    const inward = Math.abs(S.p[0] - cx) - Math.abs(E.p[0] - cx);
    const crossing = st.crossing ? inward > 0.06 * R : inward > 0.12 * R;
    st.crossing = crossing;
    if (crossing && zu > -0.15) { st.upper = true; st.fore = true; }
    // sleeve variant by elbow bend (3D)
    const u = norm3(sub3(this.rig.world[`${side}LowerArm`].pos, this.rig.world[`${side}UpperArm`].pos));
    const f = norm3(sub3(this.rig.world[`${side}Hand`].pos, this.rig.world[`${side}LowerArm`].pos));
    const bend = Math.acos(Math.max(-1, Math.min(1, u[0] * f[0] + u[1] * f[1] + u[2] * f[2]))) * 180 / Math.PI;
    const cur = this.sleeveState[s];
    const lv = cur === "straight" ? (bend > 40 ? "bent" : "straight") : cur === "bent" ? (bend < 30 ? "straight" : bend > 95 ? "folded" : "bent") : (bend < 85 ? "bent" : "folded");
    this.sleeveState[s] = lv;

    const ratio = def.shade.ratio ?? 0.3;
    const shadeOf = (band: string) => (def.bands.length === 1 && def.shade.color ? def.shade.color : darken(band, 0.07));
    const armItem = (id: string, gsil: ArmGeom["silhouette"], bands: ArmGeom["bands"], shade: ArmGeom["shade"]): DrawItem => {
      const sil = multiPolygonPath(gsil);
      const regions = bands.map((b) => ({ path: multiPolygonPath(b.poly), color: b.color, shade: shadeOf(b.color) }));
      const box = bboxOf(gsil.flatMap((poly) => poly.map((r) => r as Pt[])));
      const base = def.bands[0]?.color ?? "#ffffff";
      // several bands covering the whole arm: no base fill under them. Its anti-aliased edge
      // showed as a light rim where a navy forearm's round end lies over the navy upper arm.
      const covered = def.bands.length > 1 && def.bands[0].from <= 1e-6 && def.bands[def.bands.length - 1].to >= 1 - 1e-6
        && def.bands.every((b, i) => i === 0 || Math.abs(b.from - def.bands[i - 1].to) < 1e-6);
      return { id, aff: [1, 0, 0, 1, 0, 0], paths: [sil], fills: [covered ? null : base], sil, color: base, box, group: `arm_${s}`,
        clipSelf: true, regions, shadePath: ratio > 0 && shade.length ? multiPolygonPath(shade) : undefined,
        rings: gsil.flatMap((poly) => poly.map((r) => r as Pt[])) };
    };
    const handItem = this.handItem(s, geom, Wr.z, R);
    const sleeveItem = this.sleeveItem(s, S.p, E.p, Wr.p);
    const back: DrawItem[] = [], front: DrawItem[] = [];
    // seamless hands go under the forearm: the forearm's round end covers the wrist, so neither
    // a wrist line nor the hand's wrist edge shows over whatever is behind (e.g. the head)
    // ... except a hand pointing at the viewer, which sticks out in front of the forearm
    const handUnder = !!def.seamlessHand && !(handItem && handItem.id.endsWith("_point_front"));
    if (st.upper === st.fore) {
      const it = armItem(`arm_${s}`, geom.silhouette, geom.bands, geom.shade);
      const list = st.fore ? front : back;
      if (handItem && handUnder) list.push(handItem);
      list.push(it);
      if (sleeveItem) list.push(sleeveItem);
      if (handItem && !handUnder) list.push(handItem);
    } else {
      const up = geom.parts.upper, fo = geom.parts.fore;
      (st.upper ? front : back).push(armItem(`arm_${s}_upper`, up.silhouette, up.bands, up.shade));
      const lst = st.fore ? front : back;
      if (handItem && handUnder) lst.push(handItem);
      lst.push(armItem(`arm_${s}_fore`, fo.silhouette, fo.bands, fo.shade));
      if (sleeveItem) lst.push(sleeveItem);
      if (handItem && !handUnder) lst.push(handItem);
    }
    return { back, front };
  }

  private handItem(s: "L" | "R", geom: ArmGeom, z: number, R: number): DrawItem | null {
    const shape = this.handShape(s);
    const side = s === "L" ? "left" : "right";
    const hx0 = this.rig.axis(`${side}Hand`, [s === "L" ? 1 : -1, 0, 0]);
    const toViewer = Math.hypot(hx0[0], hx0[1]) < 0.55 * (Math.hypot(hx0[0], hx0[1], hx0[2]) || 1);
    // optional "pointing at the viewer" drawing (finger foreshortened, fingertip toward us)
    const front = shape === "point" && toViewer
      ? this.lv.parts.find((x) => x.group === `hand_${s}` && x.variants?.includes("point_front")) : undefined;
    const p = front ?? this.lv.parts.find((x) => x.group === `hand_${s}` && x.variants?.includes(shape))
      ?? this.lv.parts.find((x) => x.group === `hand_${s}` && x.visible);
    if (!p) return null;
    // direction: forearm direction, bent by the wrist rotation (projected hand axis)
    const hx = this.rig.axis(`${side}Hand`, [s === "L" ? 1 : -1, 0, 0]);
    const hd: Pt = [hx[0], -hx[1]];
    const hl = Math.hypot(hd[0], hd[1]);
    const fd = geom.foreDir;
    const dir = hl > 0.35 ? [hd[0] / hl, hd[1] / hl] : fd;
    let target = Math.atan2(dir[1], dir[0]) - Math.PI / 2; // drawn pointing down (+Y)
    // secondary motion: the hand follows with a slight lag and overshoot (vector_plan §9)
    const hs = this.hand[s];
    if (!hs.init || !this.opt.handLag) { hs.a = target; hs.v = 0; hs.init = true; }
    else {
      while (target - hs.a > Math.PI) target -= 2 * Math.PI;
      while (target - hs.a < -Math.PI) target += 2 * Math.PI;
      const k = 260, c = 18; // underdamped: small overshoot
      const n = Math.max(0, Math.min(120, Math.round(this.dt * 240)));
      const h = n ? this.dt / n : 0;
      for (let i = 0; i < n; i++) { hs.v += (k * (target - hs.a) - c * hs.v) * h; hs.a += hs.v * h; }
    }
    const sc = Math.max(0.6, 1 + this.opt.depthGain * z / R);
    const a = hs.a;
    // foreshortening: a hand pointing toward (or away from) the viewer gets shorter along its
    // own length (the drawing's +Y), so a finger aimed at the camera reads as coming forward
    const hl3 = Math.hypot(hx[0], hx[1], hx[2]) || 1;
    const fy = front ? 1 : Math.max(0.6, Math.min(1, Math.hypot(hx[0], hx[1]) / hl3 + 0.15));
    const co = Math.cos(a) * sc, si = Math.sin(a) * sc;
    const w = geom.wrist;
    const pv = p.pivot;
    // rotation R(a)*sc after a local squash S(1, fy) about the wrist pivot
    let A = co, B = si;
    const C = -si * fy, D = co * fy;
    // pointing hands: the index finger goes to the body side when pointing down, at the
    // viewer or up, and to the top when pointing sideways (owner, 2026-11-18). The drawing is
    // mirrored about its own axis when its index finger would end up on the other side.
    const sig = this.thumbSide[s];
    if ((shape === "point") && sig) {
      // the body side is judged from the shoulder (the hand may cross the centre line)
      const hipsX = this.lv.doc.skeleton.hips[0];
      const sh = this.rig.screen(`${side}UpperArm`).p;
      const tb = Math.sign(hipsX - sh[0]) || 1;
      const gl = Math.hypot(tb * 0.8, 1);
      const dot = sig * ((Math.cos(a) * tb * 0.8) / gl + (Math.sin(a) * -1) / gl);
      this.handMirror[s] = this.handMirror[s] ? dot < 0.15 : dot < -0.15;
      if (this.handMirror[s]) { A = -A; B = -B; }
    } else this.handMirror[s] = false;
    const aff: Affine = [A, B, C, D, w[0] - A * pv[0] - C * pv[1], w[1] - B * pv[0] - D * pv[1]];
    const it = this.partItem(p, aff, null);
    if (this.lv.doc.arms[s].seamlessHand) it.group = `arm_${s}`;
    return it;
  }

  private sleeveItem(s: "L" | "R", S: Pt, E: Pt, W: Pt): DrawItem | null {
    const v = this.sleeveState[s];
    const p = this.lv.parts.find((x) => x.group === `sleeve_${s}` && x.variants?.includes(v));
    if (!p) return null;
    // drawn with the upper arm pointing up (-Y) from the elbow pivot
    const up: Pt = [S[0] - E[0], S[1] - E[1]];
    const a = Math.atan2(up[1], up[0]) + Math.PI / 2;
    // mirror when the forearm bends to the other side than drawn (drawn: toward the body)
    const fo: Pt = [W[0] - E[0], W[1] - E[1]];
    const cross = up[0] * fo[1] - up[1] * fo[0];
    const towardBodyDrawn = s === "L" ? -1 : 1;
    const flip = Math.sign(cross || 1) !== towardBodyDrawn && v !== "straight" ? -1 : 1;
    const co = Math.cos(a), si = Math.sin(a);
    const pv = p.pivot;
    const base: Affine = [flip, 0, 0, 1, pv[0] - flip * pv[0], 0];
    const rot: Affine = [co, si, -si, co, E[0] - co * pv[0] + si * pv[1], E[1] - si * pv[0] - co * pv[1]];
    return this.partItem(p, mulAff(rot, base), null);
  }

  private drawDebug() {
    const g = this.g;
    g.save();
    const m = this.view;
    g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    g.strokeStyle = "#e8305a"; g.lineWidth = 3 / m[0];
    for (const j of this.rig.joints) {
      if (!j.parent) continue;
      const a = this.rig.screen(j.name).p, b = this.rig.screen(j.parent).p;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    g.restore();
  }

  dispose(): void { this.cv?.remove(); for (const v of this.views ?? []) v.dispose(); }
}

function bboxOf(rings: Pt[][]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
/** The pose with the hips turned by `yaw` (radians) about the vertical axis (body views). */
function withHipsYaw(pose: Pose, yaw: number): Pose {
  if (!yaw) return pose;
  const r: Quat = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  return { ...pose, bones: { ...pose.bones, hips: quatMul(r, pose.bones.hips ?? IDENTITY) } };
}
const sub3 = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm3 = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };


